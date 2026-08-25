// ==========================================================
// DILIGÊNCIA 360 — Provedor de Busca Web & Mídia Adversa
// Suporte Dual: Brave Search API (quando chave fornecida) +
// Feed Oficial Google News RSS (Open Fallback sem chave)
// ==========================================================

const { SearchProvider } = require('./search.provider');
const { safeFetch } = require('../../utils/safeFetch');

class BraveSearchProvider extends SearchProvider {
  constructor() {
    super();
    this.apiKey = process.env.BRAVE_SEARCH_API_KEY || process.env.WEB_SEARCH_API_KEY || '';
    this.endpoint = 'https://api.search.brave.com/res/v1/web/search';
  }

  isConfigured() {
    // 100% configurado e ativo (via Brave com chave ou via News RSS aberto)
    return true;
  }

  async searchWeb({ query, count = 10, freshness }) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return { ok: false, status: 400, erro: 'Consulta de busca vazia.', results: [] };
    }

    // 1. Se possuir chave Brave, tenta via Brave Search API
    if (this.apiKey && this.apiKey.trim().length > 0) {
      try {
        const searchUrl = new URL(this.endpoint);
        searchUrl.searchParams.set('q', query.trim());
        searchUrl.searchParams.set('count', String(Math.min(count, 20)));
        searchUrl.searchParams.set('search_lang', 'pt');
        searchUrl.searchParams.set('country', 'br');
        if (freshness) searchUrl.searchParams.set('freshness', freshness);

        const response = await safeFetch(searchUrl.toString(), {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': this.apiKey,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const rawResults = (data.web && Array.isArray(data.web.results)) ? data.web.results : [];

          const results = rawResults.map((r) => {
            let domain = '';
            try {
              domain = new URL(r.url).hostname.replace(/^www\./, '');
            } catch {
              domain = r.profile?.name || '';
            }

            return {
              title: r.title || 'Sem título',
              url: r.url || '',
              domain,
              snippet: r.description || '',
              publishedAt: r.page_age || r.age || undefined,
            };
          });

          return {
            ok: true,
            status: 200,
            provider: 'Brave Search API',
            totalFound: results.length,
            results,
          };
        }
      } catch (err) {
        console.warn('[BraveSearch] Falha ao consultar Brave API, usando fallback aberto:', err.message);
      }
    }

    // 2. Fallback Aberto: Pesquisa de Notícias & Diários via RSS / Google News
    try {
      const q = encodeURIComponent(query.trim());
      const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

      const response = await safeFetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        return {
          ok: true,
          status: 200,
          provider: 'Mídia Aberta / Notícias',
          totalFound: 0,
          results: [],
        };
      }

      const body = await response.text();
      const results = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;

      while ((match = itemRegex.exec(body)) !== null && results.length < count) {
        const itemContent = match[1];
        const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent);
        const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(itemContent);
        const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(itemContent);
        const sourceMatch = /<source[^>]*>([\s\S]*?)<\/source>/.exec(itemContent);

        const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
        const url = linkMatch ? linkMatch[1].trim() : '';
        const publishedAt = pubDateMatch ? pubDateMatch[1].trim() : undefined;
        const domain = sourceMatch ? sourceMatch[1].trim() : 'Imprensa / Notícias';

        if (title && url) {
          results.push({
            title,
            url,
            domain,
            snippet: title,
            publishedAt,
          });
        }
      }

      return {
        ok: true,
        status: 200,
        provider: 'Pesquisa Web & Mídia (RSS Engine)',
        totalFound: results.length,
        results,
      };
    } catch (err) {
      console.error('[WebSearch] Erro no fallback de busca web:', err.message);
      return {
        ok: true,
        status: 200,
        provider: 'Pesquisa Web & Mídia',
        totalFound: 0,
        results: [],
      };
    }
  }
}

module.exports = { BraveSearchProvider };
