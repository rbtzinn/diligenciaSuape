// ==========================================================
// DILIGÊNCIA 360 — Linha do Mapa de Risco na planilha
//
// A avaliação de integridade termina numa linha de 40 colunas no layout
// de SUAPE, que até então só podia ser copiada e colada à mão.
//
// O que estes testes protegem: o bloco oficial A..AN não ganha coluna
// no meio; salvar de novo regrava a linha daquela diligência em vez de
// criar outra; e nenhuma linha vizinha é tocada, porque o Mapa é
// histórico e o analista escreve nele.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const { setGoogleSheetsClientForTests } = require('../src/config/google-sheets');
const { RiskMapRepository } = require('../src/repositories/risk-map.repository');

const CABECALHO = Array.from({ length: 40 }, (_, i) => `COLUNA ${i + 1}`);
const valoresDe = (marca) => Array.from({ length: 40 }, (_, i) => `${marca}-${i + 1}`);

class PlanilhaFalsa {
  constructor({ existente = false, titulos = null, linhas = [] } = {}) {
    this.criada = !existente;
    this.titulos = titulos || (existente ? [...CABECALHO, 'diligencia_id'] : null);
    this.linhas = linhas;
    this.anexadas = [];
  }

  isConfigured() { return true; }

  async ensureSheet(_title, headers) {
    if (this.titulos) return false;
    this.titulos = headers;
    return true;
  }

  async getValues(range) {
    if (/!A1:/.test(range)) return [this.titulos || []];
    return this.linhas.map((linha) => [...linha]);
  }

  async appendValues(_range, values) {
    this.linhas.push(...values.map((linha) => [...linha]));
    this.anexadas.push(...values);
    return {};
  }

  async updateValues(range, values) {
    const numero = Number(/!A(\d+):/.exec(range)?.[1]);
    this.linhas[numero - 2] = [...values[0]];
    return {};
  }
}

test('cria a aba com as 40 colunas oficiais e a chave depois delas', async () => {
  const planilha = new PlanilhaFalsa();
  setGoogleSheetsClientForTests(planilha);

  const resultado = await RiskMapRepository.salvarLinha({
    diligenciaId: 'dil-1',
    cabecalho: CABECALHO,
    valores: valoresDe('a'),
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.abaCriada, true);
  assert.equal(planilha.titulos.length, 41);
  assert.deepEqual(planilha.titulos.slice(0, 40), CABECALHO, 'o bloco oficial vai inteiro em A..AN');
  assert.equal(planilha.titulos[40], 'diligencia_id', 'a chave vem depois, nunca no meio');
});

test('a chave da diligência ocupa a coluna 41, fora do bloco oficial', async () => {
  const planilha = new PlanilhaFalsa();
  setGoogleSheetsClientForTests(planilha);

  await RiskMapRepository.salvarLinha({
    diligenciaId: 'dil-1',
    cabecalho: CABECALHO,
    valores: valoresDe('a'),
  });

  const [linha] = planilha.linhas;
  assert.equal(linha.length, 41);
  assert.deepEqual(linha.slice(0, 40), valoresDe('a'));
  assert.equal(linha[40], 'dil-1');
});

test('salvar de novo atualiza a linha da diligência e não cria outra', async () => {
  const planilha = new PlanilhaFalsa({
    existente: true,
    linhas: [
      [...valoresDe('outra'), 'dil-outra'],
      [...valoresDe('antiga'), 'dil-1'],
    ],
  });
  setGoogleSheetsClientForTests(planilha);

  const resultado = await RiskMapRepository.salvarLinha({
    diligenciaId: 'dil-1',
    cabecalho: CABECALHO,
    valores: valoresDe('nova'),
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.criada, false);
  assert.equal(resultado.linha, 3, 'a segunda linha de dados é a linha 3 da planilha');
  assert.equal(planilha.linhas.length, 2, 'regravar não pode empilhar uma terceira versão');
  assert.equal(planilha.anexadas.length, 0);
  assert.deepEqual(planilha.linhas[1].slice(0, 40), valoresDe('nova'));
  assert.deepEqual(planilha.linhas[0].slice(0, 40), valoresDe('outra'), 'linha vizinha fica intacta');
});

test('diligência nova entra como linha adicional, porque o Mapa é histórico', async () => {
  const planilha = new PlanilhaFalsa({
    existente: true,
    linhas: [[...valoresDe('outra'), 'dil-outra']],
  });
  setGoogleSheetsClientForTests(planilha);

  const resultado = await RiskMapRepository.salvarLinha({
    diligenciaId: 'dil-nova',
    cabecalho: CABECALHO,
    valores: valoresDe('nova'),
  });

  assert.equal(resultado.criada, true);
  assert.equal(planilha.linhas.length, 2);
});

test('cabeçalho diferente do da aba recusa a gravação em vez de errar a coluna', async () => {
  const planilha = new PlanilhaFalsa({
    existente: true,
    titulos: ['OUTRA COISA', ...CABECALHO.slice(1), 'diligencia_id'],
  });
  setGoogleSheetsClientForTests(planilha);

  const resultado = await RiskMapRepository.salvarLinha({
    diligenciaId: 'dil-1',
    cabecalho: CABECALHO,
    valores: valoresDe('a'),
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /colunas da aba/i);
  assert.equal(planilha.linhas.length, 0, 'nada pode ser escrito quando as colunas não batem');
});

test('linha com número errado de colunas é recusada', async () => {
  setGoogleSheetsClientForTests(new PlanilhaFalsa());

  const curta = await RiskMapRepository.salvarLinha({
    diligenciaId: 'dil-1',
    cabecalho: CABECALHO,
    valores: valoresDe('a').slice(0, 39),
  });

  assert.equal(curta.ok, false);
  assert.match(curta.erro, /40 colunas/);
});

test('falha da planilha volta como falha, e não como exceção', async () => {
  const planilha = new PlanilhaFalsa();
  planilha.ensureSheet = async () => { throw new Error('permissão negada'); };
  setGoogleSheetsClientForTests(planilha);

  const resultado = await RiskMapRepository.salvarLinha({
    diligenciaId: 'dil-1',
    cabecalho: CABECALHO,
    valores: valoresDe('a'),
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /permissão/);
});
