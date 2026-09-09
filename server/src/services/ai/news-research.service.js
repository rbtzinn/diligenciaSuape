const { proposeLeads, executeLeads } = require('./investigative-leads.service');

// Duas rodadas limitadas: o modelo planeja, o buscador executa e os
// trechos retornados orientam a próxima pesquisa. URLs vêm só do buscador.
async function researchNews(input, searchProvider, dependencies = {}) {
  const propose = dependencies.propose || proposeLeads;
  const execute = dependencies.execute || executeLeads;
  const results = new Map();
  const queries = [];
  const seen = new Set();
  let provider;
  let warning;
  for (let round = 0; round < 2; round += 1) {
    try {
      const plan = await propose(input, {
        newsResearch: true,
        searchContext: round ? {
          consultasExecutadas: [...seen],
          resultados: [...results.values()].slice(0, 12).map(({ title, snippet }) => ({ title, snippet: snippet.slice(0, 600) })),
        } : undefined,
      });
      provider = plan.provedor;
      const fresh = plan.consultas.filter((query) => {
        const key = query.termo.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 6);
      if (!fresh.length) break;
      const response = await execute(fresh, searchProvider, { deadlineMs: 20000 });
      queries.push(...response.consultasExecutadas);
      for (const item of response.resultados) {
        try {
          const url = new URL(item.url);
          if (!['http:', 'https:'].includes(url.protocol)) continue;
          url.hash = '';
          if (!results.has(url.href)) results.set(url.href, item);
        } catch { /* Não publica links inválidos. */ }
      }
      if (!response.ok || !response.consultasExecutadas.some((query) => query.ok)) {
        warning = response.erro || 'Os buscadores não responderam nesta rodada.';
        break;
      }
    } catch (error) {
      warning = error.message;
      break;
    }
  }
  const ok = queries.some((query) => query.ok);
  return {
    ok, provedor: provider, geradoEm: new Date().toISOString(),
    resultados: [...results.values()], consultasExecutadas: queries,
    ...(ok ? {} : { erro: warning || 'Nenhuma consulta foi executada.' }),
    aviso: warning || (queries.some((query) => !query.ok)
      ? 'Busca parcial: algumas consultas falharam.'
      : 'Links retornados por buscadores. A identidade e o conteúdo ainda precisam de revisão.'),
  };
}
module.exports = { researchNews };
