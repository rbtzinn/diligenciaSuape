const { proposeLeads, executeLeads } = require('./investigative-leads.service');

// Duas rodadas limitadas: o modelo planeja, o buscador executa e os
// trechos retornados orientam a próxima pesquisa. URLs vêm só do buscador.
async function researchNews(input, searchProvider, dependencies = {}) {
  const propose = dependencies.propose || proposeLeads;
  const execute = dependencies.execute || executeLeads;
  // Reserve time for authentication, serialization and the Vercel response.
  const deadlineAt = Date.now() + 50_000;
  const deadlineMessage = 'Pesquisa parcial: o tempo disponível terminou. Tente novamente para buscar mais fontes.';
  async function withinDeadline(work) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) throw new Error(deadlineMessage);
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(work),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(deadlineMessage)), remaining); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const results = new Map();
  const queries = [];
  const seen = new Set();
  let provider;
  let warning;
  for (let round = 0; round < 2; round += 1) {
    try {
      const plan = await withinDeadline(() => propose(input, {
        timeoutMs: Math.max(1, Math.min(30_000, deadlineAt - Date.now())),
        newsResearch: true,
        searchContext: round ? {
          consultasExecutadas: [...seen],
          resultados: [...results.values()].slice(0, 12).map(({ title, snippet }) => ({ title, snippet: snippet.slice(0, 600) })),
        } : undefined,
      }));
      provider = plan.provedor;
      const fresh = plan.consultas.filter((query) => {
        const key = query.termo.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 6);
      if (!fresh.length) break;
      const response = await withinDeadline(() => execute(fresh, searchProvider, {
        deadlineMs: Math.max(1, Math.min(20_000, deadlineAt - Date.now())),
      }));
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
