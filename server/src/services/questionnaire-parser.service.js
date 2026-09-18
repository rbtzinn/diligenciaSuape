// ==========================================================
// DILIGÊNCIA 360 — SUAPE Questionnaire Parser Service
// Extrai respostas e dados cadastrais de arquivos .xlsx e .pdf
// do Questionário de Diligência de Integridade da SUAPE
// Suporta:
// 1. Planilhas Excel (.xlsx, .xls) — modelos "Questionário" e "Avaliação de Integridade"
// 2. Documentos PDF (.pdf) — exportados do Excel, preenchidos digitalmente ou digitalizados
// ==========================================================

const AdmZip = require('adm-zip');
const { PDFParse } = require('pdf-parse');

/**
 * Normaliza valores de respostas para "Sim" ou "Não"
 */
function normalizeAnswer(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim().toLowerCase();
  if (['sim', 's', 'x', 'true', 'verdadeiro', '1'].includes(clean)) return 'Sim';
  if (['não', 'nao', 'n', 'false', 'falso', '0'].includes(clean)) return 'Não';
  return null;
}

/**
 * Detecta se o buffer corresponde a um documento PDF
 */
function isPdfBuffer(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer.slice(0, 4).toString() === '%PDF';
}

/**
 * Extrai resposta de um trecho textual de PDF
 */
function extractAnswerFromSnippet(snippet) {
  if (!snippet) return 'Não';

  // 1. Padrões explícitos com X / checado
  // Ex: [X] Sim, (X) Sim, ☑ Sim, [x] SIM, Sim [X], Sim (X)
  const simChecked = /(?:\[[xX]\]|\([xX]\)|☑|☒|✓|✔|■|●)\s*sim/i.test(snippet) ||
                     /sim\s*(?:\[[xX]\]|\([xX]\)|☑|☒|✓|✔|■|●)/i.test(snippet);
                     
  const naoChecked = /(?:\[[xX]\]|\([xX]\)|☑|☒|✓|✔|■|●)\s*n[ãa]o/i.test(snippet) ||
                     /n[ãa]o\s*(?:\[[xX]\]|\([xX]\)|☑|☒|✓|✔|■|●)/i.test(snippet);

  if (simChecked && !naoChecked) return 'Sim';
  if (naoChecked && !simChecked) return 'Não';

  // 2. Se um está marcado com [ ] e o outro não
  // Ex: [ ] Sim  Não  (indica que Sim não foi marcado)
  const emptySim = /\[\s*\]\s*sim/i.test(snippet) || /sim\s*\[\s*\]/i.test(snippet);
  const emptyNao = /\[\s*\]\s*n[ãa]o/i.test(snippet) || /n[ãa]o\s*\[\s*\]/i.test(snippet);

  if (emptySim && !emptyNao) return 'Não';
  if (emptyNao && !emptySim) return 'Sim';

  // 3. Resposta textual isolada ("Resposta: Sim", "Resposta: Não" ou linha direta)
  const lines = snippet.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(?:resposta[:\s]*)?sim$/i.test(line)) return 'Sim';
    if (/^(?:resposta[:\s]*)?n[ãa]o$/i.test(line)) return 'Não';
  }

  // 4. Verificação de palavras isoladas no trecho
  const words = snippet.match(/\b(sim|n[ãa]o)\b/gi) || [];
  if (words.length === 1) {
    return normalizeAnswer(words[0]) || 'Não';
  }

  return 'Não';
}

/**
 * Lê e analisa um arquivo PDF de Questionário SUAPE
 * @param {Buffer} buffer - Buffer do arquivo .pdf
 * @returns {Promise<Object>} Dados extraídos e respostas mapeadas
 */
async function parseSuapePdf(buffer) {
  let fullText = '';
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    fullText = (result && result.text) ? result.text : '';
  } catch (pdfErr) {
    console.warn('[QuestionnaireParser] Falha na extração de texto do PDF:', pdfErr.message);
  }

  const isScanned = fullText.trim().length < 30;

  // Função para recortar a seção da pergunta
  function getQuestionSnippet(qNum) {
    if (isScanned) return '';
    const esc = qNum.replace('.', '\\.');
    // Procura o trecho após a menção de qNum até a próxima pergunta ou seção seguinte
    const regex = new RegExp(`(?:^|[\\s(])${esc}[.)\\s][\\s\\S]*?(?=(?:\\n\\s*\\d+\\.\\d+|\\n\\s*7\\.\\d+|\\n\\s*8\\.|\\n\\s*8\\s|\\n\\s*Declaração|\\n\\s*DECLARAÇÃO|$))`, 'i');
    const m = fullText.match(regex);
    return m ? m[0] : '';
  }

  const q4_4 = extractAnswerFromSnippet(getQuestionSnippet('4.4'));
  const q5_2 = extractAnswerFromSnippet(getQuestionSnippet('5.2'));
  const q7_1 = extractAnswerFromSnippet(getQuestionSnippet('7.1'));
  const q7_2 = extractAnswerFromSnippet(getQuestionSnippet('7.2'));
  const q7_3 = extractAnswerFromSnippet(getQuestionSnippet('7.3'));
  const q7_4 = extractAnswerFromSnippet(getQuestionSnippet('7.4'));
  const q7_5 = extractAnswerFromSnippet(getQuestionSnippet('7.5'));
  const q7_6 = extractAnswerFromSnippet(getQuestionSnippet('7.6'));
  const q7_7 = extractAnswerFromSnippet(getQuestionSnippet('7.7'));
  const q7_8 = extractAnswerFromSnippet(getQuestionSnippet('7.8'));
  const q7_9 = extractAnswerFromSnippet(getQuestionSnippet('7.9'));

  // CNPJ
  const cnpjMatch = fullText.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  const cnpjDetectado = cnpjMatch ? cnpjMatch[0] : '';

  // Processo SEI
  const seiMatch = fullText.match(/(?:SEI[:\s]*|Processo[:\s]*)?([0-9]{4,10}\.[0-9]{4,6}\/[0-9]{4}-[0-9]{2})/i);
  const processoSeiDetectado = seiMatch ? `SEI: ${seiMatch[1]}` : '';

  // Diretoria
  const dirMatch = fullText.match(/\b(DGP|DIRIN|DGO|DENG|PRESI|DAF|DPO)\b/i);
  const diretoriaDetectada = dirMatch ? dirMatch[1].toUpperCase() : '';

  // Razão Social
  const rsMatch = fullText.match(/(?:Razão Social(?: e Tipo Societário)?|Nome Empresarial|Empresa)[:\s]*([^\n\r]+)/i);
  let razaoSocialDetectada = rsMatch ? rsMatch[1].trim() : '';
  if (razaoSocialDetectada.length > 80) razaoSocialDetectada = razaoSocialDetectada.slice(0, 80);

  // Valor do contrato
  let valorDetectado = null;
  const valMatches = [...fullText.matchAll(/R\$\s*([\d\.,]+)/gi)];
  for (const vm of valMatches) {
    const rawVal = vm[1];
    // Converte formato brasileiro 46.056,00 para número
    const num = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(num) && num > 50) {
      valorDetectado = num;
      break;
    }
  }

  // Alçada do Conselho (Row 40 da planilha oficial: valor >= 10M ou menção explícita de Conselho)
  const qAlcadaConselho = (valorDetectado !== null && valorDetectado >= 10000000) || /alçada do conselho/i.test(fullText);

  // Flags da fórmula oficial:
  // J16: =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))
  const n23 = q4_4 === 'Sim' || q5_2 === 'Sim';
  const n28 = [q7_1, q7_3, q7_4, q7_5, q7_6, q7_7, q7_8, q7_9].some(a => a === 'Sim');
  const n29 = q7_2 === 'Sim';
  const n40 = qAlcadaConselho;

  let riscoCalculado = 'Baixo';
  if (n23 || n40) {
    riscoCalculado = 'Muito Alto';
  } else if (n28) {
    riscoCalculado = 'Alto';
  } else if (n29) {
    riscoCalculado = 'Médio';
  }

  return {
    ok: true,
    formato: 'PDF',
    isScanned,
    sheetIdentificada: isScanned ? 'PDF (Digitalizado/Imagem)' : 'Documento PDF',
    aviso: isScanned
      ? 'PDF digitalizado/sem texto selecionável. As 11 perguntas foram abertas para confirmação rápida com 1 clique.'
      : null,
    dadosGerais: {
      razaoSocial: razaoSocialDetectada || '',
      cnpj: cnpjDetectado || '',
      valorContrato: valorDetectado,
      processoSei: processoSeiDetectado || '',
      diretoria: diretoriaDetectada || '',
    },
    respostas: {
      '4.4': q4_4,
      '5.2': q5_2,
      '7.1': q7_1,
      '7.2': q7_2,
      '7.3': q7_3,
      '7.4': q7_4,
      '7.5': q7_5,
      '7.6': q7_6,
      '7.7': q7_7,
      '7.8': q7_8,
      '7.9': q7_9,
      alcadaConselho: n40 ? 'Sim' : 'Não',
    },
    flagsIntegridade: {
      n23_corrupcaoOuCrimes: n23,
      n40_alcadaConselho: n40,
      n28_interacaoPublicaOuPEP: n28,
      n29_licencasOrdinarias: n29,
      riscoCalculado,
      detalhes: {
        q4_4_corrupcaoPJ: q4_4 === 'Sim',
        q5_2_crimesSocios: q5_2 === 'Sim',
        q7_1_atividadeRegulada: q7_1 === 'Sim',
        q7_2_licencasOrdinarias: q7_2 === 'Sim',
        q7_3_licencasContratuais: q7_3 === 'Sim',
        q7_4_interacaoPoderPublico: q7_4 === 'Sim',
        q7_5_representacaoTerceiros: q7_5 === 'Sim',
        q7_6_pepSocio: q7_6 === 'Sim',
        q7_7_pepFamiliar: q7_7 === 'Sim',
        q7_8_parentescoSuape: q7_8 === 'Sim',
        q7_9_participacaoGoverno: q7_9 === 'Sim',
        alcadaConselho: n40,
      },
    },
  };
}

/**
 * Lê e analisa um arquivo XLSX de Questionário ou Avaliação de Integridade de SUAPE
 * @param {Buffer} buffer - Buffer do arquivo .xlsx
 * @returns {Object} Dados extraídos e respostas mapeadas
 */
function parseSuapeXlsx(buffer) {
  const zip = new AdmZip(buffer);
  
  // 1. Identifica a planilha correta
  const workbookXml = zip.readAsText('xl/workbook.xml');
  const sharedStringsXml = zip.readAsText('xl/sharedStrings.xml');

  // Mapear strings compartilhadas
  const sharedStrings = [];
  if (sharedStringsXml) {
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = siRegex.exec(sharedStringsXml)) !== null) {
      const tMatches = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
      sharedStrings.push(tMatches.map(x => x[1]).join(''));
    }
  }

  // Identificar sheets
  const sheets = [];
  const sheetRegex = /<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*r:id="([^"]+)"/g;
  let sm;
  while ((sm = sheetRegex.exec(workbookXml)) !== null) {
    sheets.push({ name: sm[1], sheetId: sm[2], rId: sm[3] });
  }

  const relsXml = zip.readAsText('xl/_rels/workbook.xml.rels');
  function getSheetPath(rId) {
    if (!relsXml) return null;
    const relRegex = new RegExp(`Id="${rId}"[^>]*Target="([^"]+)"`);
    const relMatch = relsXml.match(relRegex);
    return relMatch ? 'xl/' + relMatch[1].replace(/^\//, '') : null;
  }

  // Se houver sheet de "Avaliação de Integridade", lemos também
  const avaliacaoSheetMeta = sheets.find(s => s.name.toLowerCase().includes('avaliação') || s.name.toLowerCase().includes('avaliacao'));
  // Sheet de Questionário ou CheckList
  const questionarioSheetMeta = sheets.find(s => 
    s.name.toLowerCase().includes('questionário') || 
    s.name.toLowerCase().includes('questionario') || 
    s.name.toLowerCase().includes('checklist')
  ) || sheets[0];

  // Helper para extrair mapa de células de uma sheet
  function parseSheetCells(sheetPath) {
    if (!sheetPath) return {};
    const sheetXml = zip.readAsText(sheetPath);
    if (!sheetXml) return {};
    const cellRegex = /<c r="([A-Z0-9]+)"(?:[^>]*?t="([^"]*)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
    let cm;
    const cells = {};
    while ((cm = cellRegex.exec(sheetXml)) !== null) {
      const ref = cm[1];
      const t = cm[2];
      let v = cm[3];
      if (t === 's' && v !== undefined) {
        v = sharedStrings[parseInt(v, 10)] ?? v;
      }
      cells[ref] = v;
    }
    return cells;
  }

  const qCells = parseSheetCells(questionarioSheetMeta ? getSheetPath(questionarioSheetMeta.rId) : null);
  const aCells = avaliacaoSheetMeta ? parseSheetCells(getSheetPath(avaliacaoSheetMeta.rId)) : {};

  // Busca por varredura nas proximidades de um item (ex: "4.4", "7.3")
  function findAnswerForQuestion(questionNum, specificRefs = []) {
    // 1. Tenta refs específicas na sheet de avaliação de integridade (ex: L23, L28...)
    for (const ref of specificRefs) {
      if (aCells[ref]) {
        const norm = normalizeAnswer(aCells[ref]);
        if (norm) return norm;
      }
      if (qCells[ref]) {
        const norm = normalizeAnswer(qCells[ref]);
        if (norm) return norm;
      }
    }

    // 2. Busca na sheet de questionário nas proximidades da menção ao número
    for (const [ref, text] of Object.entries(qCells)) {
      if (typeof text === 'string' && (text.startsWith(questionNum) || text.includes(` ${questionNum} `) || text.includes(` ${questionNum}.`))) {
        const row = parseInt(ref.replace(/^[A-Z]+/, ''), 10);
        // Analisa linhas próximas
        for (let r = row; r <= row + 4; r++) {
          for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']) {
            const val = qCells[`${col}${r}`];
            const norm = normalizeAnswer(val);
            if (norm) return norm;
          }
        }
      }
    }

    return 'Não';
  }

  // Mapeamento das questões com referências tanto do Questionário quanto da Avaliação de Integridade (L23..L40)
  const q4_4 = findAnswerForQuestion('4.4', ['L23', 'C69', 'C70']);
  const q5_2 = findAnswerForQuestion('5.2', ['L24', 'B89', 'B90', 'C89']);
  const q7_1 = findAnswerForQuestion('7.1', ['L28', 'C103', 'C104']);
  const q7_2 = findAnswerForQuestion('7.2', ['L29', 'C112', 'C113']);
  const q7_3 = findAnswerForQuestion('7.3', ['L30', 'C122', 'C123']);
  const q7_4 = findAnswerForQuestion('7.4', ['L31', 'C131', 'C132']);
  const q7_5 = findAnswerForQuestion('7.5', ['L32', 'C140', 'C141']);
  const q7_6 = findAnswerForQuestion('7.6', ['L33', 'C150', 'C151']);
  const q7_7 = findAnswerForQuestion('7.7', ['L34', 'C159', 'C160']);
  const q7_8 = findAnswerForQuestion('7.8', ['L35', 'C167', 'C168']);
  const q7_9 = findAnswerForQuestion('7.9', ['L36', 'C176', 'C177']);
  const qAlcadaConselho = findAnswerForQuestion('Conselho', ['L40']) === 'Sim';

  // Extração inteligente de dados da empresa e contratação
  let cnpjDetectado = null;
  let razaoSocialDetectada = null;
  let valorDetectado = null;
  let processoSeiDetectado = null;
  let diretoriaDetectada = null;

  const cnpjRegex = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;
  const seiRegex = /(?:SEI[:\s]*|Processo[:\s]*)?([0-9]{10}\.[0-9]{6}\/[0-9]{4}-[0-9]{2})/i;
  const diretoriaRegex = /\b(DGP|DIRIN|DGO|DENG|PRESI|DAF|DPO)\b/i;

  const allCells = { ...qCells, ...aCells };

  for (const [ref, val] of Object.entries(allCells)) {
    if (typeof val !== 'string') continue;
    const text = val.trim();

    // CNPJ
    if (!cnpjDetectado) {
      const cnpjMatch = text.match(cnpjRegex);
      if (cnpjMatch) cnpjDetectado = cnpjMatch[0];
    }

    // Processo SEI
    if (!processoSeiDetectado) {
      const seiMatch = text.match(seiRegex);
      if (seiMatch) processoSeiDetectado = `SEI: ${seiMatch[1]}`;
    }

    // Diretoria
    if (!diretoriaDetectada) {
      const dirMatch = text.match(diretoriaRegex);
      if (dirMatch) diretoriaDetectada = dirMatch[1].toUpperCase();
    }

    // Razão Social (quando no bloco de informações cadastrais 1.1)
    if (!razaoSocialDetectada && (text.includes('Razão Social e Tipo Societário') || text.includes('Razao Social e Tipo'))) {
      const row = parseInt(ref.replace(/^[A-Z]+/, ''), 10);
      for (const col of ['C', 'D', 'E', 'F', 'G', 'H']) {
        const candidate = allCells[`${col}${row}`];
        if (candidate && typeof candidate === 'string' && candidate.trim().length > 2 && !candidate.includes(':') && candidate !== 'Objeto Social:') {
          razaoSocialDetectada = candidate.trim();
          break;
        }
      }
    }

    // Valor do contrato
    if (!valorDetectado) {
      if (text.includes('R$')) {
        const num = parseFloat(text.replace(/[^\d,-]/g, '').replace(',', '.'));
        if (!isNaN(num) && num > 100) valorDetectado = num;
      }
    }
  }

  // Flags da fórmula oficial:
  // J16: =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))
  const n23 = q4_4 === 'Sim' || q5_2 === 'Sim';
  const n28 = [q7_1, q7_3, q7_4, q7_5, q7_6, q7_7, q7_8, q7_9].some(a => a === 'Sim');
  const n29 = q7_2 === 'Sim';
  const n40 = qAlcadaConselho || (valorDetectado !== null && valorDetectado >= 10000000);

  let riscoCalculado = 'Baixo';
  if (n23 || n40) {
    riscoCalculado = 'Muito Alto';
  } else if (n28) {
    riscoCalculado = 'Alto';
  } else if (n29) {
    riscoCalculado = 'Médio';
  }

  return {
    ok: true,
    formato: 'XLSX',
    sheetIdentificada: questionarioSheetMeta ? questionarioSheetMeta.name : 'Questionário',
    dadosGerais: {
      razaoSocial: razaoSocialDetectada || '',
      cnpj: cnpjDetectado || '',
      valorContrato: valorDetectado,
      processoSei: processoSeiDetectado || '',
      diretoria: diretoriaDetectada || '',
    },
    respostas: {
      '4.4': q4_4,
      '5.2': q5_2,
      '7.1': q7_1,
      '7.2': q7_2,
      '7.3': q7_3,
      '7.4': q7_4,
      '7.5': q7_5,
      '7.6': q7_6,
      '7.7': q7_7,
      '7.8': q7_8,
      '7.9': q7_9,
      alcadaConselho: n40 ? 'Sim' : 'Não',
    },
    flagsIntegridade: {
      n23_corrupcaoOuCrimes: n23,
      n40_alcadaConselho: n40,
      n28_interacaoPublicaOuPEP: n28,
      n29_licencasOrdinarias: n29,
      riscoCalculado,
      detalhes: {
        q4_4_corrupcaoPJ: q4_4 === 'Sim',
        q5_2_crimesSocios: q5_2 === 'Sim',
        q7_1_atividadeRegulada: q7_1 === 'Sim',
        q7_2_licencasOrdinarias: q7_2 === 'Sim',
        q7_3_licencasContratuais: q7_3 === 'Sim',
        q7_4_interacaoPoderPublico: q7_4 === 'Sim',
        q7_5_representacaoTerceiros: q7_5 === 'Sim',
        q7_6_pepSocio: q7_6 === 'Sim',
        q7_7_pepFamiliar: q7_7 === 'Sim',
        q7_8_parentescoSuape: q7_8 === 'Sim',
        q7_9_participacaoGoverno: q7_9 === 'Sim',
        alcadaConselho: n40,
      },
    },
  };
}

/**
 * Função principal que roteia para o parser apropriado (.pdf ou .xlsx)
 * @param {Buffer} buffer - Buffer binário do arquivo
 * @returns {Promise<Object>} Resultado da análise
 */
async function parseSuapeQuestionnaire(buffer) {
  if (isPdfBuffer(buffer)) {
    return await parseSuapePdf(buffer);
  }
  return parseSuapeXlsx(buffer);
}

module.exports = {
  parseSuapeQuestionnaire,
  parseSuapePdf,
  parseSuapeXlsx,
  normalizeAnswer,
  isPdfBuffer,
};
