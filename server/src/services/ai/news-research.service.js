const { proposeLeads, executeLeads, anchorsFor, isAnchored } = require('./investigative-leads.service');

function badInput(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'INVALID_RESEARCH_INPUT';
  throw error;
}

function researchInput(body = {}) {
  if (!body.empresa || typeof body.empresa !== 'object' || Array.isArray(body.empresa)) badInput('Informe a empresa pesquisada.');
  const clean = (value, max) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  const company = Object.fromEntries(['razaoSocial', 'nomeFantasia', 'cnpj', 'municipio', 'uf', 'atividade']
    .map((key) => [key, clean(body.empresa[key], 250)]));
  const shareholders = (Array.isArray(body.socios) ? body.socios : []).slice(0, 50)
    .map((p) => ({ nome_socio: clean(p?.nome_socio, 200) })).filter((p) => p.nome_socio);
  if (!company.razaoSocial && !company.cnpj) badInput('Informe o nome ou CNPJ da empresa.');
  const input = { company, shareholders, coverage: [] };
  if (!anchorsFor(input).length) badInput('Informe um nome completo ou CNPJ válido para ancorar a pesquisa.');
  return input;
}

function researchContext(value) {
  return {
    consultasExecutadas: (Array.isArray(value?.consultasExecutadas) ? value.consultasExecutadas : [])
      .filter((q) => typeof q === 'string').slice(-64).map((q) => q.slice(0, 390)),
    resultados: (Array.isArray(value?.resultados) ? value.resultados : []).slice(0, 12)
      .map((r) => ({ title: String(r?.title || '').slice(0, 250), snippet: String(r?.snippet || '').slice(0, 500) })),
  };
}

async function planNews(input, context, options = {}) {
  const previous = researchContext(context);
  const plan = await (options.propose || proposeLeads)(input, {
    newsResearch: true, timeoutMs: 42_000, maxTokens: 1800,
    searchContext: previous, signal: options.signal,
  });
  const normalize = (q) => q.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const seen = new Set(previous.consultasExecutadas.map(normalize));
  const consultas = plan.consultas.filter((q) => {
    const key = normalize(q.termo);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
  return { ok: true, consultas, provedor: plan.provedor, modelo: plan.modelo,
    aviso: consultas.length ? undefined : 'A IA não sugeriu consultas novas nesta rodada. Isso não significa que não existam outras notícias.' };
}

async function searchNewsQueries(input, rawQueries, provider, options = {}) {
  if (!Array.isArray(rawQueries) || !rawQueries.length || rawQueries.length > 4) badInput('Envie de uma a quatro consultas.');
  const anchors = anchorsFor(input);
  const queries = rawQueries.map((q) => {
    if (!q || typeof q.termo !== 'string' || q.termo.length > 390 || !isAnchored(q.termo, anchors)) {
      badInput('A consulta precisa conter um nome ou CNPJ fornecido na diligência.');
    }
    return { termo: q.termo.trim(), canal: 'news', alvo: q.alvo === 'pessoa' ? 'pessoa' : 'empresa', motivo: String(q.motivo || '').slice(0, 300) };
  });
  const result = await (options.execute || executeLeads)(queries, provider, { deadlineMs: 12_000, signal: options.signal });
  return { ...result, geradoEm: new Date().toISOString(),
    aviso: result.ok ? (result.partial ? 'Cobertura parcial: algumas fontes falharam; os links recebidos foram preservados.' : 'Links retornados por buscadores. A identidade e o conteúdo precisam de revisão.') : result.erro };
}

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
    if (round > 0 && deadlineAt - Date.now() < 24_000) {
      warning = 'Primeira rodada concluída. A segunda não foi iniciada por falta de tempo disponível.';
      break;
    }
    try {
      const plan = await withinDeadline(() => propose(input, {
        timeoutMs: Math.max(1, Math.min(round === 0 ? 28_000 : 14_000, deadlineAt - Date.now())),
        newsResearch: true,
        maxTokens: 1800,
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
      }).slice(0, 4);
      if (!fresh.length) break;
      // Esta tela pesquisa notícias. Forçar o índice de notícias evita depender
      // do HTML do DuckDuckGo, que frequentemente bloqueia IPs da Vercel.
      const newsQueries = fresh.map((query) => ({ ...query, canal: 'news' }));
      const response = await withinDeadline(() => execute(newsQueries, searchProvider, {
        deadlineMs: Math.max(1, Math.min(9_000, deadlineAt - Date.now())),
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
module.exports = { researchNews, researchInput, planNews, searchNewsQueries };
