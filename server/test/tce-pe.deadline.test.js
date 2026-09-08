// ==========================================================
// DILIGÊNCIA 360 — Orçamento de tempo da consulta ao TCE-PE
// ==========================================================
// A rota roda numa função com `maxDuration: 60` na Vercel. Sem teto
// próprio, quatro variantes de nome consultadas em série, a 20 s de
// timeout cada, já somam 80 s: a função morria no meio e o navegador
// recebia conexão cortada. O que chegava à tela era "TCE-PE
// indisponível", sem nada do que já havia sido apurado e sem motivo.
//
// As variáveis de ambiente são definidas antes do `require` porque o
// serviço lê o orçamento na carga do módulo. Cada arquivo do
// `node --test` roda no próprio processo, então isto não afeta os
// demais testes.
// ==========================================================

process.env.TCE_PE_DEADLINE_MS = '3000';
process.env.TCE_PE_CONCURRENCY = '3';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TcePeService } = require('../src/services/tce-pe.service');

// O cliente do TCE-PE guarda resposta por consulta, e o cache vive no
// módulo. Dois testes com a mesma empresa fariam o segundo ler do cache
// do primeiro e nunca chegar à rede — que é justamente o que eles
// precisam observar. Cada teste usa a sua.
function company(nome) {
  return {
    cnpj: '07868353000157',
    razaoSocial: `${nome} TERCEIRIZACOES DE MAO DE OBRA LTDA`,
    nomeFantasia: `${nome} SERVICOS`,
  };
}

function apiResponse(conteudo) {
  const corpo = JSON.stringify({ resposta: { status: 'OK', conteudo, tamanhoResultado: conteudo.length } });
  const bytes = Buffer.from(corpo, 'latin1');
  return {
    ok: true,
    status: 200,
    headers: {
      get: (nome) => (String(nome).toLowerCase() === 'content-type'
        ? 'application/json;charset=ISO-8859-1'
        : null),
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

test('estourar o orçamento devolve o que apurou, e declara o que não foi pesquisado', async () => {
  const originalFetch = global.fetch;
  // Fonte lenta em todos os termos. Com concorrência 3 e orçamento de
  // 3 s, a primeira leva de três consome 2 s e o que sobra já não cabe
  // uma consulta: o quarto termo não chega a começar. É o cenário que
  // matava a função em produção, com os 40 s reais comprimidos para o
  // teste rodar.
  global.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return apiResponse([]);
  };

  try {
    const inicio = Date.now();
    const resultado = await TcePeService.searchCompany(company('ALFAPRAZO'));
    const decorrido = Date.now() - inicio;

    // O ponto central: a rota termina, em vez de seguir consultando até
    // a função ser encerrada por fora.
    assert.ok(decorrido < 5_000, `a consulta demorou ${decorrido}ms — o orçamento não foi respeitado`);
    assert.equal(resultado.deadlineExceeded, true);
    assert.ok(resultado.consultasNaoIniciadas > 0, 'termos não iniciados deveriam ser contados');
    assert.equal(resultado.consultaParcial, true);

    // Termo não iniciado é lacuna declarada, e precisa ser distinguível
    // de termo que a fonte recusou.
    const naoIniciada = resultado.consultas.find((item) => item.naoIniciada);
    assert.ok(naoIniciada, 'a consulta não iniciada deveria constar na lista');
    assert.equal(naoIniciada.ok, false);
    assert.match(naoIniciada.erro, /Orçamento de tempo/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fonte que não responde em nenhum termo declara o motivo, não só o estado', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND sistemas.tce.pe.gov.br');
  };

  try {
    const resultado = await TcePeService.searchCompany(company('BETAFALHA'));

    assert.equal(resultado.ok, false);
    assert.equal(resultado.sourceStatus, 'UNAVAILABLE');
    // Sem isto o dossiê escrevia "TCE-PE não respondeu" e parava aí.
    assert.ok(resultado.erro, 'o motivo da falha precisa chegar ao dossiê');
    assert.match(resultado.aviso, /não significa ausência de processo/i);
    assert.deepEqual(resultado.processos, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('os termos são consultados em paralelo, não um após o outro', async () => {
  const originalFetch = global.fetch;
  let emVoo = 0;
  let maximoSimultaneo = 0;

  global.fetch = async () => {
    emVoo += 1;
    maximoSimultaneo = Math.max(maximoSimultaneo, emVoo);
    await new Promise((resolve) => setTimeout(resolve, 30));
    emVoo -= 1;
    return apiResponse([]);
  };

  try {
    const resultado = await TcePeService.searchCompany(company('GAMAPARALELO'));
    assert.ok(resultado.consultas.length > 1, 'a empresa de teste gera mais de um termo');
    assert.ok(
      maximoSimultaneo > 1,
      `as consultas ficaram em série (máximo simultâneo: ${maximoSimultaneo})`,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
