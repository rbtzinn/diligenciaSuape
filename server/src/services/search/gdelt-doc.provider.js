// ==========================================================
// DILIGÊNCIA 360 — GDELT DOC 2.0
// Fonte pública complementar para descoberta de notícias.
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');

const PROVIDER_ID = 'gdelt-doc';
const PROVIDER_NAME = 'GDELT DOC 2.0';
const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const MAX_RECORDS = 250;

const FRESHNESS_TIMESPANS = Object.freeze({
  pd: '1d',
  pw: '1week',
  pm: '1month',
  py: '1year',
});

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function gdeltTimespan(freshness) {
  const normalized = String(freshness || '').trim().toLowerCase();
  if (!normalized) return '';
  if (FRESHNESS_TIMESPANS[normalized]) return FRESHNESS_TIMESPANS[normalized];

  // Permite que o orquestrador envie diretamente um timespan aceito pelo
  // GDELT, sem repassar texto arbitrário para a URL.
  if (/^\d+(?:min|mins|h|hour|hours|d|day|days|week|weeks|month|months|year|years)$/.test(normalized)) {
    return normalized;
  }
  return '';
}

function normalizeSeenDate(value) {
  const raw = String(value || '').trim();
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i.exec(raw);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`;
  }

  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : raw || undefined;
}

function domainFromArticle(article) {
  const declaredDomain = String(article?.domain || '').trim().toLowerCase().replace(/^www\./i, '');
  if (declaredDomain) return declaredDomain;

  try {
    return new URL(article.url).hostname.toLowerCase().replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function normalizeArticle(article) {
  if (!article || typeof article !== 'object') return null;
  const url = typeof article.url === 'string' ? article.url.trim() : '';
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  const domain = domainFromArticle(article);
  const seenDate = String(article.seendate || '').trim() || undefined;
  return {
    title: String(article.title || '').trim() || 'Sem título',
    url,
    domain,
    snippet: '',
    publishedAt: normalizeSeenDate(seenDate),
    seenDate,
    sourceName: domain || undefined,
    language: String(article.language || '').trim() || undefined,
    sourceCountry: String(article.sourcecountry || '').trim() || undefined,
    socialImage: String(article.socialimage || '').trim() || undefined,
    mobileUrl: String(article.url_mobile || '').trim() || undefined,
    providerSources: [PROVIDER_ID],
  };
}

async function readErrorMessage(response) {
  try {
    const body = await response.text();
    if (!body) return '';

    try {
      const parsed = JSON.parse(body);
      return parsed.message || parsed.error?.message || parsed.error || '';
    } catch {
      return body.replace(/\s+/g, ' ').trim().slice(0, 240);
    }
  } catch {
    return '';
  }
}

class GdeltDocProvider extends SearchProvider {
  constructor(options = {}) {
    super();
    this.fetchImpl = options.fetchImpl || safeFetch;
    this.timeoutMs = clampInteger(options.timeoutMs, 12000, 1000, 30000);
  }

  get id() {
    return PROVIDER_ID;
  }

  get name() {
    return PROVIDER_NAME;
  }

  isConfigured() {
    return true;
  }

  supportsChannel(channel) {
    return channel === 'news';
  }

  async searchWeb({
    query,
    count = 10,
    channel = 'news',
    freshness,
    timeoutMs,
    signal,
  } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'news').toLowerCase();
    if (!normalizedQuery) return this.failure(400, 'Consulta de busca vazia.', normalizedChannel);
    if (!this.supportsChannel(normalizedChannel)) {
      return this.failure(400, `Canal de busca não suportado: ${normalizedChannel}.`, normalizedChannel);
    }

    const requestedCount = clampInteger(count, 10, 1, MAX_RECORDS);
    const requestTimeoutMs = clampInteger(timeoutMs, this.timeoutMs, 250, 30000);
    const searchUrl = new URL(ENDPOINT);
    searchUrl.searchParams.set('query', normalizedQuery);
    searchUrl.searchParams.set('mode', 'ArtList');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('maxrecords', String(requestedCount));
    searchUrl.searchParams.set('sort', 'HybridRel');
    const timespan = gdeltTimespan(freshness) || '1year';
    if (timespan) searchUrl.searchParams.set('timespan', timespan);

    try {
      const response = await this.fetchImpl(searchUrl.toString(), {
        timeoutMs: requestTimeoutMs,
        signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return this.failure(
          response.status || 502,
          detail
            ? `GDELT DOC respondeu com erro: ${detail}`
            : `GDELT DOC respondeu com HTTP ${response.status || 502}.`,
          normalizedChannel,
        );
      }

      let data;
      try {
        data = await response.json();
      } catch {
        return this.failure(502, 'GDELT DOC retornou JSON inválido.', normalizedChannel);
      }

      if (data?.error) {
        const detail = typeof data.error === 'string'
          ? data.error
          : data.error.message || JSON.stringify(data.error);
        return this.failure(502, `GDELT DOC respondeu com erro: ${detail}`, normalizedChannel);
      }
      if (!Array.isArray(data?.articles)) {
        return this.failure(502, 'GDELT DOC retornou uma resposta sem a lista de artigos.', normalizedChannel);
      }

      const results = data.articles
        .map(normalizeArticle)
        .filter(Boolean);
      const attempt = {
        provider: PROVIDER_NAME,
        providerId: PROVIDER_ID,
        channel: normalizedChannel,
        ok: true,
        status: response.status || 200,
        resultCount: results.length,
      };

      return {
        ok: true,
        status: response.status || 200,
        provider: PROVIDER_NAME,
        providerSources: [PROVIDER_ID],
        totalFound: results.length,
        results,
        attempts: [attempt],
        partial: false,
        hasMore: data.articles.length >= requestedCount && requestedCount < MAX_RECORDS,
      };
    } catch (error) {
      const isTimeout = /timeout|tempo limite/i.test(error?.message || '');
      return this.failure(
        isTimeout ? 504 : 502,
        isTimeout
          ? 'Tempo limite excedido ao consultar GDELT DOC.'
          : `Falha ao consultar GDELT DOC: ${error?.message || 'erro desconhecido'}.`,
        normalizedChannel,
      );
    }
  }

  failure(status, erro, channel = 'news') {
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
  GdeltDocProvider,
  ENDPOINT,
  gdeltTimespan,
  normalizeArticle,
  normalizeSeenDate,
};


