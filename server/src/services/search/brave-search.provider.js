// ==========================================================
// DILIGÊNCIA 360 — Provedor Brave Search API
// Mecanismo real de busca na web com controle de timeout e erros
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
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  async searchWeb({ query, count = 10, freshness }) {
    if (!this.isConfigured()) {
      return {
        ok: false,
        status: 401,
        semChave: true,
        erro: 'Integração de busca web não configurada (chave de API ausente).',
        results: [],
      };
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      return { ok: false, status: 400, erro: 'Consulta de busca vazia.', results: [] };
    }

    const searchUrl = new URL(this.endpoint);
    searchUrl.searchParams.set('q', query.trim());
    searchUrl.searchParams.set('count', String(Math.min(count, 20)));
    searchUrl.searchParams.set('search_lang', 'pt');
    searchUrl.searchParams.set('country', 'br');
    if (freshness) searchUrl.searchParams.set('freshness', freshness);

    try {
      const response = await safeFetch(searchUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          status: response.status,
          erro: 'Chave de busca web inválida ou não autorizada.',
          results: [],
        };
      }

      if (response.status === 429) {
        return {
          ok: false,
          status: 429,
          erro: 'Limite de requisições de busca web excedido (Rate limit).',
          results: [],
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          erro: `Serviço de busca retornou erro HTTP ${response.status}.`,
          results: [],
        };
      }

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
        provider: 'Brave Search',
        results,
      };
    } catch (err) {
      console.error('[Brave Search Provider] Erro:', err.message);
      return {
        ok: false,
        status: 500,
        erro: `Falha na conexão de busca: ${err.message}`,
        results: [],
      };
    }
  }
}

module.exports = { BraveSearchProvider };
