// ==========================================================
// DILIGÊNCIA 360 — Provedor de LLM gratuito com fallback em cadeia
// Todos os provedores abaixo operam em cota gratuita e falham com HTTP 429
// quando a cota diária termina. Nenhum deles cobra sem cartão cadastrado.
// ==========================================================

const { safeFetch } = require('../../utils/safeFetch');

const DEFAULT_TIMEOUT_MS = 45_000;

// A ordem define a preferência: latência, depois qualidade, depois reserva.
const PROVIDER_CATALOG = Object.freeze([
  {
    id: 'groq',
    label: 'Groq (gratuito)',
    baseUrl: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    envModel: 'GROQ_MODEL',
    // O catálogo da Groq muda: modelos são aposentados e passam a responder 404.
    // Confira o que a sua chave enxerga em GET https://api.groq.com/openai/v1/models
    // e ajuste GROQ_MODEL sem precisar mexer no código.
    defaultModel: 'openai/gpt-oss-120b',
    supportsJsonMode: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini AI Studio (gratuito)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GEMINI_API_KEY',
    envModel: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
    supportsJsonMode: true,
  },
  {
    id: 'github-models',
    label: 'GitHub Models (gratuito)',
    baseUrl: 'https://models.github.ai/inference',
    envKey: 'GITHUB_MODELS_TOKEN',
    envModel: 'GITHUB_MODELS_MODEL',
    defaultModel: 'openai/gpt-4.1-mini',
    supportsJsonMode: true,
  },
  {
    id: 'openrouter-free',
    label: 'OpenRouter (modelos :free)',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    envModel: 'OPENROUTER_MODEL',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    supportsJsonMode: false,
    // Trava de custo: a conta pode ter crédito, então só modelos ":free" passam.
    requireFreeModelSuffix: true,
  },
]);

function readKey(provider) {
  const value = String(process.env[provider.envKey] || '').trim();
  return value || null;
}

function readModel(provider) {
  const configured = String(process.env[provider.envModel] || '').trim();
  return configured || provider.defaultModel;
}

function isBillableModel(provider, model) {
  return provider.requireFreeModelSuffix === true && !String(model).endsWith(':free');
}

function describeProvider(provider) {
  const model = readModel(provider);
  const key = readKey(provider);
  const blockedByCostGuard = Boolean(key) && isBillableModel(provider, model);
  return {
    id: provider.id,
    label: provider.label,
    model,
    configured: Boolean(key) && !blockedByCostGuard,
    blockedByCostGuard,
    ...(blockedByCostGuard
      ? { message: `Modelo "${model}" não termina em ":free" e foi bloqueado para evitar consumo de crédito pago.` }
      : {}),
  };
}

function listProviders() {
  return PROVIDER_CATALOG.map(describeProvider);
}

function isConfigured() {
  return listProviders().some((provider) => provider.configured);
}

function extractContent(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  // Alguns provedores devolvem content em blocos.
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => (typeof block === 'string' ? block : block?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

async function callProvider(provider, { system, user, maxTokens, temperature, jsonMode, timeoutMs }) {
  const apiKey = readKey(provider);
  const model = readModel(provider);

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (jsonMode && provider.supportsJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await safeFetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    timeoutMs,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(
      response.status === 429
        ? 'Limite de requisições ou capacidade temporária atingido. Aguarde e tente novamente (HTTP 429).'
        : response.status === 404
          ? `Modelo sem endpoint disponível. Confira ${provider.envModel} e escolha um modelo gratuito disponível (HTTP 404).`
          : response.status === 401
            ? 'Chave recusada. Confira a variável de ambiente e faça novo deploy do backend (HTTP 401).'
            : response.status === 403
              ? 'Acesso recusado. Confira as permissões da chave e as configurações de privacidade do provedor (HTTP 403).'
              : response.status === 402
                ? 'O provedor bloqueou a solicitação por saldo ou limite de crédito. Confira o modelo gratuito e os limites da chave; não é necessário ativar recarga automática (HTTP 402).'
                : response.status === 400
                  ? 'O modelo recusou os parâmetros enviados (HTTP 400).'
                  : response.status === 503
                    ? 'O modelo está temporariamente indisponível (HTTP 503).'
            : `Resposta ${response.status} do provedor.`
    );
    error.status = response.status;
    error.detail = detail.slice(0, 400);
    throw error;
  }

  const payload = await response.json();
  const content = extractContent(payload);
  if (!content.trim()) {
    const error = new Error('O provedor devolveu uma resposta vazia.');
    error.status = 502;
    throw error;
  }

  return {
    content,
    providerId: provider.id,
    providerLabel: provider.label,
    model,
    usage: payload?.usage || null,
  };
}

/**
 * Executa a conversa no primeiro provedor gratuito disponível.
 * Não há retentativa dentro do mesmo provedor: cota esgotada cai direto
 * para o próximo da fila, preservando o saldo diário.
 */
async function chat({
  system,
  user,
  maxTokens = 3000,
  temperature = 0.1,
  jsonMode = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  freeOnly = false,
} = {}) {
  const attempts = [];

  for (const provider of PROVIDER_CATALOG) {
    if (freeOnly && !provider.requireFreeModelSuffix) continue;
    const apiKey = readKey(provider);
    if (!apiKey) continue;

    const model = readModel(provider);
    if (isBillableModel(provider, model)) {
      attempts.push({
        provider: provider.id,
        erro: `Bloqueado pela trava de custo: "${model}" não é um modelo :free.`,
      });
      continue;
    }

    try {
      const result = await callProvider(provider, { system, user, maxTokens, temperature, jsonMode, timeoutMs });
      return { ...result, attempts };
    } catch (err) {
      attempts.push({
        provider: provider.id,
        modelo: model,
        status: err.status || null,
        erro: err.message || 'Falha desconhecida.',
        ...(err.detail ? { detalhe: err.detail } : {}),
      });
    }
  }

  const error = new Error(
    attempts.length === 0
      ? 'Nenhum provedor de IA gratuito está configurado neste ambiente.'
      : attempts.map((attempt) => `${attempt.provider}: ${attempt.erro}`).join(' | ')
  );
  error.attempts = attempts;
  error.status = attempts.some((attempt) => attempt.status === 429) ? 429 : 503;
  throw error;
}

module.exports = {
  PROVIDER_CATALOG,
  chat,
  isConfigured,
  listProviders,
};
