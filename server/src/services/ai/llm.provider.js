// ==========================================================
// DILIGÊNCIA 360 — Provedor de LLM gratuito com fallback em cadeia
// O modo freeOnly restringe chamadas ao OpenRouter com seleção gratuita.
// Os demais provedores dependem do plano e dos limites configurados na conta.
// ==========================================================

const { safeFetch } = require('../../utils/safeFetch');
const { withDeadline } = require('../../utils/deadline');

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
    label: 'OpenRouter (modelos gratuitos)',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    envModel: 'OPENROUTER_MODEL',
    defaultModel: 'openrouter/free',
    // O roteador filtra os modelos gratuitos por suporte a saída JSON.
    supportsJsonMode: true,
    // Aceita somente variantes :free ou o roteador exclusivamente gratuito.
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
  return provider.requireFreeModelSuffix === true
    && model !== 'openrouter/free'
    && !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+:free$/.test(String(model));
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
      ? { message: `Modelo "${model}" não é openrouter/free nem uma variante ":free" e foi bloqueado para evitar consumo de crédito pago.` }
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

function providerError(status, retryAfter) {
  const messages = {
    400: 'O OpenRouter recusou os parâmetros da solicitação.',
    401: 'Chave da IA recusada. Confira OPENROUTER_API_KEY no backend.',
    402: 'OpenRouter bloqueou a solicitação por saldo ou limite da chave. A pesquisa gratuita foi interrompida.',
    403: 'OpenRouter recusou o acesso. Confira as permissões e políticas de privacidade da conta.',
    404: 'Nenhum endpoint gratuito compatível está disponível para o modelo selecionado.',
    429: 'Cota ou limite temporário da IA atingido. A pesquisa foi pausada.',
    502: 'O provedor da IA devolveu uma resposta inválida.',
    503: 'Os modelos gratuitos estão temporariamente indisponíveis.',
    504: 'O modelo não respondeu dentro do tempo disponível.',
  };
  const error = new Error(messages[status] || `Falha no provedor da IA (HTTP ${status}).`);
  error.status = status;
  error.code = status === 429 ? 'AI_RATE_LIMIT' : `AI_HTTP_${status}`;
  error.retryAfterSeconds = retryAfter || undefined;
  return error;
}

function retryAfterSeconds(value) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, Math.ceil(seconds))
    : Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 1000)) || 0;
}

async function callProvider(provider, options) {
  const { system, user, maxTokens, temperature, jsonMode, jsonSchema, timeoutMs, signal, validateContent } = options;
  const model = options.model || readModel(provider);
  const body = {
    model, temperature, max_tokens: maxTokens, stream: false,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (jsonMode && provider.supportsJsonMode) {
    body.response_format = jsonSchema
      ? { type: 'json_schema', json_schema: { name: 'news_queries', strict: true, schema: jsonSchema } }
      : { type: 'json_object' };
  }
  if (provider.id === 'openrouter-free') {
    // Both the model allowlist and server-side price ceiling must allow a call.
    body.provider = { require_parameters: true, max_price: { prompt: 0, completion: 0, request: 0 } };
  }

  return withDeadline(timeoutMs, async (requestSignal) => {
    const response = await safeFetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST', timeoutMs, signal: requestSignal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${readKey(provider)}` },
      body: JSON.stringify(body),
    });
    const wait = retryAfterSeconds(response.headers?.get?.('retry-after'));
    // Errors can arrive in the JSON body even after HTTP 200 headers.
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      const code = Number(payload?.error?.code);
      const typedStatus = { rate_limit_exceeded: 429, authentication: 401, permission_denied: 403,
        payment_required: 402, content_policy_violation: 403, refusal: 403 }[payload?.error?.metadata?.error_type];
      const status = typedStatus || (code >= 400 && code <= 599 ? code : response.ok ? 502 : response.status);
      throw providerError(status, wait);
    }
    const choice = payload?.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') throw providerError(403);
    if (choice?.finish_reason === 'length') {
      const error = providerError(502);
      error.code = 'AI_TRUNCATED';
      error.message = 'A resposta da IA foi interrompida antes de terminar.';
      throw error;
    }
    if (choice?.finish_reason === 'error') throw providerError(502);
    const content = extractContent(payload);
    if (!content.trim()) throw providerError(502);
    // JSON formatting alone does not prove that the content meets our contract.
    if (validateContent) validateContent(content);
    return {
      content, providerId: provider.id, providerLabel: provider.label,
      model: payload.model || model, usage: payload?.usage || null,
    };
  }, signal);
}

async function chat({
  system, user, maxTokens = 3000, temperature = 0.1, jsonMode = false,
  jsonSchema, validateContent, timeoutMs = DEFAULT_TIMEOUT_MS, freeOnly = false, signal,
} = {}) {
  const attempts = [];
  const deadlineAt = Date.now() + Math.min(timeoutMs, DEFAULT_TIMEOUT_MS);
  let lastError;
  for (const provider of PROVIDER_CATALOG) {
    if (freeOnly && provider.id !== 'openrouter-free') continue;
    if (!readKey(provider)) continue;
    const configuredModel = readModel(provider);
    if (isBillableModel(provider, configuredModel)) {
      lastError = new Error('Modelo bloqueado pela trava de custo. Use OPENROUTER_MODEL=openrouter/free ou uma variante :free.');
      lastError.status = 503;
      lastError.code = 'AI_COST_GUARD';
      attempts.push({ provider: provider.id, erro: lastError.message });
      continue;
    }
    const maxAttempts = provider.id === 'openrouter-free' ? 2 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0 || signal?.aborted) break;
      const model = attempt ? 'openrouter/free' : configuredModel;
      // If schema routing has no endpoints, JSON mode is still validated locally.
      const schema = attempt && [400, 404].includes(lastError?.status) ? undefined : jsonSchema;
      try {
        const result = await callProvider(provider, {
          system, user, model, maxTokens: attempt && lastError?.code === 'AI_TRUNCATED' ? Math.min(maxTokens * 2, 6000) : maxTokens,
          temperature, jsonMode, jsonSchema: schema, validateContent, signal,
          timeoutMs: maxAttempts === 2 && !attempt ? Math.min(22_000, Math.max(1, remaining / 2)) : remaining,
        });
        return { ...result, attempts };
      } catch (error) {
        lastError = error;
        attempts.push({ provider: provider.id, modelo: model, status: error.status || 502, erro: error.message });
        // Do not retry quota/auth/payment/policy errors or bypass Retry-After.
        if (signal?.aborted || [401, 402, 403, 429].includes(error.status) || error.retryAfterSeconds > 0) break;
        if (error.status && ![400, 404, 408, 422, 500, 502, 503, 504].includes(error.status)) break;
      }
    }
  }
  const error = lastError || new Error('Nenhum provedor de IA está configurado neste ambiente.');
  error.status ||= 503;
  error.attempts = attempts;
  throw error;
}

module.exports = { PROVIDER_CATALOG, chat, isConfigured, listProviders };
