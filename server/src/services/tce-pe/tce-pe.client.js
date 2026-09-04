// ==========================================================
// DILIGÊNCIA 360 — Transporte dos Dados Abertos do TCE-PE
// ==========================================================
// API pública, gratuita e sem chave: sistemas.tce.pe.gov.br/DadosAbertos
//
// Extraído de `tce-pe.service.js`, que já tratava corretamente o charset e o
// envelope da API. A extração acontece porque os adaptadores de contratos,
// aditivos, licitações, obras e despesas precisam exatamente do mesmo
// transporte — e duplicar o decodificador significaria reintroduzir, em cinco
// lugares, o defeito de acentuação que já custou uma correção.
//
// O que este módulo faz e o que deliberadamente não faz:
//   FAZ  — decodifica o charset declarado, desembrulha o envelope, controla
//          timeout, contabiliza truncamento e serve cache por consulta.
//   NÃO  — não interpreta conteúdo, não resolve identidade e não decide
//          `sourceStatus`. Ele reporta o que aconteceu; quem classifica é a
//          camada de inteligência, com o vocabulário da Fase 2.
// ==========================================================

const crypto = require('crypto');
const { safeFetch } = require('../../utils/safeFetch');

const BASE_URL = process.env.TCE_PE_BASE_URL || 'https://sistemas.tce.pe.gov.br/DadosAbertos';

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

const REQUEST_TIMEOUT_MS = envInt('TCE_PE_TIMEOUT_MS', 20_000, 5_000, 45_000);
const CACHE_TTL_MS = envInt('TCE_PE_CACHE_TTL_MS', 15 * 60 * 1000, 60_000, 6 * 60 * 60 * 1000);
// Nenhum endpoint dos Dados Abertos do TCE-PE documenta paginação, e nenhum
// aceita parâmetro de página: a resposta vem inteira. Um CNPJ ativo devolve
// mais de mil linhas de despesa. O teto abaixo protege memória e tempo, e todo
// corte é declarado — a alternativa seria processar tudo ou, pior, cortar em
// silêncio e apresentar o recorte como se fosse a base completa.
const MAX_ROWS_PER_QUERY = envInt('TCE_PE_MAX_ROWS', 500, 50, 5_000);

/** Cache em memória, por consulta. Sem infraestrutura externa: o custo é R$ 0. */
const responseCache = new Map();

/**
 * Chave de cache. Inclui método e parâmetros normalizados para que a resposta
 * de uma empresa nunca seja servida para outra — a ordem das chaves é
 * estabilizada porque `{CPF_CNPJ, Ano}` e `{Ano, CPF_CNPJ}` são a mesma consulta.
 */
function cacheKey(method, params) {
  const normalized = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
    .map(([key, value]) => [String(key).toUpperCase(), String(value).trim()])
    .sort(([left], [right]) => left.localeCompare(right));
  return crypto.createHash('sha256')
    .update(JSON.stringify([method, normalized]))
    .digest('hex')
    .slice(0, 32);
}

/**
 * O TCE-PE responde `application/json;charset=ISO-8859-1`, mas `response.json()`
 * decodifica sempre como UTF-8. Lido assim, todo acento vira caractere de
 * substituição: "Embargos de Declaração" chega como "Embargos de Declara??o", e
 * o defeito segue para o dossiê, para o PDF assinado e para o pacote enviado à
 * IA — inclusive em nome de município e de órgão.
 *
 * A leitura passa pelo buffer bruto, decodificando conforme o charset declarado
 * na resposta. Só ISO-8859-1 e UTF-8 aparecem nesta API; qualquer outro valor
 * cai em UTF-8, que é o padrão de JSON.
 */
function decodeByCharset(buffer, contentType) {
  const declared = /charset=([\w-]+)/i.exec(String(contentType || ''));
  const charset = (declared?.[1] || 'utf-8').toLowerCase();
  const isLatin1 = charset === 'iso-8859-1' || charset === 'latin1' || charset === 'windows-1252';
  return buffer.toString(isLatin1 ? 'latin1' : 'utf8');
}

/**
 * Desembrulha o envelope `{ resposta: { status, conteudo } }`.
 *
 * Status diferente de OK é falha estrutural e precisa lançar: devolver lista
 * vazia transformaria "a API mudou de formato" em "a empresa não tem registro",
 * que é a confusão que a Fase 2 existe para impedir.
 */
function rowsFromResponse(payload, method) {
  const response = payload?.resposta;
  if (!response || response.status !== 'OK') {
    const error = new Error(`TCE-PE retornou formato inválido em ${method}.`);
    error.kind = 'INVALID_RESPONSE';
    throw error;
  }
  if (!response.conteudo) return [];
  return Array.isArray(response.conteudo) ? response.conteudo : [response.conteudo];
}

function buildUrl(method, params) {
  const search = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params || {}).filter(
        ([, value]) => value !== undefined && value !== null && String(value) !== '',
      ),
    ),
  );
  return `${BASE_URL}/${method}!json?${search}`;
}

/**
 * Executa uma consulta e devolve o resultado com toda a proveniência.
 *
 * Nunca lança por falha de rede: devolve `ok: false` com a natureza do erro,
 * para que a camada acima escolha entre UNAVAILABLE e ERROR sem precisar
 * interpretar mensagem de exceção.
 *
 * @param {string} method método dos Dados Abertos (ex.: 'Contratos').
 * @param {object} params parâmetros documentados do método.
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRows] teto local de linhas processadas.
 * @param {boolean} [options.forceRefresh] ignora o cache.
 */
async function queryDataset(method, params = {}, options = {}) {
  const {
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxRows = MAX_ROWS_PER_QUERY,
    forceRefresh = false,
  } = options;

  const url = buildUrl(method, params);
  const key = cacheKey(method, params);
  const retrievedAt = new Date().toISOString();

  const cached = responseCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cached: true };
  }

  let response;
  try {
    response = await safeFetch(url, { headers: { Accept: 'application/json' }, timeoutMs });
  } catch (error) {
    // safeFetch converte AbortError em mensagem de timeout. Rede indisponível e
    // timeout são a mesma conclusão para quem lê: não foi possível consultar.
    return {
      ok: false,
      kind: 'UNAVAILABLE',
      method,
      params,
      url,
      rows: [],
      totalRows: 0,
      truncated: false,
      retrievedAt,
      erro: error.message,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      // 5xx e 429 são instabilidade; 4xx é a fonte recusando a consulta.
      kind: response.status >= 500 || response.status === 429 ? 'UNAVAILABLE' : 'HTTP_ERROR',
      httpStatus: response.status,
      method,
      params,
      url,
      rows: [],
      totalRows: 0,
      truncated: false,
      retrievedAt,
      erro: `TCE-PE retornou HTTP ${response.status}.`,
    };
  }

  let rows;
  let totalRows;
  try {
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = decodeByCharset(buffer, response.headers?.get?.('content-type'));
    const payload = JSON.parse(text);
    const all = rowsFromResponse(payload, method);
    totalRows = all.length;
    rows = all.slice(0, maxRows);
  } catch (error) {
    return {
      ok: false,
      kind: 'INVALID_RESPONSE',
      method,
      params,
      url,
      rows: [],
      totalRows: 0,
      truncated: false,
      retrievedAt,
      erro: error.message || `TCE-PE retornou conteúdo ilegível em ${method}.`,
    };
  }

  const result = {
    ok: true,
    kind: 'OK',
    method,
    params,
    url,
    rows,
    totalRows,
    // Truncamento declarado. A camada acima o converte em PARTIAL.
    truncated: totalRows > rows.length,
    retrievedAt,
  };

  responseCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Endereço público do registro, para a evidência apontar de volta à fonte. */
function datasetUrl(method, params = {}) {
  return buildUrl(method, params);
}

/** Limpa o cache. Existe para o teste isolar cenários. */
function clearCache() {
  responseCache.clear();
}

module.exports = {
  BASE_URL,
  MAX_ROWS_PER_QUERY,
  queryDataset,
  datasetUrl,
  decodeByCharset,
  rowsFromResponse,
  cacheKey,
  clearCache,
};
