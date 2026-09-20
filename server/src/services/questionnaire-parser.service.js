// ==========================================================
// DILIGÊNCIA 360 — SUAPE Questionnaire Parser Service
// Extração e normalização de questionários de diligência
// Suporta:
// 1. Planilhas Excel (.xlsx e .xls via biblioteca oficial 'xlsx')
// 2. Documentos PDF (.pdf via 'pdf-parse')
// Respostas tri-state: true ('Sim'), false ('Não'), null ('Não identificado')
// ==========================================================

const xlsx = require('xlsx');

/**
 * `pdf-parse` embute o pdf.js, que avalia `DOMMatrix` — uma API de
 * navegador — já ao ser carregado. No Node ele tenta suprir isso com
 * `@napi-rs/canvas`, que não está instalado; o polyfill falha e o módulo
 * lança `ReferenceError: DOMMatrix is not defined`.
 *
 * No topo deste arquivo, esse erro derrubava a função inteira na Vercel:
 * a cadeia `app.js → diligence.routes.js → este serviço` roda em todo
 * boot, então QUALQUER rota respondia 500 FUNCTION_INVOCATION_FAILED,
 * inclusive `/api/status`. Localmente não aparecia, porque no Node desta
 * máquina o mesmo require carrega sem erro.
 *
 * Carregar sob demanda mantém a falha dentro da leitura de PDF, que é o
 * único lugar que precisa da biblioteca — e que já era o caminho menos
 * confiável, com a transcrição por IA cobrindo PDF e foto.
 */
function loadPdfParser() {
  try {
    // eslint-disable-next-line global-require
    const { PDFParse } = require('pdf-parse');
    return PDFParse;
  } catch (err) {
    const motivo = String(err && err.message ? err.message : err).split('\n')[0];
    throw new Error(
      `A leitura automática de PDF não está disponível neste ambiente (${motivo}). ` +
        'Use a transcrição por IA, que aceita PDF, foto e digitalização, ou envie o questionário em .xlsx.'
    );
  }
}

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
 * Extrai respostas de um arquivo PDF preenchido da SUAPE
 * @param {Buffer} buffer - Buffer do PDF
 */
async function parseSuapePdf(buffer) {
  const PDFParse = loadPdfParser();

  let fullText = '';
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    fullText = result && result.text ? result.text : '';
  } catch (err) {
    throw new Error(`Falha ao ler estrutura do documento PDF: ${err.message}`);
  }

  if (!fullText || fullText.trim().length < 20) {
    throw new Error('O arquivo PDF está vazio ou é uma imagem escaneada sem camada de texto extraível.');
  }

  // Divide o texto por páginas
  const pageTexts = fullText.split(/-- \d+ of \d+ --/);

  // Helper para extrair sequências "Selecione \n Sim/Não" de uma página
  function getDropdownSelections(pageText) {
    const regex = /Selecione\s*\n\s*(Sim|Não|Nao)/gi;
    const matches = [];
    let m;
    while ((m = regex.exec(pageText)) !== null) {
      matches.push(m[1].toLowerCase().startsWith('s'));
    }
    return matches;
  }

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

  // 1. Extração estrutural baseada no formulário padrão SUAPE (páginas)
  // Página 2 contém 4.4 e 5.2
  const p2 = pageTexts[1] || '';
  const p2Sel = getDropdownSelections(p2);
  if (p2Sel.length >= 2) {
    answers['4.4'] = p2Sel[0];
    answers['5.2'] = p2Sel[1];
  }

  // Página 3 contém 6.1, 7.1, 7.2, 7.3, 7.4
  const p3 = pageTexts[2] || '';
  const p3Sel = getDropdownSelections(p3);
  if (p3Sel.length >= 5) {
    answers['7.1'] = p3Sel[1];
    answers['7.2'] = p3Sel[2];
    answers['7.3'] = p3Sel[3];
    answers['7.4'] = p3Sel[4];
  } else if (p3Sel.length >= 4) {
    answers['7.1'] = p3Sel[0];
    answers['7.2'] = p3Sel[1];
    answers['7.3'] = p3Sel[2];
    answers['7.4'] = p3Sel[3];
  }

  // Página 4 contém 7.5, 7.6, 7.7, 7.8, 7.9, 8.1
  const p4 = pageTexts[3] || '';
  const p4Sel = getDropdownSelections(p4);
  if (p4Sel.length >= 5) {
    answers['7.5'] = p4Sel[0];
    answers['7.6'] = p4Sel[1];
    answers['7.7'] = p4Sel[2];
    answers['7.8'] = p4Sel[3];
    answers['7.9'] = p4Sel[4];
  }

  // Página 5 contém 8.2 a 9.0 (Governança e Compliance)
  const p5 = pageTexts[4] || '';
  const p5Sel = getDropdownSelections(p5);
  if (p5Sel.length >= 9) {
    answers['8.2'] = p5Sel[0]; // Código de Ética
    answers['8.7'] = p5Sel[5]; // Treinamento Alta Administração
    answers['9.0'] = p5Sel[8]; // Compliance Officer
  }

  // 2. Heurística secundária: Procurar checkboxes explícitos [X] / (X) por proximidade caso as páginas não tenham dropdowns
  const questionsToScan = ['4.4', '5.2', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9', '8.2', '8.7', '9.0'];
  for (const q of questionsToScan) {
    if (answers[q] === null) {
      const qEsc = q.replace('.', '\\.');
      const qRegex = new RegExp(`${qEsc}[^\\n]*\\n([\\s\\S]{1,400})`, 'i');
      const match = fullText.match(qRegex);
      if (match) {
        const snippet = match[1];
        const simChecked = /(?:\[[xX]\]|\([xX]\)|☑|☒|✓|✔|■|●)\s*sim/i.test(snippet);
        const naoChecked = /(?:\[[xX]\]|\([xX]\)|☑|☒|✓|✔|■|●)\s*n[ãa]o/i.test(snippet);
        if (simChecked && !naoChecked) answers[q] = true;
        else if (naoChecked && !simChecked) answers[q] = false;
      }
    }
  }

  // 3. Extração cadastral: CNPJ e Razão Social
  const cnpjMatch = fullText.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  const cnpj = cnpjMatch ? cnpjMatch[0] : '';

  let razaoSocial = '';
  const p1 = pageTexts[0] || '';
  const corporateMatch = p1.match(/\n([A-Z0-9 .,&-]+?(?:S\/?A|LTDA|EIRELI|ME|EPP))\s*[\r\n]/i);
  if (corporateMatch) {
    razaoSocial = corporateMatch[1].trim().replace(/\t+/g, ' ');
  } else {
    const fallbackMatch = fullText.match(/Raz[ãa]o\s*Social[^:\n]*[:\n\t]*([^\n\r]+)/i);
    if (fallbackMatch) {
      const raw = fallbackMatch[1].trim();
      if (!raw.toLowerCase().includes('informações') && !raw.toLowerCase().includes('dados gerais') && !raw.toLowerCase().includes('societário')) {
        razaoSocial = raw.replace(/\t+/g, ' ').trim();
      }
    }
  }

  // 4. Campos que NÃO existem no questionário devem ser estritamente null (sem invenções)
  let valorContrato = null;
  const valorMatch = fullText.match(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*\,[0-9]{2})/i);
  if (valorMatch) {
    const cleanNum = valorMatch[1].replace(/\./g, '').replace(',', '.');
    valorContrato = parseFloat(cleanNum) || null;
  }

  let processoSei = null;
  const seiMatch = fullText.match(/(?:processo|sei)\s*[:\s]*([0-9]{5,8}\.?[0-9]{4,8}\/?[0-9]{4}-[0-9]{2})/i);
  if (seiMatch) {
    processoSei = seiMatch[1];
  }

  let diretoria = null;
  const dirMatch = fullText.match(/\b(DGP|DIRIN|DGO|DENG|PRESI|DAF|DPO)\b/i);
  if (dirMatch) {
    diretoria = dirMatch[1].toUpperCase();
  }

  const n23 = answers['4.4'] === true || answers['5.2'] === true;
  const n40 = answers.alcadaConselho === true || (valorContrato !== null && valorContrato >= 10000000);
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
    formato: 'PDF',
    sheetIdentificada: 'Documento PDF',
    dadosGerais: {
      razaoSocial,
      cnpj,
      valorContrato,
      processoSei,
      diretoria,
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
    return await parseSuapePdf(buffer);
  }

  if (isExcel) {
    return parseSuapeXlsx(buffer);
  }

  throw new Error('Formato de arquivo não suportado. Por favor, envie um arquivo em PDF (.pdf) ou Excel (.xlsx, .xls).');
}

module.exports = {
  parseSuapeQuestionnaire,
  parseSuapePdf,
  parseSuapeXlsx,
  normalizeAnswer,
  isPdfBuffer,
};
