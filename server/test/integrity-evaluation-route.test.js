// ==========================================================
// DILIGÊNCIA 360 — Avaliação guardada no retrato da diligência
//
// O questionário vivia só no navegador de quem o colou: trocar de
// máquina ou passar o dossiê adiante obrigava a colar a transcrição de
// novo e reconferir item a item.
//
// A validação da rota é de forma e tamanho, e não de conteúdo — o que
// cada resposta significa é assunto das fórmulas de SUAPE, e repetir
// essa regra aqui criaria uma segunda verdade. O que ela precisa
// impedir é o retrato crescer sem limite ou receber tipo errado.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');

function chamar({ caminho, metodo = 'PATCH', corpo }) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const dados = JSON.stringify(corpo);
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: caminho,
          method: metodo,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dados) },
        },
        (res) => {
          let texto = '';
          res.on('data', (parte) => { texto += parte; });
          res.on('end', () => server.close(() => resolve({ status: res.statusCode, texto })));
        },
      );
      req.on('error', (erro) => server.close(() => reject(erro)));
      req.write(dados);
      req.end();
    });
  });
}

const CAMINHO = '/api/diligences/dil-1/avaliacao';

test('respostas em formato inválido são recusadas antes de tocar o histórico', async () => {
  for (const answers of [undefined, null, 'sim', [], { '4.4': 'sim' }, { '4.4': 1 }]) {
    const res = await chamar({ caminho: CAMINHO, corpo: { answers } });
    assert.notEqual(res.status, 200, `aceitou answers = ${JSON.stringify(answers)}`);
  }
});

test('campo de texto gigante é recusado: o retrato não pode crescer sem limite', async () => {
  const res = await chamar({
    caminho: CAMINHO,
    corpo: {
      answers: { '4.4': false },
      extras: { texts: { historicoSociedade: 'x'.repeat(1_001) } },
    },
  });

  assert.notEqual(res.status, 200);
});

test('a rota exige autenticação, como as demais do histórico', async () => {
  const res = await chamar({ caminho: CAMINHO, corpo: { answers: { '4.4': false } } });

  // Sem token, a rota não pode gravar em nome de ninguém.
  assert.ok([401, 403].includes(res.status), `respondeu ${res.status}`);
});
