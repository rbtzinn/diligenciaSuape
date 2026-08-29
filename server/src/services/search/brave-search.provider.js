// ==========================================================
// DILIGÊNCIA 360 — Brave Search (Web + News)
// Provedor autenticado, sem fallback implícito para outro motor.
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');

const ENDPOINTS = Object.freeze({
  web: 'https://api.search.brave.com/res/v1/web/search',
  news: 'https://api.search.brave.com/res/v1/news/search',
});

const LIMITS = Object.freeze({
  web: 20,
  news: 50,
  offset: 9,
});

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function providerIdFor(channel) {
  return channel === 'news' ? 'brave-news' : 'brave-web';
}

function providerNameFor(channel) {
  return channel === 'news' ? 'Brave News Search API' : 'Brave Web Search API';
}

function domainFromResult(result) {
  try {
    return new URL(result.url).hostname.replace(/^www\./i, '');
  } catch {
    return result.meta_url?.hostname
      || result.profile?.long_name
      || result.profile?.name
      || '';
  }
}

function normalizeResult(result, channel) {
  if (!result || typeof result !== 'object' || !result.url) return null;

  const extraSnippets = Array.isArray(result.extra_snippets)
    ? result.extra_snippets.filter((snippet) => typeof snippet === 'string' && snippet.trim())
    : [];
  const description = typeof result.description === 'string' ? result.description.trim() : '';
  const snippet = [description, ...extraSnippets]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' ');

  return {
    title: result.title || 'Sem título',
    url: result.url,
    domain: domainFromResult(result),
    snippet,
    publishedAt: result.page_age || result.age || result.published_time || undefined,
    providerSources: [providerIdFor(channel)],
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

class BraveSearchProvider extends SearchProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey
      ?? process.env.BRAVE_SEARCH_API_KEY
      ?? process.env.WEB_SEARCH_API_KEY
      ?? '';
    this.fetchImpl = options.fetchImpl || safeFetch;
    this.timeoutMs = clampInteger(options.timeoutMs, 12000, 1000, 30000);
    this.allowPersistentResults = options.allowPersistentResults
      ?? process.env.BRAVE_SEARCH_ALLOW_PERSISTENCE === 'true';
  }

  get id() {
    return 'brave';
  }

  get name() {
    return 'Brave Search API';
  }

  isConfigured() {
    return typeof this.apiKey === 'string' && this.apiKey.trim().length > 0;
  }

  allowsPersistentUse() {
    return this.allowPersistentResults === true;
  }

  supportsChannel(channel) {
    return channel === 'web' || channel === 'news';
  }

  async searchWeb({
    query,
    count = 10,
    channel = 'web',
    freshness,
    offset = 0,
    timeoutMs,
  } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'web').toLowerCase();

    if (!normalizedQuery) {
      return this.failure({
        channel: normalizedChannel,
        status: 400,
        erro: 'Consulta de busca vazia.',
      });
    }

    if (!this.supportsChannel(normalizedChannel)) {
      return this.failure({
        channel: normalizedChannel,
        status: 400,
        erro: `Canal de busca não suportado: ${normalizedChannel}.`,
      });
    }

    if (!this.isConfigured()) {
      return this.failure({
        channel: normalizedChannel,
        status: 503,
        erro: 'Brave Search API não configurada.',
      });
    }

    const requestedCount = clampInteger(count, 10, 1, LIMITS[normalizedChannel]);
    const requestedOffset = clampInteger(offset, 0, 0, LIMITS.offset);
    const requestTimeoutMs = clampInteger(timeoutMs, this.timeoutMs, 250, 30000);
    const provider = providerNameFor(normalizedChannel);
    const providerId = providerIdFor(normalizedChannel);
    const searchUrl = new URL(ENDPOINTS[normalizedChannel]);
    searchUrl.searchParams.set('q', normalizedQuery);
    searchUrl.searchParams.set('count', String(requestedCount));
    searchUrl.searchParams.set('search_lang', 'pt');
    searchUrl.searchParams.set('country', 'br');
    if (requestedOffset > 0) searchUrl.searchParams.set('offset', String(requestedOffset));
    if (freshness) searchUrl.searchParams.set('freshness', String(freshness));
    if (normalizedChannel === 'news') searchUrl.searchParams.set('extra_snippets', 'true');

    try {
      const response = await this.fetchImpl(searchUrl.toString(), {
        timeoutMs: requestTimeoutMs,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        return this.failure({
          channel: normalizedChannel,
          status: response.status || 502,
          erro: detail
            ? `Brave Search respondeu com erro: ${detail}`
            : `Brave Search respondeu com HTTP ${response.status || 502}.`,
        });
      }

      let data;
      try {
        data = await response.json();
      } catch {
        return this.failure({
          channel: normalizedChannel,
          status: 502,
          erro: 'Brave Search retornou JSON inválido.',
        });
      }

      const rawResults = normalizedChannel === 'news'
        ? (Array.isArray(data?.results) ? data.results : [])
        : (Array.isArray(data?.web?.results) ? data.web.results : []);
      const results = rawResults
        .map((result) => normalizeResult(result, normalizedChannel))
        .filter(Boolean);
      const moreResultsAvailable = data?.query?.more_results_available;
      const hasMore = typeof moreResultsAvailable === 'boolean'
        ? moreResultsAvailable
        : results.length >= requestedCount && requestedOffset < LIMITS.offset;
      const attempt = {
        provider,
        providerId,
        channel: normalizedChannel,
        ok: true,
        status: response.status || 200,
        resultCount: results.length,
      };

      return {
        ok: true,
        status: response.status || 200,
        provider,
        providerSources: [providerId],
        totalFound: results.length,
        results,
        attempts: [attempt],
        partial: false,
        hasMore,
      };
    } catch (error) {
      const isTimeout = /timeout|tempo limite/i.test(error?.message || '');
      return this.failure({
        channel: normalizedChannel,
        status: isTimeout ? 504 : 502,
        erro: isTimeout
          ? 'Tempo limite excedido ao consultar Brave Search.'
          : `Falha ao consultar Brave Search: ${error?.message || 'erro desconhecido'}.`,
      });
    }
  }

  failure({ channel, status, erro }) {
    const safeChannel = channel === 'news' ? 'news' : 'web';
    const provider = providerNameFor(safeChannel);
    const providerId = providerIdFor(safeChannel);

    return {
      ok: false,
      status,
      erro,
      provider,
      providerSources: [providerId],
      totalFound: 0,
      results: [],
      attempts: [{
        provider,
        providerId,
        channel: safeChannel,
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
  BraveSearchProvider,
  ENDPOINTS,
};
