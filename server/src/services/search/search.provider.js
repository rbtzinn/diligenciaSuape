// ==========================================================
// DILIGÊNCIA 360 — Contrato de Provedor de Busca Web
// Abstração para desacoplar a aplicação do mecanismo de busca
// ==========================================================

class SearchProvider {
  /**
   * Verifica se o provedor está configurado com credenciais válidas
   * @returns {boolean}
   */
  isConfigured() {
    throw new Error('Método isConfigured deve ser implementado pelo provedor');
  }

  /**
   * Executa busca na web
   * @param {Object} options
   * @param {string} options.query - Termo de busca
   * @param {number} [options.count=10] - Quantidade de resultados
   * @param {string} [options.freshness] - Filtro temporal (opcional)
   * @returns {Promise<{ ok: boolean, status: number, erro?: string, results: Array<{ title: string, url: string, domain: string, snippet: string, publishedAt?: string }> }>}
   */
  async searchWeb({ query, count = 10, freshness }) {
    throw new Error('Método searchWeb deve ser implementado pelo provedor');
  }
}

module.exports = { SearchProvider };
