const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { parseSuapeQuestionnaire, normalizeAnswer, isPdfBuffer } = require('../src/services/questionnaire-parser.service');

test('normalizeAnswer normalizes various affirmative and negative strings', () => {
  assert.equal(normalizeAnswer('Sim'), 'Sim');
  assert.equal(normalizeAnswer('sim'), 'Sim');
  assert.equal(normalizeAnswer('X'), 'Sim');
  assert.equal(normalizeAnswer('x'), 'Sim');
  assert.equal(normalizeAnswer('TRUE'), 'Sim');
  assert.equal(normalizeAnswer('Não'), 'Não');
  assert.equal(normalizeAnswer('nao'), 'Não');
  assert.equal(normalizeAnswer('FALSE'), 'Não');
  assert.equal(normalizeAnswer(''), null);
});

test('parseSuapeQuestionnaire correctly parses Questionario_de_Diligencia_2026-2.xlsx', async () => {
  const filePath = path.join(__dirname, '../../Questionario_de_Diligencia_2026-2.xlsx');
  if (!fs.existsSync(filePath)) {
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const result = await parseSuapeQuestionnaire(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.sheetIdentificada, 'Questionário');
  assert.ok(result.flagsIntegridade);
  // In the file Questionario_de_Diligencia_2026-2.xlsx, cell B89 (5.2) is filled as 'Sim'
  assert.equal(result.respostas['5.2'], 'Sim');
  assert.equal(result.flagsIntegridade.n23_corrupcaoOuCrimes, true);
  assert.equal(result.flagsIntegridade.riscoCalculado, 'Muito Alto');
});

test('parseSuapeQuestionnaire correctly parses Avaliação de Integridade - xx.xlsx', async () => {
  const filePath = path.join(__dirname, '../../Avaliação de Integridade - xx.xlsx');
  if (!fs.existsSync(filePath)) {
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const result = await parseSuapeQuestionnaire(buffer);

  assert.equal(result.ok, true);
  assert.equal(result.sheetIdentificada, 'CheckList');
  assert.ok(result.flagsIntegridade);
});

test('parseSuapeQuestionnaire correctly parses Questionnaire returned as PDF', async () => {
  // Cria dinamicamente um PDF em buffer simulando um questionário preenchido por fornecedor
  const doc = new PDFDocument();
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  
  const bufferPromise = new Promise(resolve => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  doc.text('COMPLEXO INDUSTRIAL PORTUÁRIO DE SUAPE');
  doc.text('QUESTIONÁRIO DE DILIGÊNCIA DE INTEGRIDADE');
  doc.text('Razão Social: TECNOLOGIA E SERVIÇOS LTDA');
  doc.text('CNPJ: 11.222.333/0001-44');
  doc.text('Processo: SEI: 0005551234.000123/2026-99');
  doc.text('Diretoria: DGP');
  doc.text('Valor Global Estimado: R$ 85.000,00');
  doc.text('4.4 A pessoa jurídica já foi condenada por crimes de corrupção? [ ] Sim  [X] Não');
  doc.text('5.2 Os sócios foram condenados por crimes de lavagem de dinheiro? [ ] Sim  [X] Não');
  doc.text('7.1 O objeto envolve atividade regulada? [ ] Sim  [X] Não');
  doc.text('7.2 São necessárias licenças ordinárias para o exercício da atividade? [X] Sim  [ ] Não');
  doc.text('7.3 É esperado obter autorizações pelo contrato? [ ] Sim  [X] Não');
  doc.text('7.4 Haverá interação com agentes públicos? [ ] Sim  [X] Não');
  doc.text('7.5 Contratação de terceiros para representação? [ ] Sim  [X] Não');
  doc.text('7.6 Há PEP no quadro de sócios? [ ] Sim  [X] Não');
  doc.text('7.7 Há familiares de PEP? [ ] Sim  [X] Não');
  doc.text('7.8 Parentesco com empregados de SUAPE? [ ] Sim  [X] Não');
  doc.text('7.9 Participação governamental no capital? [ ] Sim  [X] Não');
  doc.end();

  const pdfBuffer = await bufferPromise;
  assert.equal(isPdfBuffer(pdfBuffer), true);

  const result = await parseSuapeQuestionnaire(pdfBuffer);
  assert.equal(result.ok, true);
  assert.equal(result.formato, 'PDF');
  assert.equal(result.dadosGerais.razaoSocial, 'TECNOLOGIA E SERVIÇOS LTDA');
  assert.equal(result.dadosGerais.cnpj, '11.222.333/0001-44');
  assert.equal(result.dadosGerais.processoSei, 'SEI: 0005551234.000123/2026-99');
  assert.equal(result.dadosGerais.diretoria, 'DGP');
  assert.equal(result.dadosGerais.valorContrato, 85000);
  assert.equal(result.respostas['4.4'], 'Não');
  assert.equal(result.respostas['7.2'], 'Sim');
  assert.equal(result.flagsIntegridade.n29_licencasOrdinarias, true);
  assert.equal(result.flagsIntegridade.riscoCalculado, 'Médio');
});
