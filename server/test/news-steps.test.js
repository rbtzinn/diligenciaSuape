const test = require('node:test');
const assert = require('node:assert/strict');
const { researchInput, planNews, searchNewsQueries } = require('../src/services/ai/news-research.service');
const { CompositeSearchProvider } = require('../src/services/search/composite-search.provider');
const { executeLeads, validateNewsContent, anchorsFor, isAnchored } = require('../src/services/ai/investigative-leads.service');

const input = researchInput({ empresa: { razaoSocial: 'Empresa Exemplo' }, socios: [{ nome_socio: 'Maria da Silva', cpf: 'não enviar' }] });
const query = { termo: 'Empresa Exemplo Recife', canal: 'news', alvo: 'empresa', motivo: 'Contexto' };

test('separa dados permitidos e recusa entradas sem âncora', () => {
  assert.equal(input.shareholders[0].cpf, undefined);
  assert.throws(() => researchInput({ empresa: { razaoSocial: 'X' } }), (e) => e.status === 400);
  assert.equal(isAnchored('SuperEmpresa Exemplos', anchorsFor(input)), false);
});

test('validação recusa null, array, texto, JSON incompleto, plano vazio e nomes não fornecidos', () => {
  for (const s of ['null', '[]', '{}', 'texto', '{"consultas":', '{"consultas":[]}', JSON.stringify({ consultas: [{ ...query, termo: 'Maria Santos' }] })]) {
    assert.throws(() => validateNewsContent(s, input), (e) => e.code === 'AI_INVALID_PLAN');
  }
  assert.equal(validateNewsContent('```json\n' + JSON.stringify({ consultas: [query] }) + '\n```', input).consultas.length, 1);
});

test('planejamento reaproveita contexto e remove consultas repetidas', async () => {
  const result = await planNews(input, { consultasExecutadas: [query.termo] }, {
    propose: async (_input, options) => { assert.deepEqual(options.searchContext.consultasExecutadas, [query.termo]); return { consultas: [query, { ...query, termo: 'Empresa Exemplo notícias' }] }; },
  });
  assert.equal(result.consultas.length, 1);
});

test('busca retomada dispensa chamada de IA e revalida as consultas do cliente', async () => {
  let calls = 0;
  const provider = { isConfigured: () => true, searchWeb: async () => { calls++; return { ok: true, results: [] }; } };
  await assert.rejects(searchNewsQueries(input, [{ ...query, termo: 'Pessoa Inventada' }], provider), (e) => e.status === 400);
  assert.equal(calls, 0);
  const result = await searchNewsQueries(input, [query], provider);
  assert.equal(result.ok, true);
  assert.equal(result.resultados.length, 0);
  assert.equal(calls, 1);
});

test('fonte travada não descarta resposta rápida nem seu link', async () => {
  let slowSignal;
  const base = { isConfigured: () => true, supportsChannel: () => true };
  const provider = new CompositeSearchProvider({ providers: [
    { ...base, id: 'fast', searchWeb: async () => ({ ok: true, results: [{ url: 'https://example.com/a', title: 'Fonte rápida' }] }) },
    { ...base, id: 'slow', searchWeb: ({ signal }) => { slowSignal = signal; return new Promise(() => {}); } },
  ] });
  const result = await provider.searchWeb({ query: query.termo, channel: 'news', timeoutMs: 120 });
  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.results[0].title, 'Fonte rápida');
  assert.ok(slowSignal.aborted);
  assert.equal(result.attempts.find((a) => a.providerId === 'slow').ok, false);
});

test('resposta indefinida e falha de todas as fontes não viram sucesso sem notícias', async () => {
  for (const response of [undefined, { ok: false, erro: 'Fonte indisponível', results: [] }]) {
    const result = await executeLeads([query], { isConfigured: () => true, searchWeb: async () => response });
    assert.equal(result.ok, false);
  }
});
