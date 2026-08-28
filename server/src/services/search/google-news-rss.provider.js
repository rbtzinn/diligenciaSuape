// ==========================================================
// DILIGÊNCIA 360 — Google News RSS
// Complemento público de notícias, com erros explícitos.
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');

const PROVIDER_ID = 'google-news-rss';
const PROVIDER_NAME = 'Google News RSS';
const ENDPOINT = 'https://news.google.com/rss/search';

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

function decodeXmlEntities(value) {
  return String(value || '').replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, code) => {
      if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? entity;

      const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const numeric = Number.parseInt(digits, radix);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;

      try {
        return String.fromCodePoint(numeric);
      } catch {
        return entity;
      }
    },
  );
}

function unwrapCdata(value) {
  const trimmed = String(value || '').trim();
  const match = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

function normalizeText(value) {
  const decoded = decodeXmlEntities(unwrapCdata(value));
  const withoutMarkup = decoded.replace(/<[^>]*>/g, ' ');
  return decodeXmlEntities(withoutMarkup).replace(/\s+/g, ' ').trim();
}

function normalizeRawValue(value) {
  return decodeXmlEntities(unwrapCdata(value)).trim();
}

function extractTag(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i').exec(xml);
  return match ? match[1] : '';
}

function extractOpeningTag(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>`, 'i').exec(xml);
  return match ? match[0] : '';
}

function extractAttribute(openingTag, attributeName) {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\s${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(openingTag);
  return match ? normalizeRawValue(match[2]) : '';
}

function findTagEnd(xml, startIndex) {
  let quote = '';
  for (let index = startIndex; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

function isWellFormedXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return false;

  const source = xml.replace(/^\uFEFF/, '');
  const stack = [];
  let root = '';
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start === -1) break;

    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      if (end === -1) return false;
      cursor = end + 3;
      continue;
    }

    if (source.startsWith('<![CDATA[', start)) {
      const end = source.indexOf(']]>', start + 9);
      if (end === -1) return false;
      cursor = end + 3;
      continue;
    }

    if (source.startsWith('<?', start)) {
      const end = source.indexOf('?>', start + 2);
      if (end === -1) return false;
      cursor = end + 2;
      continue;
    }

    if (/^<!DOCTYPE\b/i.test(source.slice(start))) {
      const end = findTagEnd(source, start + 2);
      if (end === -1) return false;
      cursor = end + 1;
      continue;
    }

    const end = findTagEnd(source, start + 1);
    if (end === -1) return false;
    const token = source.slice(start, end + 1);
    const closing = /^<\/\s*([A-Za-z_][\w:.-]*)\s*>$/.exec(token);

    if (closing) {
      const expected = stack.pop();
      if (!expected || expected !== closing[1]) return false;
      cursor = end + 1;
      continue;
    }

    const opening = /^<\s*([A-Za-z_][\w:.-]*)(?:\s[\s\S]*?)?\s*\/?>$/.exec(token);
    if (!opening) return false;
    if (stack.length === 0) {
      if (root) return false;
      root = opening[1].toLowerCase();
    }
    if (!/\/\s*>$/.test(token)) stack.push(opening[1]);
    cursor = end + 1;
  }

  return root === 'rss'
    && stack.length === 0
    && /<channel(?:\s[^>]*)?>/i.test(source)
    && /<\/channel\s*>/i.test(source);
}

function domainFromSource(sourceUrl, sourceName) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, '');
  } catch {
    return sourceName || 'Imprensa / Notícias';
  }
}

function parseRssItems(xml, count) {
  const results = [];
  const itemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && results.length < count) {
    const item = match[1];
    const title = normalizeText(extractTag(item, 'title'));
    const url = normalizeRawValue(extractTag(item, 'link'));
    if (!title || !url) continue;

    const description = normalizeText(extractTag(item, 'description'));
    const sourceName = normalizeText(extractTag(item, 'source'));
    const sourceTag = extractOpeningTag(item, 'source');
    const sourceUrl = extractAttribute(sourceTag, 'url');

    results.push({
      title,
      url,
      domain: domainFromSource(sourceUrl, sourceName),
      snippet: description || title,
      publishedAt: normalizeRawValue(extractTag(item, 'pubDate')) || undefined,
      sourceName: sourceName || undefined,
      providerSources: [PROVIDER_ID],
    });
  }

  return results;
}

class GoogleNewsRssProvider extends SearchProvider {
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
    offset = 0,
    timeoutMs,
  } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'news').toLowerCase();
    if (!normalizedQuery) return this.failure(400, 'Consulta de busca vazia.', normalizedChannel);
    if (!this.supportsChannel(normalizedChannel)) {
      return this.failure(400, `Canal de busca não suportado: ${normalizedChannel}.`, normalizedChannel);
    }
    if (Number(offset) > 0) {
      return this.failure(422, 'Google News RSS não oferece paginação por offset.', normalizedChannel);
    }

    const requestedCount = clampInteger(count, 10, 1, 100);
    const requestTimeoutMs = clampInteger(timeoutMs, this.timeoutMs, 250, 30000);
    const searchUrl = new URL(ENDPOINT);
    searchUrl.searchParams.set('q', normalizedQuery);
    searchUrl.searchParams.set('hl', 'pt-BR');
    searchUrl.searchParams.set('gl', 'BR');
    searchUrl.searchParams.set('ceid', 'BR:pt-419');

    try {
      const response = await this.fetchImpl(searchUrl.toString(), {
        timeoutMs: requestTimeoutMs,
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        return this.failure(
          response.status || 502,
          `Google News RSS respondeu com HTTP ${response.status || 502}.`,
          normalizedChannel,
        );
      }

      let xml;
      try {
        xml = await response.text();
      } catch {
        return this.failure(502, 'Não foi possível ler o XML do Google News RSS.', normalizedChannel);
      }

      if (!isWellFormedXml(xml)) {
        return this.failure(502, 'Google News RSS retornou XML inválido.', normalizedChannel);
      }

      const results = parseRssItems(xml, requestedCount);
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
        hasMore: false,
      };
    } catch (error) {
      const isTimeout = /timeout|tempo limite/i.test(error?.message || '');
      return this.failure(
        isTimeout ? 504 : 502,
        isTimeout
          ? 'Tempo limite excedido ao consultar Google News RSS.'
          : `Falha ao consultar Google News RSS: ${error?.message || 'erro desconhecido'}.`,
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
  GoogleNewsRssProvider,
  decodeXmlEntities,
  isWellFormedXml,
  parseRssItems,
};
