// ==========================================================
// DILIGÊNCIA 360 — Bing News RSS
//
// Segunda fonte gratuita de notícia, sem chave e sem cadastro, ao lado
// do Google News. Duas razões para ela existir:
//
// 1. Índices diferentes. Google News e Bing News não cobrem a mesma
//    imprensa regional, e é justamente a imprensa regional que noticia
//    o fornecedor de porte médio que aparece numa diligência. Com uma
//    fonte só, o que ela não indexou simplesmente não existe.
//
// 2. O link. O Google News devolve um endereço de redirecionamento do
//    próprio Google; o Bing devolve o endereço do veículo. Para o
//    dossiê, o endereço do veículo é a evidência — o outro é um
//    caminho até ela.
//
// Quando a fonte não responde, isso vira falha declarada e não lista
// vazia: a busca composta já sabe conviver com um provedor a menos, e
// fonte não consultada nunca pode ser lida como "nada consta".
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');
const {
  clampInteger,
  normalizeText,
  normalizeRawValue,
  extractTag,
  isWellFormedXml,
} = require('./rss-xml');

const PROVIDER_ID = 'bing-news-rss';
const PROVIDER_NAME = 'Bing News RSS';
const ENDPOINT = 'https://www.bing.com/news/search';

/**
 * Domínio a partir do próprio link da matéria.
 *
 * É aqui que o Bing ajuda: o `<link>` aponta para o veículo, então o
 * domínio sai do endereço e não de um rótulo que a fonte escolheu.
 */
function domainFromUrl(url, fallbackName) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return '';
    return hostname.replace(/^www\./i, '');
  } catch {
    return fallbackName || '';
  }
}

function parseBingItems(xml, count) {
  const results = [];
  const itemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && results.length < count) {
    const item = match[1];
    const title = normalizeText(extractTag(item, 'title'));
    const url = normalizeRawValue(extractTag(item, 'link'));
    if (!title || !url) continue;

    // O Bing publica o veículo numa tag com prefixo de namespace
    // (`News:Source`); alguns mercados usam `source` puro.
    const sourceName = normalizeText(extractTag(item, 'News:Source'))
      || normalizeText(extractTag(item, 'source'));
    const domain = domainFromUrl(url, sourceName);
    if (!domain) continue;

    const description = normalizeText(extractTag(item, 'description'));

    results.push({
      title,
      url,
      domain,
      snippet: description || title,
      publishedAt: normalizeRawValue(extractTag(item, 'pubDate')) || undefined,
      sourceName: sourceName || undefined,
      providerSources: [PROVIDER_ID],
    });
  }

  return results;
}

class BingNewsRssProvider extends SearchProvider {
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

  async searchWeb({ query, count = 10, channel = 'news', offset = 0, timeoutMs, signal } = {}) {
    const normalizedQuery = typeof query === 'string' ? query.trim() : '';
    const normalizedChannel = String(channel || 'news').toLowerCase();
    if (!normalizedQuery) return this.failure(400, 'Consulta de busca vazia.', normalizedChannel);
    if (!this.supportsChannel(normalizedChannel)) {
      return this.failure(400, `Canal de busca não suportado: ${normalizedChannel}.`, normalizedChannel);
    }
    if (Number(offset) > 0) {
      return this.failure(422, 'Bing News RSS não oferece paginação por offset.', normalizedChannel);
    }

    const requestedCount = clampInteger(count, 10, 1, 100);
    const requestTimeoutMs = clampInteger(timeoutMs, this.timeoutMs, 250, 30000);

    const searchUrl = new URL(ENDPOINT);
    searchUrl.searchParams.set('q', normalizedQuery);
    searchUrl.searchParams.set('format', 'RSS');
    searchUrl.searchParams.set('setmkt', 'pt-BR');
    searchUrl.searchParams.set('setlang', 'pt-BR');
    searchUrl.searchParams.set('cc', 'BR');

    try {
      const response = await this.fetchImpl(searchUrl.toString(), {
        timeoutMs: requestTimeoutMs,
        signal,
        headers: {
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        return this.failure(
          response.status || 502,
          `Bing News RSS respondeu com HTTP ${response.status || 502}.`,
          normalizedChannel,
        );
      }

      let xml;
      try {
        xml = await response.text();
      } catch {
        return this.failure(502, 'Não foi possível ler o XML do Bing News RSS.', normalizedChannel);
      }

      // Sem resultado, o Bing às vezes devolve a página HTML da busca em
      // vez de RSS. HTML aqui é falha de consulta, não ausência de
      // notícia, e precisa ser declarado como tal.
      if (!isWellFormedXml(xml) || !/<rss[\s>]/i.test(xml)) {
        return this.failure(502, 'Bing News RSS não devolveu um feed válido.', normalizedChannel);
      }

      const results = parseBingItems(xml, requestedCount);

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
        hasMore: false,
      };
    } catch (error) {
      const isTimeout = /timeout|tempo limite/i.test(error?.message || '');
      return this.failure(
        isTimeout ? 504 : 502,
        isTimeout
          ? 'Tempo limite excedido ao consultar Bing News RSS.'
          : `Falha ao consultar Bing News RSS: ${error?.message || 'erro desconhecido'}.`,
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

module.exports = { BingNewsRssProvider, parseBingItems, domainFromUrl };
