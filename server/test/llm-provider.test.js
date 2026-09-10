const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { chat, listProviders } = require('../src/services/ai/llm.provider');
const { validateNewsContent } = require('../src/services/ai/investigative-leads.service');

const keys = ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'GITHUB_MODELS_TOKEN'];
let original;
beforeEach(() => {
  original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  process.env.OPENROUTER_API_KEY = 'test-key-never-real';
});
afterEach(() => keys.forEach((key) => {
  if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
}));

const options = { system: 'Retorne JSON.', user: 'Consulta.', jsonMode: true, freeOnly: true, timeoutMs: 1000 };
const success = (content = '{}', finish = 'stop') => Response.json({ model: 'selected/free-model:free', choices: [{ message: { content }, finish_reason: finish }] });
const input = { company: { razaoSocial: 'Empresa Exemplo' }, shareholders: [] };
const validPlan = JSON.stringify({ consultas: [{ termo: 'Empresa Exemplo Recife', canal: 'news', alvo: 'empresa', motivo: 'Contexto' }] });

test('usa router, exige parâmetros e preço zero, sem plugins pagos', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.model, 'openrouter/free');
    assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0, request: 0 });
    assert.equal(body.provider.require_parameters, true);
    assert.equal(body.response_format.type, 'json_object');
    assert.equal(body.plugins, undefined);
    return success();
  });
  const result = await chat(options);
  assert.equal(result.model, 'selected/free-model:free');
});

test('bloqueia modelo pago e variantes com online/preset sem executar chamada', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('não deveria chamar um modelo pago'));
  for (const model of ['openrouter/auto', 'vendor/paid', 'vendor/model:online:free', 'openrouter/free:online']) {
    process.env.OPENROUTER_MODEL = model;
    assert.equal(listProviders().find((p) => p.id === 'openrouter-free').configured, false);
    await assert.rejects(chat(options), (e) => e.code === 'AI_COST_GUARD');
  }
});

test('404 no modelo específico tenta o roteador gratuito uma única vez', async (t) => {
  process.env.OPENROUTER_MODEL = 'vendor/retired:free';
  const models = [];
  t.mock.method(globalThis, 'fetch', async (_url, opts) => {
    models.push(JSON.parse(opts.body).model);
    return models.length === 1 ? Response.json({ error: { code: 404 } }, { status: 404 }) : success();
  });
  await chat(options);
  assert.deepEqual(models, ['vendor/retired:free', 'openrouter/free']);
});

test('sem endpoint para schema faz fallback JSON, mantendo validação local', async (t) => {
  const formats = [];
  t.mock.method(globalThis, 'fetch', async (_url, opts) => {
    formats.push(JSON.parse(opts.body).response_format.type);
    return formats.length === 1 ? Response.json({ error: { code: 404 } }, { status: 404 }) : success(validPlan);
  });
  await chat({ ...options, jsonSchema: { type: 'object' }, validateContent: (s) => validateNewsContent(s, input) });
  assert.deepEqual(formats, ['json_schema', 'json_object']);
});

test('erro 429 dentro de HTTP 200 mantém cota, Retry-After e não chama Groq', async (t) => {
  process.env.GROQ_API_KEY = 'also-not-real';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: { code: 429 } }, { headers: { 'Retry-After': '90' } }); });
  await assert.rejects(chat(options), (e) => e.status === 429 && e.retryAfterSeconds === 90);
  assert.equal(calls, 1);
});

for (const status of [401, 402, 403]) test(`HTTP ${status} não é repetido`, async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: { code: status } }, { status }); });
  await assert.rejects(chat(options), (e) => e.status === status);
  assert.equal(calls, 1);
});

test('503 com Retry-After não gera repetição antecipada', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({}, { status: 503, headers: { 'Retry-After': '60' } }); });
  await assert.rejects(chat(options), (e) => e.retryAfterSeconds === 60);
  assert.equal(calls, 1);
});

test('JSON sintaticamente válido com nomes inventados é recusado e repetido no máximo uma vez', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return success(calls === 1 ? validPlan.replace('Empresa Exemplo', 'Outra Empresa') : validPlan); });
  const r = await chat({ ...options, validateContent: (s) => validateNewsContent(s, input) });
  assert.equal(calls, 2);
  assert.equal(r.content, validPlan);
});

test('resposta truncada não é apresentada como válida', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return success('{"consultas":', 'length'); });
  await assert.rejects(chat(options), (e) => e.code === 'AI_TRUNCATED');
  assert.equal(calls, 2);
});

test('timeout abrange corpo que nunca termina, cancelando a requisição', async (t) => {
  const signals = [];
  t.mock.method(globalThis, 'fetch', async (_url, opts) => {
    signals.push(opts.signal);
    return { ok: true, headers: new Headers(), json: () => new Promise(() => {}) };
  });
  await assert.rejects(chat({ ...options, timeoutMs: 40 }), (e) => e.status === 504);
  assert.ok(signals.length <= 2);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('cancelamento externo não inicia retentativa', async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; controller.abort(); return new Promise(() => {}); });
  await assert.rejects(chat({ ...options, signal: controller.signal }));
  assert.equal(calls, 1);
});
