// ==========================================================
// DILIGÊNCIA 360 — Google Programmable Search Engine (PSE)
// ==========================================================
// API oficial, com chave, plano gratuito de 100 consultas por dia e sem
// exigência de cartão de crédito. Substitui o scraping do DuckDuckGo Lite
// no canal web, que passou a ser bloqueado por detecção de automação.
//
// O teto diário é baixo e a cota é da conta, não da diligência. Quando ela
// acaba a API responde 429, e o erro precisa chegar ao dossiê como fonte
// indisponível — nunca como "consultado e nada encontrado".
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');

const PROVIDER_ID = 'google-cse';
const PROVIDER_NAME = 'Google Programmable Search';
const ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

// Limite da própria API: 10 itens por chamada, offset máximo 100.
const MAX_RESULTS_PER_CALL = 10;
const MAX_OFFSET = 90;

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function domainFromUrl(value) {
  try {
    return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizePublishedAt(item) {
  const metatags = item?.pagemap?.metatags;
  const candidates = [
    item?.pagemap?.newsarticle?.[0]?.datepublished,
    Array.isArray(metatags) ? metatags[0]?.['article:published_time'] : undefined,
    Array.isArray(metatags) ? metatags[0]?.['og:updated_time'] : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return undefined;
}

function normalizeResult(item) {
  const url = String(item?.link || '').trim();
  const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
  if (!url || !title) return null;

  const domain = domainFromUrl(url);
  if (!domain) return null;

  return {
    title,
    url,
    domain,
    snippet: String(item?.snippet || '').replace(/\s+/g, ' ').trim(),
    publishedAt: normalizePublishedAt(item),
    providerSources: [PROVIDER_ID],
  };
}

class GoogleCseProvider extends SearchProvider {
  constructor(options = {}) {
    super();
    this.apiKey = String(options.apiKey ?? process.env.GOOGLE_CSE_API_KEY ?? '').trim();
    this.searchEngineId = String(options.searchEngineId ?? process.env.GOOGLE_CSE_CX ?? '').trim();
    this.fetchImpl = options.fetchImpl || safeFetch;
    this.timeoutMs = clampInteger(options.timeoutMs ?? process.env.GOOGLE_CSE_TIMEOUT_MS, 10000, 1000, 30000);
    this.language = String(options.language ?? process.env.GOOGLE_CSE_LANGUAGE ?? 'lang_pt').trim();
    this.country = String(options.country ?? process.env.GOOGLE_CSE_COUNTRY ?? 'countryBR').trim();
  }

  get id() {
    return PROVIDER_ID;
  }

  get name() {
    return PROVIDER_NAME;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.searchEngineId);
  }

  // O canal de notícias já tem Google News RSS e GDELT, que não gastam cota.
  // Reservar o PSE ao canal web preserva o teto diário para as consultas
  // institucionais, que são as que dependem exclusivamente dele.
  supportsChannel(channel) {
    return channel === 'web';
  }

  failure(status, erro, channel = 'web') {
    return {
      ok: false,
      status,
      erro,
      provider: PROVIDER_NAME,
      providerSources: [PROVIDER_ID],
      totalFound: 0,
      results: [],
      attempts: [{
        provider: PROVIDER_NAME,
        providerId: PROVIDER_ID,
        channel,
        ok: false,
        status,
        resultCount: 0,
        erro,
      }],
      partial: false,
      hasMore: false,
    };
  }

  buildUrl({ query, count, offset }) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('cx', this.searchEngineId);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(count));
    if (offset > 0) url.searchParams.set('start', String(offset + 1));
    if (this.language) url.searchParams.set('lr', this.language);
    if (this.country) url.searchParams.set('cr', this.country);
    return url;
  }

  async searchWeb({ query, count = 10, channel = 'web', offset = 0, timeoutMs } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'web').toLowerCase();

    if (!normalizedQuery) return this.failure(400, 'Consulta de busca vazia.', normalizedChannel);
    if (!this.supportsChannel(normalizedChannel)) {
      return this.failure(400, `Canal de busca não suportado: ${normalizedChannel}.`, normalizedChannel);
    }
    if (!this.isConfigured()) {
      return this.failure(
        503,
        'Google Programmable Search não configurado. Defina GOOGLE_CSE_API_KEY e GOOGLE_CSE_CX.',
        normalizedChannel,
      );
    }

    const requestedCount = clampInteger(count, 10, 1, MAX_RESULTS_PER_CALL);
    const requestOffset = clampInteger(offset, 0, 0, MAX_OFFSET);
    const requestTimeoutMs = clampInteger(timeoutMs, this.timeoutMs, 250, 30000);

    try {
      const response = await this.fetchImpl(
        this.buildUrl({ query: normalizedQuery, count: requestedCount, offset: requestOffset }).toString(),
        { timeoutMs: requestTimeoutMs, headers: { Accept: 'application/json' } },
      );

      if (!response?.ok) {
        const status = response?.status || 502;
        // 429 é cota diária esgotada; 403 costuma ser API não habilitada
        // no projeto ou chave restrita a outro referenciador.
        const erro = status === 429
          ? 'Cota diária gratuita do Google Programmable Search esgotada. O canal web fica indisponível até o próximo ciclo.'
          : status === 403
            ? 'Google Programmable Search recusou a chave. Verifique se a Custom Search API está habilitada e se a chave não tem restrição de origem.'
            : `Google Programmable Search respondeu com HTTP ${status}.`;
        return this.failure(status, erro, normalizedChannel);
      }

      const payload = await response.json();

      // Zero resultado aqui é resposta legítima da API, diferente de falha:
      // o campo items simplesmente não vem quando nada casa com a consulta.
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const results = items.map(normalizeResult).filter(Boolean);
      const totalFound = Number.parseInt(payload?.searchInformation?.totalResults, 10);

      return {
        ok: true,
        status: response.status || 200,
        provider: PROVIDER_NAME,
        providerSources: [PROVIDER_ID],
        totalFound: Number.isFinite(totalFound) ? totalFound : results.length,
        results,
        attempts: [{
          provider: PROVIDER_NAME,
          providerId: PROVIDER_ID,
          channel: normalizedChannel,
          ok: true,
          status: response.status || 200,
          resultCount: results.length,
        }],
        partial: false,
        hasMore: Boolean(payload?.queries?.nextPage?.length) && requestOffset < MAX_OFFSET,
      };
    } catch (error) {
      const isTimeout = /timeout|tempo limite/i.test(error?.message || '');
      return this.failure(
        isTimeout ? 504 : 502,
        isTimeout
          ? 'Tempo limite esgotado ao consultar o Google Programmable Search.'
          : `Falha ao consultar o Google Programmable Search: ${error?.message || 'erro desconhecido'}.`,
        normalizedChannel,
      );
    }
  }
}

module.exports = { GoogleCseProvider, normalizeResult };
