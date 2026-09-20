// ==========================================================
// DILIGÊNCIA 360 — SUAPE Questionnaire Parser Service
// Extração e normalização de questionários de diligência
// Suporta:
// 1. Planilhas Excel (.xlsx e .xls via biblioteca oficial 'xlsx')
// 2. PDF não é mais lido aqui; ver `pdfNaoSuportado` abaixo.
// Respostas tri-state: true ('Sim'), false ('Não'), null ('Não identificado')
// ==========================================================

const xlsx = require('xlsx');

/**
 * Normaliza respostas para tri-state:
 * true = 'Sim'
 * false = 'Não'
 * null = 'Não identificado' (proibido presumir falso silenciosamente)
 */
function normalizeAnswer(val) {
  if (val === true || val === false) return val;
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return null;

  const clean = val.trim().toLowerCase();
  if (['sim', 's', 'x', 'true', 'verdadeiro', '1'].includes(clean)) return true;
  if (['não', 'nao', 'n', 'false', 'falso', '0'].includes(clean)) return false;
  return null;
}

/**
 * Verifica assinatura mágica de PDF (%PDF)
 */
function isPdfBuffer(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer.slice(0, 4).toString() === '%PDF';
}

/**
 * A leitura automática de PDF foi retirada.
 *
 * A biblioteca `pdf-parse` embute o pdf.js, que avalia `DOMMatrix` — uma
 * API de navegador — ao ser carregada. No runtime da Vercel o polyfill
 * não existe, o módulo lança `ReferenceError: DOMMatrix is not defined` e
 * o processo morre: a API inteira respondia 500 em todas as rotas,
 * inclusive `/api/status`.
 *
 * Tirar a dependência do pacote resolve por construção — o que não está
 * no bundle não tem como ser carregado nem derrubar nada. O que se perde
 * já era o caminho menos confiável: no PDF a ordem de leitura separa o
 * enunciado da marcação, e o resultado saía para conferência item a
 * item. PDF, foto e digitalização passam pela transcrição por IA, e o
 * `.xlsx` original continua sendo lido aqui, célula a célula.
 */
function pdfNaoSuportado() {
  throw new Error(
    'A leitura automática de PDF não está disponível. Use a transcrição por IA, ' +
      'que aceita PDF, foto e digitalização, ou envie o questionário em .xlsx.'
  );
}

/**
 * Lê e analisa um arquivo Excel (.xlsx ou .xls) preenchido
 * @param {Buffer} buffer - Buffer do arquivo Excel
 */
function parseSuapeXlsx(buffer) {
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer', cellFormula: false });
  } catch (err) {
    throw new Error(`Falha ao ler arquivo Excel (.xlsx/.xls): ${err.message}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('A pasta de trabalho do Excel não possui planilhas válidas.');
  }

  // Identifica a melhor aba (procura por "Questionário", "Questionario", ou primeira não-apoio)
  let targetSheetName = workbook.SheetNames.find(
    (name) => name.toLowerCase().includes('question') || name.toLowerCase().includes('integridade')
  );
  if (!targetSheetName) {
    targetSheetName = workbook.SheetNames.find(
      (name) => !name.toLowerCase().includes('apoio') && !name.toLowerCase().includes('instru')
    ) || workbook.SheetNames[0];
  }

  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) {
    throw new Error(`Não foi possível abrir a planilha "${targetSheetName}".`);
  }

  // Converte a planilha para linhas de objetos para busca textual flexível
  const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1:Z300');

  const answers = {
    '4.4': null,
    '5.2': null,
    '7.1': null,
    '7.2': null,
    '7.3': null,
    '7.4': null,
    '7.5': null,
    '7.6': null,
    '7.7': null,
    '7.8': null,
    '7.9': null,
    '8.2': null,
    '8.7': null,
    '9.0': null,
    alcadaConselho: null,
  };

  // Helper para buscar células contendo o identificador e ler a resposta nas colunas vizinhas
  function findAnswerNear(query) {
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, 6); c++) {
        const addr = xlsx.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (cell && typeof cell.v === 'string' && cell.v.includes(query)) {
          // Busca nas células até 3 linhas abaixo e colunas adjacentes (C, D, E, F)
          for (let dr = 0; dr <= 3; dr++) {
            for (let dc = 0; dc <= 6; dc++) {
              const targetAddr = xlsx.utils.encode_cell({ r: r + dr, c: c + dc });
              const targetCell = sheet[targetAddr];
              if (targetCell) {
                const norm = normalizeAnswer(String(targetCell.v));
                if (norm !== null) return norm;
              }
            }
          }
        }
      }
    }
    return null;
  }

  answers['4.4'] = findAnswerNear('4.4');
  answers['5.2'] = findAnswerNear('5.2');
  answers['7.1'] = findAnswerNear('7.1');
  answers['7.2'] = findAnswerNear('7.2');
  answers['7.3'] = findAnswerNear('7.3');
  answers['7.4'] = findAnswerNear('7.4');
  answers['7.5'] = findAnswerNear('7.5');
  answers['7.6'] = findAnswerNear('7.6');
  answers['7.7'] = findAnswerNear('7.7');
  answers['7.8'] = findAnswerNear('7.8');
  answers['7.9'] = findAnswerNear('7.9');
  answers['8.2'] = findAnswerNear('8.2');
  answers['8.7'] = findAnswerNear('8.7');
  answers['9.0'] = findAnswerNear('9.0');

  // Extrai CNPJ e Razão Social
  let cnpj = '';
  let razaoSocial = '';
  for (let r = range.s.r; r <= Math.min(range.e.r, 40); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = xlsx.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (cell && typeof cell.v === 'string') {
        const val = cell.v.trim();
        if (/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/.test(val)) {
          const m = val.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
          if (m && !cnpj) cnpj = m[0];
        }
        if (val.toLowerCase().includes('razão social') || val.toLowerCase().includes('razao social')) {
          const rightCell = sheet[xlsx.utils.encode_cell({ r, c: c + 1 })];
          if (rightCell && typeof rightCell.v === 'string' && rightCell.v.trim() && !razaoSocial) {
            razaoSocial = rightCell.v.trim();
          } else {
            const nextAddr = xlsx.utils.encode_cell({ r: r + 1, c });
            const nextCell = sheet[nextAddr];
            if (nextCell && typeof nextCell.v === 'string' && !razaoSocial) {
              razaoSocial = nextCell.v.trim();
            }
          }
        }
      }
    }
  }

  const n23 = answers['4.4'] === true || answers['5.2'] === true;
  const n40 = answers.alcadaConselho === true;
  const n28 = [
    answers['7.1'],
    answers['7.3'],
    answers['7.4'],
    answers['7.5'],
    answers['7.6'],
    answers['7.7'],
    answers['7.8'],
    answers['7.9'],
  ].some((v) => v === true);
  const n29 = answers['7.2'] === true;

  let riscoCalculado = 'Baixo';
  if (n23 || n40) {
    riscoCalculado = 'Muito Alto';
  } else if (n28) {
    riscoCalculado = 'Alto';
  } else if (n29) {
    riscoCalculado = 'Médio';
  }

  const respostas = {};
  for (const [k, v] of Object.entries(answers)) {
    respostas[k] = v === true ? 'Sim' : v === false ? 'Não' : null;
  }

  return {
    ok: true,
    formato: 'Excel',
    sheetIdentificada: targetSheetName,
    dadosGerais: {
      razaoSocial,
      cnpj,
      valorContrato: null,
      processoSei: null,
      diretoria: null,
    },
    respostas,
    rawAnswers: answers,
    flagsIntegridade: {
      n23_corrupcaoOuCrimes: n23,
      n40_alcadaConselho: n40,
      n28_interacaoPublicaOuPep: n28,
      n29_licencasOrdinarias: n29,
      riscoCalculado,
      detalhes: {
        q4_4_corrupcaoPJ: answers['4.4'],
        q5_2_crimesSocios: answers['5.2'],
        q7_1_atividadeRegulada: answers['7.1'],
        q7_2_licencasOrdinarias: answers['7.2'],
        q7_3_licencasContratuais: answers['7.3'],
        q7_4_interacaoPoderPublico: answers['7.4'],
        q7_5_representacaoTerceiros: answers['7.5'],
        q7_6_pepSocio: answers['7.6'],
        q7_7_pepFamiliar: answers['7.7'],
        q7_8_parentescoSuape: answers['7.8'],
        q7_9_participacaoGoverno: answers['7.9'],
        q8_2_codigoConduta: answers['8.2'],
        q8_7_treinamentoGestao: answers['8.7'],
        q9_0_complianceOfficer: answers['9.0'],
        alcadaConselho: answers.alcadaConselho,
      },
    },
    aviso: null,
  };
}

/**
 * Função principal do parser de questionários de diligência SUAPE
 * @param {Buffer} buffer - Buffer do arquivo
 * @param {string} [filename] - Nome original do arquivo
 */
async function parseSuapeQuestionnaire(buffer, filename = '') {
  if (!buffer || buffer.length === 0) {
    throw new Error('Arquivo não fornecido ou buffer vazio.');
  }

  // Limite máximo de segurança: 15 MB
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error('O arquivo excede o tamanho máximo permitido de 15 MB.');
  }

  const isPdf = isPdfBuffer(buffer) || filename.toLowerCase().endsWith('.pdf');
  const isExcel =
    filename.toLowerCase().endsWith('.xlsx') ||
    filename.toLowerCase().endsWith('.xls') ||
    (!isPdf && buffer.slice(0, 2).toString() === 'PK'); // ZIP / XLSX magic number

  if (isPdf) {
    return pdfNaoSuportado();
  }

  if (isExcel) {
    return parseSuapeXlsx(buffer);
  }

  throw new Error('Formato de arquivo não suportado. Por favor, envie um arquivo em PDF (.pdf) ou Excel (.xlsx, .xls).');
}

module.exports = {
  parseSuapeQuestionnaire,
  parseSuapeXlsx,
  normalizeAnswer,
  isPdfBuffer,
};
