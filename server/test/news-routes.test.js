const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const router = require('../src/routes/ai.routes');

function response() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.status = (value) => { res.statusCode = value; return res; };
  res.set = (key, value) => { res.headers[key] = value; return res; };
  res.json = (body) => { res.body = body; res.writableEnded = true; return res; };
  return res;
}
async function invoke(path, body) {
  const res = response();
  const route = router.stack.find((layer) => layer.route?.path === path).route;
  await route.stack[0].handle({ body }, res);
  return res;
}

test('as duas rotas ficam atrás da autenticação; sem token nenhuma fonte é chamada', async (t) => {
  const auth = router.stack.find((layer) => layer.name === 'authenticate');
  assert.ok(auth);
  assert.ok(router.stack.indexOf(auth) < router.stack.findIndex((layer) => layer.route?.path === '/news-research/plan'));
  t.mock.method(globalThis, 'fetch', () => assert.fail('sem token não deve chamar fontes'));
  const res = response();
  await auth.handle({ headers: {} }, res, () => assert.fail('acesso indevido'));
  assert.equal(res.statusCode, 401);
});

test('contrato real de rotas planeja com IA, busca no RSS e preserva falha de GDELT', async (t) => {
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldModel = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = 'fake-test';
  process.env.OPENROUTER_MODEL = 'openrouter/free';
  t.after(() => {
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.OPENROUTER_MODEL; else process.env.OPENROUTER_MODEL = oldModel;
  });
  const queries = [{ termo: 'Empresa Exemplo', canal: 'news', alvo: 'empresa', motivo: 'Menções' }];
  let aiCalls = 0;
  t.mock.method(globalThis, 'fetch', async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.hostname === 'openrouter.ai') {
      aiCalls++;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ consultas: queries }) } }] });
    }
    if (url.hostname === 'news.google.com') return new Response('<rss><channel><item><title>Notícia pública</title><link>https://example.org/noticia</link><description>Trecho</description><source url="https://example.org">Jornal</source></item></channel></rss>');
    if (url.hostname === 'api.gdeltproject.org') return new Response('Limitado', { status: 429 });
    throw new Error(`Fonte inesperada no teste: ${url.hostname}`);
  });
  const body = { empresa: { razaoSocial: 'Empresa Exemplo' } };
  const plan = await invoke('/news-research/plan', body);
  assert.equal(plan.statusCode, 200);
  assert.equal(plan.body.consultas.length, 1);
  const found = await invoke('/news-research/search', { ...body, consultas: plan.body.consultas });
  assert.equal(found.body.ok, true);
  assert.equal(found.body.resultados[0].url, 'https://example.org/noticia');
  assert.equal(found.body.partial, true);
  assert.ok(found.body.consultasExecutadas[0].attempts.some((a) => !a.ok && a.status === 429));
  assert.equal(aiCalls, 1, 'busca não pede outro plano à IA');
});
