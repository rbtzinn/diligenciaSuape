// ==========================================================
// DILIGÊNCIA 360 — Busca composta
// Executa provedores aplicáveis em paralelo e consolida fontes.
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { BraveSearchProvider } = require('./brave-search.provider');
const { GoogleNewsRssProvider } = require('./google-news-rss.provider');
const { GdeltDocProvider } = require('./gdelt-doc.provider');
const { SearxngProvider } = require('./searxng.provider');
const { GoogleCseProvider } = require('./google-cse.provider');
const { DuckDuckGoLiteProvider } = require('./duckduckgo-lite.provider');

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
]);

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function canonicalizeUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw;

    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./i, '');
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }

    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.startsWith('utm_') || TRACKING_PARAMS.has(normalizedKey)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');

    return url.toString();
  } catch {
    return raw;
  }
}

function titleFingerprint(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function providerIdentity(provider) {
  return provider.id || provider.name || provider.constructor?.name || 'provedor-desconhecido';
}

function responseSources(response, provider) {
  const sources = Array.isArray(response?.providerSources) ? response.providerSources : [];
  if (sources.length > 0) return [...new Set(sources.filter(Boolean))];
  return [providerIdentity(provider)].filter(Boolean);
}

function normalizeAttempt(attempt, provider, channel, response) {
  return {
    provider: attempt?.provider || response?.provider || provider.name || providerIdentity(provider),
    providerId: attempt?.providerId || providerIdentity(provider),
    channel: attempt?.channel || channel,
    ok: Boolean(attempt?.ok ?? response?.ok),
    status: attempt?.status || response?.status || (response?.ok ? 200 : 502),
    resultCount: Number(attempt?.resultCount ?? response?.results?.length ?? 0),
    ...(attempt?.erro || response?.erro ? { erro: attempt?.erro || response?.erro } : {}),
    ...(attempt?.skipped ? { skipped: true } : {}),
  };
}

function mergeResult(target, incoming, sources) {
  const combinedSources = new Set([
    ...(Array.isArray(target.providerSources) ? target.providerSources : []),
    ...(Array.isArray(incoming.providerSources) ? incoming.providerSources : []),
    ...sources,
  ]);
  target.providerSources = [...combinedSources];

  if ((incoming.snippet || '').length > (target.snippet || '').length) {
    target.snippet = incoming.snippet;
  }
  if (!target.publishedAt && incoming.publishedAt) target.publishedAt = incoming.publishedAt;
  if (!target.domain && incoming.domain) target.domain = incoming.domain;
  if (!target.sourceName && incoming.sourceName) target.sourceName = incoming.sourceName;
  return target;
}

function mergeResults(successfulResponses) {
  const ordered = [];
  const byCanonicalUrl = new Map();
  const byTitle = new Map();
  const maxProviderResults = Math.max(
    0,
    ...successfulResponses.map(({ response }) => (
      Array.isArray(response.results) ? response.results.length : 0
    )),
  );

  for (let resultIndex = 0; resultIndex < maxProviderResults; resultIndex += 1) {
    for (const { provider, response } of successfulResponses) {
      const incoming = response.results?.[resultIndex];
      if (!incoming || typeof incoming !== 'object') continue;
      if (!incoming.url && !incoming.title) continue;

      const canonicalUrl = canonicalizeUrl(incoming.url);
      const fingerprint = titleFingerprint(incoming.title);
      const existing = canonicalUrl
        ? byCanonicalUrl.get(canonicalUrl)
        : (fingerprint && byTitle.get(fingerprint));
      const sources = responseSources(response, provider);

      if (existing) {
        mergeResult(existing, incoming, sources);
        if (canonicalUrl) byCanonicalUrl.set(canonicalUrl, existing);
        if (fingerprint) byTitle.set(fingerprint, existing);
        continue;
      }

      const normalized = {
        ...incoming,
        url: canonicalUrl || incoming.url || '',
        providerSources: [...new Set([
          ...(Array.isArray(incoming.providerSources) ? incoming.providerSources : []),
          ...sources,
        ])],
      };
      ordered.push(normalized);
      if (canonicalUrl) byCanonicalUrl.set(canonicalUrl, normalized);
      if (fingerprint) byTitle.set(fingerprint, normalized);
    }
  }

  return ordered;
}

class CompositeSearchProvider extends SearchProvider {
  constructor(options = {}) {
    super();
    const normalizedOptions = Array.isArray(options) ? { providers: options } : options;
    this.persistentUse = normalizedOptions.persistentUse === true;
    this.providers = normalizedOptions.providers || [
      new BraveSearchProvider(normalizedOptions.brave),
      new GoogleNewsRssProvider(normalizedOptions.googleNewsRss),
      new GdeltDocProvider(normalizedOptions.gdelt),
      new SearxngProvider(normalizedOptions.searxng),
      new GoogleCseProvider(normalizedOptions.googleCse),
      new DuckDuckGoLiteProvider(normalizedOptions.duckduckgo),
    ];
  }

  get id() {
    return 'composite-search';
  }

  get name() {
    return 'Busca combinada';
  }

  isConfigured() {
    return this.providers.some((provider) => {
      try {
        const persistenceAllowed = !this.persistentUse
          || typeof provider?.allowsPersistentUse !== 'function'
          || provider.allowsPersistentUse();
        return persistenceAllowed
          && (typeof provider?.isConfigured !== 'function' || provider.isConfigured());
      } catch {
        return false;
      }
    });
  }

  supportsChannel(channel) {
    return this.providers.some((provider) => {
      try {
        const persistenceAllowed = !this.persistentUse
          || typeof provider?.allowsPersistentUse !== 'function'
          || provider.allowsPersistentUse();
        return persistenceAllowed
          && (typeof provider?.supportsChannel !== 'function' || provider.supportsChannel(channel));
      } catch {
        return false;
      }
    });
  }

  async searchWeb({
    query,
    count = 10,
    channel = 'web',
    freshness,
    offset = 0,
    priority,
    purpose,
    timeoutMs,
  } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'web').toLowerCase();
    const requestedCount = clampInteger(count, 10, 1, 100);

    if (!normalizedQuery) {
      return {
        ok: false,
        status: 400,
        erro: 'Consulta de busca vazia.',
        provider: this.name,
        providerSources: [],
        totalFound: 0,
        results: [],
        attempts: [],
        partial: false,
        hasMore: false,
      };
    }

    const supportedProviders = this.providers.filter((provider) => {
      if (!provider || typeof provider.searchWeb !== 'function') return false;
      try {
        return typeof provider.supportsChannel !== 'function'
          || provider.supportsChannel(normalizedChannel);
      } catch {
        return false;
      }
    });
    const persistenceEligibleProviders = supportedProviders.filter((provider) => (
      !this.persistentUse
      || typeof provider?.allowsPersistentUse !== 'function'
      || provider.allowsPersistentUse()
    ));
    const applicableProviders = persistenceEligibleProviders.filter((provider) => {
      try {
        return typeof provider.isConfigured !== 'function' || provider.isConfigured();
      } catch {
        return false;
      }
    });
    const skippedProviders = supportedProviders.filter((provider) => !applicableProviders.includes(provider));
    const skippedAttempts = skippedProviders.map((provider) => ({
      provider: provider.name || providerIdentity(provider),
      providerId: providerIdentity(provider),
      channel: normalizedChannel,
      ok: false,
      status: 503,
      resultCount: 0,
      erro: !persistenceEligibleProviders.includes(provider)
        ? 'Provedor não habilitado para armazenar resultados neste dossiê.'
        : 'Provedor não configurado.',
      skipped: true,
    }));

    if (applicableProviders.length === 0) {
      return {
        ok: false,
        status: 503,
        erro: `Nenhum provedor configurado atende ao canal ${normalizedChannel}.`,
        provider: this.name,
        providerSources: [],
        totalFound: 0,
        results: [],
        attempts: skippedAttempts,
        partial: false,
        hasMore: false,
      };
    }

    const settled = await Promise.allSettled(applicableProviders.map((provider) => provider.searchWeb({
      query: normalizedQuery,
      count: requestedCount,
      channel: normalizedChannel,
      freshness,
      offset,
      priority,
      purpose,
      timeoutMs,
    })));

    const responses = settled.map((outcome, index) => {
      const provider = applicableProviders[index];
      if (outcome.status === 'fulfilled' && outcome.value && typeof outcome.value === 'object') {
        return { provider, response: outcome.value };
      }

      const erro = outcome.status === 'rejected'
        ? `Falha inesperada no provedor: ${outcome.reason?.message || 'erro desconhecido'}.`
        : 'O provedor retornou uma resposta inválida.';
      return {
        provider,
        response: {
          ok: false,
          status: 502,
          erro,
          provider: provider.name || providerIdentity(provider),
          providerSources: [providerIdentity(provider)],
          results: [],
        },
      };
    });
    const successfulResponses = responses.filter(({ response }) => response.ok);
    const failedResponses = responses.filter(({ response }) => !response.ok);
    const attempts = [...skippedAttempts, ...responses.flatMap(({ provider, response }) => {
      const rawAttempts = Array.isArray(response.attempts) && response.attempts.length > 0
        ? response.attempts
        : [null];
      return rawAttempts.map((attempt) => normalizeAttempt(
        attempt,
        provider,
        normalizedChannel,
        response,
      ));
    })];
    const allMergedResults = mergeResults(successfulResponses);
    const results = allMergedResults.slice(0, requestedCount);
    const providerSources = [...new Set(successfulResponses.flatMap(({ provider, response }) => (
      responseSources(response, provider)
    )))];
    const partial = successfulResponses.length > 0 && (
      failedResponses.length > 0
      || successfulResponses.some(({ response }) => Boolean(response.partial))
    );
    const hasMore = allMergedResults.length > results.length
      || successfulResponses.some(({ response }) => Boolean(response.hasMore));

    if (successfulResponses.length === 0) {
      const errors = failedResponses
        .map(({ response }) => response.erro)
        .filter(Boolean)
        .join(' | ');
      return {
        ok: false,
        status: failedResponses[0]?.response?.status || 502,
        erro: errors || 'Todos os provedores de busca falharam.',
        provider: this.name,
        providerSources: [],
        totalFound: 0,
        results: [],
        attempts,
        partial: false,
        hasMore: false,
      };
    }

    return {
      ok: true,
      status: 200,
      provider: this.name,
      providerSources,
      totalFound: results.length,
      results,
      attempts,
      partial,
      hasMore,
    };
  }
}

module.exports = {
  CompositeSearchProvider,
  canonicalizeUrl,
  titleFingerprint,
};
