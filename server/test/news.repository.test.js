// ==========================================================
// DILIGÊNCIA 360 — Aba legível de publicações
//
// As notícias já iam para a planilha dentro do retrato comprimido da
// diligência, o que serve ao sistema e não serve a ninguém que abra a
// planilha. Esta aba é o espelho legível: uma linha por publicação.
//
// Dois comportamentos precisam valer sempre. A aba se cria sozinha, ou
// cada planilha nova vira um passo manual com nome e colunas digitados
// à mão. E salvar de novo reescreve as linhas desta diligência em vez
// de empilhar outra cópia — revisar e salvar outra vez é o caso comum.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const { setGoogleSheetsClientForTests } = require('../src/config/google-sheets');
const { NewsRepository } = require('../src/repositories/news.repository');

class PlanilhaFalsa {
  constructor({ abas = [] } = {}) {
    this.abas = new Set(abas);
    this.linhas = [];
    this.cabecalho = null;
    this.limpezas = 0;
  }

  isConfigured() { return true; }

  async ensureSheet(title, headers) {
    if (this.abas.has(title)) return false;
    this.abas.add(title);
    this.cabecalho = headers;
    return true;
  }

  async getValues() { return this.linhas.map((linha) => [...linha]); }

  async clearValues() { this.limpezas += 1; this.linhas = []; return {}; }

  async updateValues(_range, values) { this.linhas = values.map((linha) => [...linha]); return {}; }
}

const PUBLICACAO = {
  id: 'pub-1',
  title: 'Operação apura contratos no porto',
  url: 'https://jornal.test/economia/operacao',
  domain: 'jornal.test',
  snippet: 'O Ministério Público apura contratos.',
  publishedAt: '2026-09-18T10:12:00Z',
  matchedTerms: ['contrato', 'auditoria'],
  matchStrength: 'high',
  status: 'pending',
  providerSources: ['bing-news-rss', 'google-news-rss'],
  subjectName: 'TMP TERMINAIS S/A',
  relatedSubjects: [{ subjectType: 'person', subjectName: 'FULANO DE TAL' }],
};

const DILIGENCIA = { id: 'dil-1', cnpj: '56211027000269', razaoSocial: 'TMP TERMINAIS S/A' };

test('cria a aba com o cabeçalho quando ela ainda não existe', async () => {
  const planilha = new PlanilhaFalsa();
  setGoogleSheetsClientForTests(planilha);

  const resultado = await NewsRepository.salvarPublicacoes({
    diligencia: DILIGENCIA,
    publicacoes: [PUBLICACAO],
  });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.abaCriada, true);
  assert.deepEqual(planilha.cabecalho, [...NewsRepository.CABECALHO]);
  assert.equal(resultado.linhas, 1);
});

test('uma publicação vira uma linha legível, com o link e o veículo', async () => {
  const planilha = new PlanilhaFalsa();
  setGoogleSheetsClientForTests(planilha);

  await NewsRepository.salvarPublicacoes({ diligencia: DILIGENCIA, publicacoes: [PUBLICACAO] });

  const [linha] = planilha.linhas;
  const coluna = (nome) => linha[NewsRepository.CABECALHO.indexOf(nome)];

  assert.equal(coluna('diligencia_id'), 'dil-1');
  assert.equal(coluna('cnpj'), '56211027000269');
  assert.equal(coluna('titulo'), 'Operação apura contratos no porto');
  assert.equal(coluna('link'), 'https://jornal.test/economia/operacao');
  assert.equal(coluna('fonte'), 'jornal.test');
  assert.equal(coluna('termos_de_atencao'), 'contrato, auditoria');
  assert.equal(coluna('correlacao'), 'Alta');
  assert.equal(coluna('status_revisao'), 'Pendente');
  assert.match(coluna('sujeito_pesquisado'), /TMP TERMINAIS.*FULANO DE TAL/);
});

test('salvar de novo reescreve esta diligência e preserva as outras', async () => {
  const planilha = new PlanilhaFalsa({ abas: [NewsRepository.ABA] });
  planilha.linhas = [
    ['dil-outra', '00000000000191', 'OUTRA EMPRESA', '2026-01-01T00:00:00Z', '', 'Notícia alheia', 'outro.test', 'https://outro.test/a', '', '', '', 'Pendente', '', ''],
    ['dil-1', '56211027000269', 'TMP TERMINAIS S/A', '2026-01-01T00:00:00Z', '', 'Versão antiga', 'jornal.test', 'https://jornal.test/velho', '', '', '', 'Pendente', '', ''],
  ];
  setGoogleSheetsClientForTests(planilha);

  await NewsRepository.salvarPublicacoes({ diligencia: DILIGENCIA, publicacoes: [PUBLICACAO] });

  const daDiligencia = planilha.linhas.filter((linha) => linha[0] === 'dil-1');
  const deOutras = planilha.linhas.filter((linha) => linha[0] === 'dil-outra');

  assert.equal(daDiligencia.length, 1, 'salvar duas vezes não pode duplicar a lista');
  assert.equal(daDiligencia[0][5], 'Operação apura contratos no porto');
  assert.equal(deOutras.length, 1, 'a aba é compartilhada; outras diligências ficam onde estão');
  assert.ok(planilha.limpezas > 0, 'lista que encolhe precisa apagar as sobras do salvamento anterior');
});

test('lista vazia apaga as linhas desta diligência, e não é erro', async () => {
  const planilha = new PlanilhaFalsa({ abas: [NewsRepository.ABA] });
  planilha.linhas = [['dil-1', '', '', '', '', 'Antiga', '', '', '', '', '', '', '', '']];
  setGoogleSheetsClientForTests(planilha);

  const resultado = await NewsRepository.salvarPublicacoes({ diligencia: DILIGENCIA, publicacoes: [] });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.linhas, 0);
  assert.deepEqual(planilha.linhas, []);
});

test('falha da planilha é devolvida, nunca lançada: o histórico já foi gravado', async () => {
  const planilha = new PlanilhaFalsa();
  planilha.ensureSheet = async () => { throw new Error('cota da API esgotada'); };
  setGoogleSheetsClientForTests(planilha);

  const resultado = await NewsRepository.salvarPublicacoes({
    diligencia: DILIGENCIA,
    publicacoes: [PUBLICACAO],
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /cota/);
});

test('planilha não configurada é dito, e não confundido com sucesso', async () => {
  setGoogleSheetsClientForTests({ isConfigured: () => false });

  const resultado = await NewsRepository.salvarPublicacoes({
    diligencia: DILIGENCIA,
    publicacoes: [PUBLICACAO],
  });

  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /não configurada/i);
});
