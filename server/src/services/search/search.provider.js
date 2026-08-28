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
   * @param {'web'|'news'} [options.channel='web'] - Índice de busca desejado
   * @param {string} [options.freshness] - Filtro temporal (opcional)
   * @param {number} [options.offset=0] - Página/offset suportado pelo provedor
   * @param {string|number} [options.priority] - Prioridade definida pelo orquestrador
   * @param {string} [options.purpose] - Finalidade da consulta no plano de busca
   * @param {number} [options.timeoutMs] - Timeout máximo desta chamada
   * @returns {Promise<{ ok: boolean, status: number, erro?: string, provider?: string, providerSources?: string[], totalFound?: number, results: Array<{ title: string, url: string, domain: string, snippet: string, publishedAt?: string, providerSources?: string[] }>, attempts?: Array<object>, partial?: boolean, hasMore?: boolean }>}
   */
  async searchWeb({ query, count = 10, channel = 'web', freshness, offset = 0, priority, purpose, timeoutMs }) {
    throw new Error('Método searchWeb deve ser implementado pelo provedor');
  }
}

module.exports = { SearchProvider };
