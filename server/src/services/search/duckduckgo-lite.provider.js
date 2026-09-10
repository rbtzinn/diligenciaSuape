// ==========================================================
// DILIGÊNCIA 360 — DuckDuckGo Lite
// Canal web público sem chave. Cobertura melhor que RSS de
// notícias para documentos (PDF, portarias, atas, sites oficiais).
// Fonte HTML: pode mudar sem aviso; falha explícita, nunca silenciosa.
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');

const PROVIDER_ID = 'duckduckgo-lite';
const PROVIDER_NAME = 'DuckDuckGo Lite';
const ENDPOINT = 'https://lite.duckduckgo.com/lite/';
const RESULTS_PER_PAGE = 30;

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
});

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveRedirect(href) {
  const raw = decodeEntities(String(href || '').trim());
  if (!raw) return '';

  const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
  try {
    const url = new URL(absolute, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    if (target) {
      const decoded = new URL(target);
      return decoded.protocol === 'http:' || decoded.protocol === 'https:' ? decoded.toString() : '';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (/(^|\.)duckduckgo\.com$/i.test(url.hostname)) return '';
    return url.toString();
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

function parseResults(html, count) {
  const results = [];
  const seen = new Set();
  const linkRegex = /<a\b[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;

  const snippets = [];
  let snippetMatch;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(stripTags(snippetMatch[1]));
  }

  let match;
  let index = 0;
  while ((match = linkRegex.exec(html)) !== null && results.length < count) {
    const url = resolveRedirect(match[1]);
    const title = stripTags(match[2]);
    const position = index;
    index += 1;
    if (!url || !title || seen.has(url)) continue;

    const domain = domainFromUrl(url);
    if (!domain) continue;

    seen.add(url);
    results.push({
      title,
      url,
      domain,
      snippet: snippets[position] || title,
      sourceName: PROVIDER_NAME,
      providerSources: [PROVIDER_ID],
    });
  }

  return results;
}

class DuckDuckGoLiteProvider extends SearchProvider {
  constructor(options = {}) {
    super();
    this.fetchImpl = options.fetchImpl || safeFetch;
    this.timeoutMs = clampInteger(options.timeoutMs ?? process.env.DUCKDUCKGO_TIMEOUT_MS, 12000, 1000, 30000);
    this.enabled = options.enabled ?? (process.env.DUCKDUCKGO_SEARCH_ENABLED !== 'false');
    this.region = String(options.region ?? process.env.DUCKDUCKGO_REGION ?? 'br-pt').trim() || 'br-pt';
  }

  get id() {
    return PROVIDER_ID;
  }

  get name() {
    return PROVIDER_NAME;
  }

  isConfigured() {
    return this.enabled === true;
  }

  supportsChannel(channel) {
    return channel === 'web';
  }

  async searchWeb({
    query,
    count = 10,
    channel = 'web',
    offset = 0,
    timeoutMs,
    signal,
  } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'web').toLowerCase();

    if (!normalizedQuery) return this.failure(400, 'Consulta de busca vazia.', normalizedChannel);
    if (!this.supportsChannel(normalizedChannel)) {
      return this.failure(400, `Canal de busca não suportado: ${normalizedChannel}.`, normalizedChannel);
    }
    if (!this.isConfigured()) {
      return this.failure(503, 'DuckDuckGo Lite desabilitado por configuração.', normalizedChannel);
    }

    const requestedCount = clampInteger(count, 10, 1, RESULTS_PER_PAGE);
    const requestTimeoutMs = clampInteger(timeoutMs, this.timeoutMs, 250, 30000);
    const body = new URLSearchParams({
      q: normalizedQuery,
      kl: this.region,
      df: '',
    });
    const startOffset = clampInteger(offset, 0, 0, 200);
    if (startOffset > 0) body.set('s', String(startOffset));

    try {
      const response = await this.fetchImpl(ENDPOINT, {
        method: 'POST',
        timeoutMs: requestTimeoutMs,
        signal,
        headers: {
          Accept: 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response?.ok) {
        return this.failure(
          response?.status || 502,
          `DuckDuckGo Lite respondeu com HTTP ${response?.status || 502}.`,
          normalizedChannel,
        );
      }

      const html = await response.text();
      const results = parseResults(html, requestedCount);

      if (results.length === 0 && !/result-link/i.test(html)) {
        // O DuckDuckGo responde HTTP 202 com uma página de desafio quando
        // detecta automação, em vez de recusar com 429. Sem distinguir isso da
        // mudança de layout, o diagnóstico manda procurar o bug no lugar errado.
        const bloqueado = /anomaly|challenge|captcha/i.test(html);
        return this.failure(
          bloqueado ? 429 : 502,
          bloqueado
            ? 'DuckDuckGo Lite bloqueou a consulta por detecção de automação. O canal web fica indisponível até o bloqueio cessar.'
            : 'DuckDuckGo Lite retornou HTML sem o formato de resultados esperado.',
          normalizedChannel,
        );
      }

      return {
        ok: true,
        status: response.status || 200,
        provider: PROVIDER_NAME,
        providerSources: [PROVIDER_ID],
        totalFound: results.length,
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
        hasMore: results.length >= requestedCount,
      };
    } catch (error) {
      const isTimeout = /timeout|tempo limite/i.test(error?.message || '');
      return this.failure(
        isTimeout ? 504 : 502,
        isTimeout
          ? 'Tempo limite excedido ao consultar DuckDuckGo Lite.'
          : `Falha ao consultar DuckDuckGo Lite: ${error?.message || 'erro desconhecido'}.`,
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
  DuckDuckGoLiteProvider,
  parseResults,
  resolveRedirect,
};

