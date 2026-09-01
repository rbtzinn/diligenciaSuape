// ==========================================================
// DILIGÊNCIA 360 — SearXNG
// Metabusca aberta (web e notícias) sem chave proprietária.
// Requer instância própria ou confiável em SEARXNG_BASE_URL.
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');

const PROVIDER_ID = 'searxng';
const PROVIDER_NAME = 'SearXNG (metabusca aberta)';
const MAX_RESULTS_PER_PAGE = 20;

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function domainFromUrl(value) {
  try {
    return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizePublishedAt(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeResult(item) {
  const url = String(item?.url || '').trim();
  const title = String(item?.title || '').replace(/\s+/g, ' ').trim();
  if (!url || !title) return null;

  const domain = domainFromUrl(url);
  if (!domain) return null;

  const snippet = String(item?.content || '').replace(/\s+/g, ' ').trim();
  const engines = Array.isArray(item?.engines) ? item.engines.filter(Boolean).map(String) : [];

  return {
    title,
    url,
    domain,
    snippet: snippet || title,
    publishedAt: normalizePublishedAt(item?.publishedDate),
    sourceName: engines.length > 0 ? `SearXNG: ${engines.join(', ')}` : PROVIDER_NAME,
    providerSources: [PROVIDER_ID],
  };
}

class SearxngProvider extends SearchProvider {
  constructor(options = {}) {
    super();
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.SEARXNG_BASE_URL);
    this.fetchImpl = options.fetchImpl || safeFetch;
    this.timeoutMs = clampInteger(options.timeoutMs ?? process.env.SEARXNG_TIMEOUT_MS, 12000, 1000, 30000);
    this.language = String(options.language ?? process.env.SEARXNG_LANGUAGE ?? 'pt-BR').trim() || 'pt-BR';
    this.engines = String(options.engines ?? process.env.SEARXNG_ENGINES ?? '').trim();
  }

  get id() {
    return PROVIDER_ID;
  }

  get name() {
    return PROVIDER_NAME;
  }

  isConfigured() {
    return this.baseUrl.length > 0;
  }

  supportsChannel(channel) {
    return channel === 'web' || channel === 'news';
  }

  buildUrl({ query, channel, offset, count }) {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', this.language);
    url.searchParams.set('safesearch', '0');
    url.searchParams.set('categories', channel === 'news' ? 'news' : 'general');
    if (this.engines) url.searchParams.set('engines', this.engines);

    const pageSize = Math.max(1, Math.min(count, MAX_RESULTS_PER_PAGE));
    const page = Math.floor(Math.max(0, offset) / pageSize) + 1;
    url.searchParams.set('pageno', String(page));
    return url;
  }

  async searchWeb({
    query,
    count = 10,
    channel = 'web',
    offset = 0,
    timeoutMs,
  } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'web').toLowerCase();

    if (!normalizedQuery) return this.failure(400, 'Consulta de busca vazia.', normalizedChannel);
    if (!this.supportsChannel(normalizedChannel)) {
      return this.failure(400, `Canal de busca não suportado: ${normalizedChannel}.`, normalizedChannel);
    }
    if (!this.isConfigured()) {
      return this.failure(
        503,
        'SearXNG não configurado. Defina SEARXNG_BASE_URL com uma instância própria.',
        normalizedChannel,
      );
    }

    const requestedCount = clampInteger(count, 10, 1, 100);
    const requestTimeoutMs = clampInteger(timeoutMs, this.timeoutMs, 250, 30000);
    const searchUrl = this.buildUrl({
      query: normalizedQuery,
      channel: normalizedChannel,
      offset: Number(offset) || 0,
      count: requestedCount,
    });

    try {
      const response = await this.fetchImpl(searchUrl.toString(), {
        timeoutMs: requestTimeoutMs,
        headers: { Accept: 'application/json' },
      });

      if (!response?.ok) {
        return this.failure(
          response?.status || 502,
          `SearXNG respondeu com HTTP ${response?.status || 502}. Confirme se o formato JSON está habilitado na instância.`,
          normalizedChannel,
        );
      }

      let data;
      try {
        data = await response.json();
      } catch {
        return this.failure(502, 'SearXNG retornou JSON inválido.', normalizedChannel);
      }

      if (!Array.isArray(data?.results)) {
        return this.failure(502, 'SearXNG retornou uma resposta sem lista de resultados.', normalizedChannel);
      }

      const results = data.results.map(normalizeResult).filter(Boolean).slice(0, requestedCount);

      return {
        ok: true,
        status: response.status || 200,
        provider: PROVIDER_NAME,
        providerSources: [PROVIDER_ID],
        totalFound: Number(data.number_of_results) || results.length,
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
        hasMore: data.results.length >= requestedCount,
      };
    } catch (error) {
      const isTimeout = /timeout|tempo limite/i.test(error?.message || '');
      return this.failure(
        isTimeout ? 504 : 502,
        isTimeout
          ? 'Tempo limite excedido ao consultar SearXNG.'
          : `Falha ao consultar SearXNG: ${error?.message || 'erro desconhecido'}.`,
        normalizedChannel,
      );
    }
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
}

module.exports = {
  SearxngProvider,
  normalizeBaseUrl,
  normalizeResult,
};
