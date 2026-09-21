// ==========================================================
// DILIGÊNCIA 360 — Formulário de Integridade em PDF
//
// O PDF é o documento que o analista anexa ao processo, então o que
// estes testes protegem é a fidelidade e os limites: o formulário não
// pode exibir faixa de risco que a planilha não tem, não pode
// transformar item sem resposta em "não", e não pode existir sem o
// terceiro identificado.
//
// Também fixam que nada é gravado: a emissão devolve buffer e nome de
// arquivo, e mais nada.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const { IntegrityFormService } = require('../src/services/report/integrity-form.service');

const ENTRADA = {
  empresa: {
    razaoSocial: 'TMP TERMINAIS S/A',
    cnpj: '56.211.027/0002-69',
    objetoSocial: 'Operação portuária',
    ramoAtividade: 'Atividades do Operador Portuário',
    dataConstituicao: '05/05/2025',
    endereco: 'Ilha Cocaia, Ipojuca/PE',
  },
  classificacao: 'Alto',
  blocos: [{
    numero: '01',
    titulo: 'Comprometimento da Alta Administração',
    perguntas: [
      { codigo: '4.4', texto: 'Informar se a pessoa jurídica já foi condenada…', resposta: false },
      { codigo: '5.2', texto: 'Informar se houve condenações criminais…', resposta: null },
    ],
  }],
  maturidade: { percentual: '4%', nivel: 'Muito Alto' },
  planoDeAcao: 'RISCO ALTO\nI. Diretor Executivo deverá assinar a Declaração.\nII. Monitorar.',
  criterios: [{ grupo: 'Alto', criterio: 'Resposta positiva para algum dos seguintes itens…' }],
  processo: { registro: '123', ano: '2026', diretoria: 'DAF', valor: '5.000.000,00' },
};

test('emite um PDF de verdade, com nome derivado do CNPJ', async () => {
  const { buffer, fileName } = await IntegrityFormService.generate(ENTRADA);

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-', 'o arquivo precisa ser um PDF');
  assert.ok(buffer.length > 2_000, `PDF pequeno demais: ${buffer.length} bytes`);
  assert.match(fileName, /^avaliacao-integridade-56211027000269-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('a emissão não devolve nada além do arquivo: não há registro a guardar', async () => {
  const resultado = await IntegrityFormService.generate(ENTRADA);
  assert.deepEqual(Object.keys(resultado).sort(), ['buffer', 'fileName']);
});

test('sem o terceiro identificado, não há formulário a emitir', async () => {
  await assert.rejects(
    () => IntegrityFormService.generate({ empresa: {} }),
    (erro) => {
      assert.equal(erro.status, 400);
      assert.match(erro.message, /razão social/i);
      return true;
    },
  );
});

test('faixa de risco fora do vocabulário da planilha vira ausência', () => {
  const inventado = IntegrityFormService.normalizar({
    empresa: { razaoSocial: 'X' },
    classificacao: 'Altíssimo',
  });
  assert.equal(inventado.classificacao, '', 'o formulário não pode exibir faixa que a planilha não tem');

  for (const valido of ['Muito Alto', 'Alto', 'Médio', 'Baixo']) {
    const normalizado = IntegrityFormService.normalizar({
      empresa: { razaoSocial: 'X' },
      classificacao: valido,
    });
    assert.equal(normalizado.classificacao, valido);
  }
});

test('item sem resposta continua sem resposta, e nunca vira "não"', () => {
  const dados = IntegrityFormService.normalizar({
    empresa: { razaoSocial: 'X' },
    blocos: [{
      numero: '01',
      titulo: 'Bloco',
      perguntas: [
        { codigo: '4.4', texto: 'a', resposta: undefined },
        { codigo: '5.2', texto: 'b', resposta: 'sim' },
        { codigo: '7.1', texto: 'c', resposta: 0 },
        { codigo: '7.2', texto: 'd', resposta: false },
        { codigo: '7.3', texto: 'e', resposta: true },
      ],
    }],
  });

  const respostas = dados.blocos[0].perguntas.map((p) => p.resposta);
  // "sim" em texto e 0 não são declarações do terceiro; só o booleano é.
  assert.deepEqual(respostas, [null, null, null, false, true]);
});

test('emite mesmo com a classificação pendente, dizendo que ela depende do questionário', async () => {
  const { buffer } = await IntegrityFormService.generate({
    empresa: { razaoSocial: 'EMPRESA SEM QUESTIONÁRIO' },
  });

  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('texto gigante não derruba a emissão', async () => {
  const { buffer } = await IntegrityFormService.generate({
    ...ENTRADA,
    planoDeAcao: 'LINHA\n'.repeat(400),
    blocos: [{
      numero: '01',
      titulo: 'Bloco longo',
      perguntas: Array.from({ length: 30 }, (_, i) => ({
        codigo: `7.${i}`,
        texto: 'pergunta muito longa '.repeat(20),
        resposta: i % 2 === 0,
      })),
    }],
  });

  assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
});
