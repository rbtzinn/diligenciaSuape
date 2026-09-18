const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const {
  parseSuapeQuestionnaire,
  normalizeAnswer,
  isPdfBuffer,
} = require('../src/services/questionnaire-parser.service');

function findFixture(filename) {
  const candidates = [
    path.join(__dirname, 'fixtures', filename),
    path.join(__dirname, '../../', filename),
    path.join(__dirname, '../../../', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

test('normalizeAnswer normaliza tri-state (true | false | null) sem inventar dados', () => {
  assert.equal(normalizeAnswer('Sim'), true);
  assert.equal(normalizeAnswer('sim'), true);
  assert.equal(normalizeAnswer('X'), true);
  assert.equal(normalizeAnswer('x'), true);
  assert.equal(normalizeAnswer('TRUE'), true);
  assert.equal(normalizeAnswer('verdadeiro'), true);
  assert.equal(normalizeAnswer('1'), true);

  assert.equal(normalizeAnswer('Não'), false);
  assert.equal(normalizeAnswer('nao'), false);
  assert.equal(normalizeAnswer('N'), false);
  assert.equal(normalizeAnswer('FALSE'), false);
  assert.equal(normalizeAnswer('falso'), false);
  assert.equal(normalizeAnswer('0'), false);

  assert.equal(normalizeAnswer(''), null);
  assert.equal(normalizeAnswer('   '), null);
  assert.equal(normalizeAnswer(null), null);
  assert.equal(normalizeAnswer(undefined), null);
  assert.equal(normalizeAnswer('indefinido'), null);
});

test('isPdfBuffer detecta assinatura %PDF corretamente', () => {
  assert.equal(isPdfBuffer(Buffer.from('%PDF-1.4')), true);
  assert.equal(isPdfBuffer(Buffer.from('PK\x03\x04')), false);
  assert.equal(isPdfBuffer(Buffer.from('hello')), false);
  assert.equal(isPdfBuffer(null), false);
  assert.equal(isPdfBuffer(Buffer.alloc(0)), false);
});

test('Parser com o PDF REAL QUESTIONARIO_CPL___TMP_TERMINAIS_SUAPE.pdf', async () => {
  const pdfPath = findFixture('QUESTIONARIO_CPL___TMP_TERMINAIS_SUAPE.pdf');
  assert.ok(pdfPath, 'Arquivo QUESTIONARIO_CPL___TMP_TERMINAIS_SUAPE.pdf deve existir para teste');

  const buffer = fs.readFileSync(pdfPath);
  const result = await parseSuapeQuestionnaire(buffer, 'QUESTIONARIO_CPL___TMP_TERMINAIS_SUAPE.pdf');

  assert.equal(result.ok, true);
  assert.equal(result.formato, 'PDF');

  // Dados Cadastrais extraídos fielmente do PDF real
  assert.equal(result.dadosGerais.cnpj, '56.211.027/0002-69');
  assert.equal(result.dadosGerais.razaoSocial, 'TMP TERMINAIS S/A');

  // Dados que NÃO existem no questionário devem ser estritamente null (sem invenção)
  assert.equal(result.dadosGerais.valorContrato, null);
  assert.equal(result.dadosGerais.processoSei, null);
  assert.equal(result.dadosGerais.diretoria, null);

  // Respostas extraídas página a página conforme preenchimento real do fornecedor
  const raw = result.rawAnswers;
  assert.equal(raw['4.4'], false, 'Item 4.4 no PDF real é Não');
  assert.equal(raw['5.2'], false, 'Item 5.2 no PDF real é Não');
  assert.equal(raw['7.1'], true, 'Item 7.1 no PDF real é Sim');
  assert.equal(raw['7.2'], true, 'Item 7.2 no PDF real é Sim');
  assert.equal(raw['7.3'], true, 'Item 7.3 no PDF real é Sim');
  assert.equal(raw['7.4'], true, 'Item 7.4 no PDF real é Sim');
  assert.equal(raw['7.5'], false, 'Item 7.5 no PDF real é Não');
  assert.equal(raw['7.6'], false, 'Item 7.6 no PDF real é Não');
  assert.equal(raw['7.7'], false, 'Item 7.7 no PDF real é Não');
  assert.equal(raw['7.8'], false, 'Item 7.8 no PDF real é Não');
  assert.equal(raw['7.9'], false, 'Item 7.9 no PDF real é Não');
  assert.equal(raw['8.2'], true, 'Item 8.2 no PDF real é Sim');
  assert.equal(raw['8.7'], true, 'Item 8.7 no PDF real é Sim');
  assert.equal(raw['9.0'], true, 'Item 9.0 no PDF real é Sim');

  // Flags e classificação de integridade
  assert.equal(result.flagsIntegridade.n23_corrupcaoOuCrimes, false);
  assert.equal(result.flagsIntegridade.n40_alcadaConselho, false);
  assert.equal(result.flagsIntegridade.n28_interacaoPublicaOuPep, true);
  assert.equal(result.flagsIntegridade.n29_licencasOrdinarias, true);
  assert.equal(result.flagsIntegridade.riscoCalculado, 'Alto');
});

test('Parser NÃO confunde texto descritivo da pergunta com resposta Sim nem ativa N40 indevidamente', async () => {
  const doc = new PDFDocument();
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const bufferPromise = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.text('QUESTIONÁRIO DE DILIGÊNCIA SUAPE');
  doc.text('Razão Social: EMPRESA TESTE LTDA');
  doc.text('CNPJ: 00.111.222/0001-33');
  doc.text('Contratação sujeita à alçada do conselho de administração? Não');
  doc.text('A empresa possui processos criminais de corrupção? Não');
  doc.text('Exerce atividade regulada? Não');
  doc.text('Possui licenças de funcionamento? Não');
  doc.end();

  const pdfBuffer = await bufferPromise;
  const result = await parseSuapeQuestionnaire(pdfBuffer);

  assert.equal(result.ok, true);
  assert.equal(result.flagsIntegridade.n40_alcadaConselho, false);
  assert.equal(result.flagsIntegridade.n23_corrupcaoOuCrimes, false);
});

test('Parser Excel com pasta de trabalho XLSX real e gerada', async () => {
  // Cria workbook XLSX sintético com abas e dados do questionário
  const wb = xlsx.utils.book_new();
  const wsData = [
    ['QUESTIONÁRIO DE DILIGÊNCIA SUAPE', ''],
    ['Razão Social', 'EMPRESA EXCEL TESTE LTDA'],
    ['CNPJ: 12.345.678/0001-90', ''],
    ['4.4 Corrupção e fraudes', 'Não'],
    ['5.2 Crimes dos sócios', 'Não'],
    ['7.1 Atividade regulada', 'Não'],
    ['7.2 Licenças ordinárias', 'Sim'],
    ['7.3 Licenças contratuais', 'Não'],
    ['7.4 Interação pública', 'Não'],
    ['8.2 Código de conduta', 'Sim'],
    ['8.7 Treinamento', 'Sim'],
    ['9.0 Compliance officer', 'Não'],
  ];
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'Questionário');

  const xlsxBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const result = await parseSuapeQuestionnaire(xlsxBuffer, 'questionario.xlsx');

  assert.equal(result.ok, true);
  assert.equal(result.formato, 'Excel');
  assert.equal(result.dadosGerais.razaoSocial, 'EMPRESA EXCEL TESTE LTDA');
  assert.equal(result.dadosGerais.cnpj, '12.345.678/0001-90');
  assert.equal(result.rawAnswers['7.2'], true);
  assert.equal(result.rawAnswers['8.2'], true);
  assert.equal(result.flagsIntegridade.n29_licencasOrdinarias, true);
  assert.equal(result.flagsIntegridade.riscoCalculado, 'Médio');
});

test('Parser suporta formato XLS clássico (BIFF8)', async () => {
  const wb = xlsx.utils.book_new();
  const wsData = [
    ['QUESTIONÁRIO DE DILIGÊNCIA SUAPE', ''],
    ['Razão Social', 'EMPRESA XLS TESTE S/A'],
    ['CNPJ: 98.765.432/0001-10', ''],
    ['4.4 Corrupção', 'Não'],
    ['7.1 Atividade Regulada', 'Sim'],
  ];
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'Questionário');

  const xlsBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'biff8' });
  const result = await parseSuapeQuestionnaire(xlsBuffer, 'antigo.xls');

  assert.equal(result.ok, true);
  assert.equal(result.formato, 'Excel');
  assert.equal(result.rawAnswers['7.1'], true);
  assert.equal(result.flagsIntegridade.n28_interacaoPublicaOuPep, true);
  assert.equal(result.flagsIntegridade.riscoCalculado, 'Alto');
});

test('Validação de segurança e limites de tamanho/formato', async () => {
  // Buffer vazio
  await assert.rejects(
    async () => parseSuapeQuestionnaire(Buffer.alloc(0)),
    /Arquivo não fornecido ou buffer vazio/
  );

  // Arquivo acima de 15MB
  const bigBuffer = Buffer.alloc(16 * 1024 * 1024);
  await assert.rejects(
    async () => parseSuapeQuestionnaire(bigBuffer, 'gigante.pdf'),
    /O arquivo excede o tamanho máximo permitido/
  );

  // Arquivo em formato inválido
  const invalidBuffer = Buffer.from('TEXTO_ALEATORIO_NAO_E_PDF_NEM_EXCEL');
  await assert.rejects(
    async () => parseSuapeQuestionnaire(invalidBuffer, 'arquivo.txt'),
    /Formato de arquivo não suportado/
  );
});
