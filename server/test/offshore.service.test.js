// ==========================================================
// DILIGÊNCIA 360 — Reconciliação ICIJ em lotes
//
// A consulta antiga mandava empresa e sócios num POST só. Quando o ICIJ
// demorava, a etapa inteira virava "Fonte indisponível" — inclusive a
// consulta da empresa, que é a que mais importa. Estes testes fixam o
// comportamento em lotes: uma falha derruba só o lote dela, e o que não
// foi consultado é declarado em vez de virar silêncio.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const { OffshoreService } = require('../src/services/offshore.service');

const EMPRESA = { razaoSocial: 'TMP TERMINAIS LTDA', cnpj: '56211027000269', nomeFantasia: '' };

/** Sócios suficientes para forçar mais de um lote. */
const socios = (quantidade) =>
  Array.from({ length: quantidade }, (_, i) => ({ nome_socio: `SOCIO NUMERO ${i + 1}` }));

/** Resposta de reconciliação sem nenhuma correspondência. */
function respostaVazia(body) {
  const queries = JSON.parse(body).queries;
  const payload = Object.fromEntries(Object.keys(queries).map((chave) => [chave, { result: [] }]));
  return { ok: true, status: 200, json: async () => payload };
}

function comFetch(implementacao, executar) {
  const original = global.fetch;
  global.fetch = implementacao;
  return executar().finally(() => { global.fetch = original; });
}

test('divide os nomes em lotes em vez de um POST único', async () => {
  const tamanhos = [];

  const resultado = await comFetch(
    async (_url, opcoes) => {
      tamanhos.push(Object.keys(JSON.parse(opcoes.body).queries).length);
      return respostaVazia(opcoes.body);
    },
    () => OffshoreService.search({ company: EMPRESA, shareholders: socios(11) })
  );

  assert.ok(tamanhos.length > 1, `esperava mais de um lote, houve ${tamanhos.length}`);
  assert.ok(Math.max(...tamanhos) <= 8, 'lote grande é justamente o que estoura o prazo do ICIJ');
  assert.equal(tamanhos.reduce((a, b) => a + b, 0), 12, 'todos os nomes precisam ser consultados');
  assert.equal(resultado.ok, true);
  assert.equal(resultado.parcial, false);
  assert.equal(resultado.nomesConsultados, 12);
});

test('um lote que falha não derruba os demais, e os nomes perdidos são declarados', async () => {
  let chamada = 0;

  const resultado = await comFetch(
    async (_url, opcoes) => {
      chamada += 1;
      // O primeiro lote passa; o segundo falha nas duas tentativas.
      if (chamada === 1) return respostaVazia(opcoes.body);
      return { ok: false, status: 503, json: async () => ({}) };
    },
    () => OffshoreService.search({ company: EMPRESA, shareholders: socios(8) })
  );

  assert.equal(resultado.ok, true, 'o lote que respondeu precisa ser aproveitado');
  assert.equal(resultado.parcial, true);
  assert.ok(resultado.nomesNaoConsultados.length > 0);
  assert.ok(
    resultado.nomesConsultados < resultado.totalQueries,
    'resultado parcial não pode ser apresentado como consulta completa'
  );
});

test('quando nenhum lote responde, a falha é declarada e nada vira "nada consta"', async () => {
  const resultado = await comFetch(
    async () => { throw new Error('rede fora'); },
    () => OffshoreService.search({ company: EMPRESA, shareholders: [] })
  );

  assert.equal(resultado.ok, false);
  assert.equal(resultado.nomesConsultados, 0);
  assert.match(resultado.erro, /ICIJ/);
  assert.deepEqual(resultado.candidates, []);
});

test('falha momentânea do ICIJ é repetida uma vez antes de desistir do lote', async () => {
  let tentativas = 0;

  const resultado = await comFetch(
    async (_url, opcoes) => {
      tentativas += 1;
      if (tentativas === 1) return { ok: false, status: 429, json: async () => ({}) };
      return respostaVazia(opcoes.body);
    },
    () => OffshoreService.search({ company: EMPRESA, shareholders: [] })
  );

  assert.equal(tentativas, 2, 'HTTP 429 é estado momentâneo; vale uma segunda tentativa');
  assert.equal(resultado.ok, true);
  assert.equal(resultado.parcial, false);
});

test('erro de pedido malformado não é repetido', async () => {
  let tentativas = 0;

  await comFetch(
    async () => { tentativas += 1; return { ok: false, status: 400, json: async () => ({}) }; },
    () => OffshoreService.search({ company: EMPRESA, shareholders: [] })
  );

  assert.equal(tentativas, 1, 'repetir um 400 só gasta o prazo da diligência');
});
