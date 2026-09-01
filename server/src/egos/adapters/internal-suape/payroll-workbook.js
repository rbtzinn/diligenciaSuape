// ==========================================================
// DILIGÊNCIA 360 — Leitor da folha institucional (XLSX)
// Extrai apenas identidade funcional: nome, chapa, CPF mascarado,
// tipo de vínculo e competência.
//
// Remuneração é deliberadamente descartada na leitura, não na exibição:
// valor de salário, evento de folha, provento e desconto nunca entram em
// memória, então não há como vazarem para o grafo, o PDF ou o histórico.
// ==========================================================

const AdmZip = require('adm-zip');

const IDENTITY_COLUMNS = {
  NOME: 'name',
  CHAPA: 'registration',
  CPF: 'maskedCpf',
  'TIPO DE FUNCIONARIO': 'employmentCode',
  'ANO COMPETENCIA': 'year',
  'MES COMPETENCIA': 'month',
};

// Colunas de folha. Nomes conferidos contra o arquivo real; o descarte
// também é feito por lista de permissão, então coluna nova entra bloqueada.
const PAYROLL_COLUMNS = new Set([
  'DESCRICAO DO EVENTO',
  'PROVENTO/DESCONTO/BASE',
  'SALARIO',
  'VALOR DA FICHA',
  'TOTAIS',
  'PERIODO',
]);

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function columnLetters(reference) {
  return String(reference || '').replace(/\d+/g, '');
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function readSharedStrings(zip) {
  const xml = zip.readAsText('xl/sharedStrings.xml');
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => (
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((piece) => decodeXmlEntities(piece[1]))
      .join('')
  ));
}

function readSheetIndex(zip) {
  const workbook = zip.readAsText('xl/workbook.xml') || '';
  const rels = zip.readAsText('xl/_rels/workbook.xml.rels') || '';
  const targetById = new Map();
  for (const match of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    targetById.set(match[1], match[2].replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const sheets = [];
  for (const match of workbook.matchAll(/<sheet[^>]*\/>/g)) {
    const tag = match[0];
    const name = decodeXmlEntities((tag.match(/name="([^"]*)"/) || [])[1] || '');
    const relationId = (tag.match(/r:id="([^"]*)"/) || [])[1];
    const target = targetById.get(relationId);
    if (name && target) sheets.push({ name, path: `xl/${target}` });
  }
  return sheets;
}

function readSheetRows(zip, path, sharedStrings) {
  const xml = zip.readAsText(path);
  if (!xml) return [];

  const rows = [];
  for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1];
      const reference = (attributes.match(/r="([A-Z]+\d+)"/) || [])[1];
      if (!reference) continue;

      const type = (attributes.match(/t="([^"]+)"/) || [])[1];
      let value;
      if (type === 'inlineStr') {
        value = [...cellMatch[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((piece) => decodeXmlEntities(piece[1]))
          .join('');
      } else {
        const raw = (cellMatch[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (raw === undefined) continue;
        value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : decodeXmlEntities(raw);
      }
      cells.set(columnLetters(reference), String(value).trim());
    }
    if (cells.size > 0) rows.push(cells);
  }
  return rows;
}

/**
 * Localiza a linha de cabeçalho e devolve o mapa coluna -> campo de identidade.
 * Colunas de folha ficam de fora do mapa e nunca são lidas depois.
 */
function mapIdentityColumns(rows) {
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const cells = rows[index];
    const mapping = new Map();
    let sawPayrollColumn = false;

    for (const [column, value] of cells) {
      const header = normalizeHeader(value);
      if (PAYROLL_COLUMNS.has(header)) sawPayrollColumn = true;
      const field = IDENTITY_COLUMNS[header];
      if (field) mapping.set(column, field);
    }

    if (mapping.size > 0 && [...mapping.values()].includes('name')) {
      return { headerIndex: index, mapping, sawPayrollColumn };
    }
  }
  return null;
}

function isMaskedCpf(value) {
  const normalized = String(value || '').replace(/[^0-9*]/g, '');
  return normalized.length >= 8 && normalized.includes('*');
}

const EMPLOYMENT_LABELS = {
  N: 'Efetivo',
  A: 'Administração / conselho',
  C: 'Comissionado',
};

function employmentTypeFrom(sheetName, code) {
  const sheet = normalizeHeader(sheetName);
  if (sheet.startsWith('COMISSIONADOS')) return 'Comissionado';
  if (sheet.startsWith('CEDIDOS')) return 'Cedido';
  if (sheet.startsWith('CONSELHO ADM')) return 'Conselho de Administração';
  if (sheet.startsWith('CONSELHO FISCAL')) return 'Conselho Fiscal';
  if (sheet.startsWith('COMITE')) return 'Comitê de Auditoria';
  if (sheet.startsWith('FUNCIONARIO')) return 'Efetivo';
  return EMPLOYMENT_LABELS[String(code || '').toUpperCase()] || 'Vínculo institucional';
}

function referencePeriodFrom(year, month) {
  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = Number.parseInt(month, 10);
  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) return null;
  return `${String(parsedMonth).padStart(2, '0')}/${parsedYear}`;
}

/**
 * Lê a folha institucional e devolve somente identidades funcionais.
 * Uma pessoa é reconhecida pela linha que traz nome e CPF mascarado; as
 * linhas seguintes, que detalham eventos de folha, são ignoradas.
 */
function readPayrollWorkbook(buffer, { sourceName = 'Base funcional interna' } = {}) {
  const zip = new AdmZip(buffer);
  const sharedStrings = readSharedStrings(zip);
  const sheets = readSheetIndex(zip);

  const peopleByKey = new Map();
  const sheetSummaries = [];
  let referencePeriod = null;

  for (const sheet of sheets) {
    const rows = readSheetRows(zip, sheet.path, sharedStrings);
    const header = mapIdentityColumns(rows);
    if (!header) {
      sheetSummaries.push({ sheet: sheet.name, people: 0, skipped: 'cabeçalho não reconhecido' });
      continue;
    }

    let peopleInSheet = 0;
    for (let index = header.headerIndex + 1; index < rows.length; index += 1) {
      const cells = rows[index];
      const record = {};
      for (const [column, field] of header.mapping) {
        const value = cells.get(column);
        if (value !== undefined) record[field] = value;
      }

      const name = String(record.name || '').replace(/\s+/g, ' ').trim();
      if (!name || !isMaskedCpf(record.maskedCpf)) continue;

      const registration = String(record.registration || '').trim();
      const period = referencePeriodFrom(record.year, record.month);
      if (period && !referencePeriod) referencePeriod = period;

      const employeeKey = registration || `${sheet.name}:${name}`;
      const affiliation = {
        employmentType: employmentTypeFrom(sheet.name, record.employmentCode),
        referencePeriod: period,
        sourceSheet: sheet.name,
      };

      const existing = peopleByKey.get(employeeKey);
      if (existing) {
        const known = existing.affiliations.some((item) => (
          item.employmentType === affiliation.employmentType && item.sourceSheet === affiliation.sourceSheet
        ));
        if (!known) existing.affiliations.push(affiliation);
        continue;
      }

      peopleByKey.set(employeeKey, {
        employeeKey,
        name,
        maskedCpf: String(record.maskedCpf).trim(),
        affiliations: [affiliation],
      });
      peopleInSheet += 1;
    }

    sheetSummaries.push({ sheet: sheet.name, people: peopleInSheet });
  }

  return {
    people: [...peopleByKey.values()],
    dataset: {
      sourceName,
      referencePeriod,
      sheets: sheetSummaries,
      payrollValuesImported: false,
    },
  };
}

module.exports = {
  readPayrollWorkbook,
  mapIdentityColumns,
  employmentTypeFrom,
  referencePeriodFrom,
  normalizeHeader,
};
