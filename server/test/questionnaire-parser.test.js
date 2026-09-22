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

// O questionário devolvido pelo TMP Terminais é documento real de um
// fornecedor, com nome, RG e e-mail de pessoas identificadas, e por isso
// não é versionado. Quando alguém o coloca em `server/test/fixtures/`, o
// teste roda contra ele; sem o arquivo, ele pula em vez de reprovar a
// suíte inteira por uma dependência que o repositório não pode carregar.
// A leitura automática de PDF saiu do sistema: a biblioteca derrubava a
// função inteira no runtime da Vercel. O contrato agora é recusar o
// formato com uma orientação, jamais devolver resposta adivinhada — que
// era justamente o risco que este teste cobria antes, quando o texto
// descritivo da pergunta podia ser lido como um "Sim".
test('PDF é recusado com orientação, sem inventar resposta', async () => {
  const doc = new PDFDocument();
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const bufferPromise = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.text('QUESTIONÁRIO DE DILIGÊNCIA SUAPE');
  doc.text('Contratação sujeita à alçada do conselho de administração? Não');
  doc.end();

  const pdfBuffer = await bufferPromise;
  const erro = await parseSuapeQuestionnaire(pdfBuffer, 'questionario.pdf').then(
    (r) => new Error(`deveria ter recusado, mas devolveu ${JSON.stringify(r).slice(0, 80)}`),
    (e) => e
  );

  assert.match(erro.message, /transcrição por IA/i);
  assert.match(erro.message, /xlsx/i);
});

test('o serviço não expõe mais leitura de PDF', () => {
  const servico = require('../src/services/questionnaire-parser.service');
  assert.equal(servico.parseSuapePdf, undefined);
  assert.equal(typeof servico.parseSuapeXlsx, 'function');
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
    ['8.1 Programa de integridade', 'Sim'],
    ['8.2 Código de conduta', 'Sim'],
    ['8.3 Sanções internas', 'Não'],
    ['8.4 Brindes', 'Sim'],
    ['8.5 Conflito de interesses', 'Não'],
    ['8.6 Contratos públicos', 'Sim'],
    ['8.7 Treinamento', 'Sim'],
    ['8.8 Comunicação', 'Não'],
    ['8.9 Controle de participação', 'Sim'],
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
  assert.equal(result.rawAnswers['8.3'], false);
  assert.equal(result.rawAnswers['8.8'], false);
  assert.equal(result.flagsIntegridade.detalhes.maturidade['8.9'], true);
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
