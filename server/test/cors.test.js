// ==========================================================
// DILIGÊNCIA 360 — CORS do backend
//
// Em produção a diligência parou com "Não foi possível falar com o
// servidor", que é o `TypeError` do fetch quando o navegador recusa a
// resposta. A causa era CORS emitido em dois lugares: o middleware
// `cors()` do Express e um bloco `headers` no `vercel.json`. A borda da
// Vercel soma os seus cabeçalhos aos que a função devolveu, então a
// resposta chegava com `Access-Control-Allow-Origin` repetido — e a
// especificação do fetch manda recusar quando há mais de um.
//
// Estes testes fixam a regra: quem responde por CORS é o Express, em um
// lugar só.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../src/app');

const ORIGIN_PRODUCAO = 'https://diligencia-suape.vercel.app';

/** Sobe o app numa porta efêmera e devolve a resposta crua da requisição. */
function requisitar({ method, caminho, headers }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const req = http.request(
        { host: '127.0.0.1', port, path: caminho, method, headers },
        (res) => {
          res.resume();
          res.on('end', () => {
            server.close(() => resolve({ status: res.statusCode, headers: res.headers, raw: res.rawHeaders }));
          });
        }
      );
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

/** Conta quantas vezes um cabeçalho aparece na resposta crua. */
function contarCabecalho(rawHeaders, nome) {
  const alvo = nome.toLowerCase();
  let total = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (String(rawHeaders[i]).toLowerCase() === alvo) total += 1;
  }
  return total;
}

test('o preflight responde com um único Access-Control-Allow-Origin', async () => {
  const res = await requisitar({
    method: 'OPTIONS',
    caminho: '/api/empresa/56211027000269',
    headers: {
      Origin: ORIGIN_PRODUCAO,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });

  assert.ok(res.status === 204 || res.status === 200, `preflight devolveu ${res.status}`);
  assert.equal(
    contarCabecalho(res.raw, 'access-control-allow-origin'),
    1,
    'mais de um Access-Control-Allow-Origin faz o navegador recusar a resposta'
  );
  assert.equal(res.headers['access-control-allow-origin'], ORIGIN_PRODUCAO);
  assert.match(res.headers['access-control-allow-headers'] || '', /Authorization/i);
});

test('a resposta comum também traz um único Access-Control-Allow-Origin', async () => {
  const res = await requisitar({
    method: 'GET',
    caminho: '/api/status',
    headers: { Origin: ORIGIN_PRODUCAO },
  });

  assert.equal(contarCabecalho(res.raw, 'access-control-allow-origin'), 1);
  assert.equal(res.headers['access-control-allow-origin'], ORIGIN_PRODUCAO);
});

test('origem não autorizada não recebe liberação de CORS', async () => {
  const res = await requisitar({
    method: 'GET',
    caminho: '/api/status',
    headers: { Origin: 'https://site-de-terceiro.example' },
  });

  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('o vercel.json do backend não declara cabeçalhos de CORS', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8')
  );

  const declarados = (config.headers || [])
    .flatMap((entrada) => entrada.headers || [])
    .map((cabecalho) => String(cabecalho.key).toLowerCase())
    .filter((chave) => chave.startsWith('access-control-'));

  assert.deepEqual(
    declarados,
    [],
    'CORS na borda soma com o do Express e duplica o cabeçalho; quem responde por CORS é o app'
  );

  // O rewrite continua necessário: sem ele a função não recebe as rotas
  // do Express, inclusive o OPTIONS do preflight.
  assert.ok(
    (config.rewrites || []).some((regra) => regra.destination === '/index.js'),
    'o rewrite para /index.js precisa existir para o Express receber todas as rotas'
  );
});

// ==========================================================
// Superfície pública da API
// ==========================================================

test('a raiz se identifica em vez de devolver página em branco', async () => {
  const res = await requisitar({ method: 'GET', caminho: '/', headers: {} });

  // Com a SPA ao lado, a raiz serve o index.html; publicada sozinha, como
  // na Vercel, precisa dizer o que é e onde está o diagnóstico.
  const tipo = String(res.headers['content-type'] || '');
  assert.equal(res.status, 200);
  assert.ok(
    tipo.includes('application/json') || tipo.includes('text/html'),
    `a raiz precisa responder algo legível, veio "${tipo}"`
  );
});

test('rota de API inexistente devolve JSON, não página de erro', async () => {
  const res = await requisitar({ method: 'GET', caminho: '/api/rota-que-nao-existe', headers: {} });

  assert.equal(res.status, 404);
  assert.match(String(res.headers['content-type'] || ''), /application\/json/);
});
