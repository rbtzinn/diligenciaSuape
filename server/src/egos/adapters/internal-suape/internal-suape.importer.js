const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const ExcelJS = require('exceljs');
const { normalizeName, normalizeIdentifier, normalizeText, stableHash } = require('../../domain/normalization');

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
    if (value.result != null) return cellText(value.result);
    if (value.text != null) return String(value.text);
  }
  return String(value).trim();
}

function columnIndex(headers, candidates) {
  const normalizedCandidates = candidates.map(normalizeText);
  return headers.findIndex((header) => normalizedCandidates.includes(normalizeText(header))) + 1;
}

function employmentTypeFor(sheetName, rawType) {
  const sheet = normalizeText(sheetName);
  if (sheet.includes('CONSELHO ADM')) return 'board_administration';
  if (sheet.includes('CONSELHO FISCAL')) return 'board_fiscal';
  if (sheet.includes('COMITE')) return 'audit_committee';
  if (sheet.includes('CEDIDO')) return 'seconded';
  if (sheet.includes('COMISSIONADO')) return 'commissioned';
  if (sheet.includes('FUNCIONARIO')) return 'employee';
  return normalizeText(rawType || 'institutional_member').toLowerCase().replace(/\s+/g, '_');
}

async function parseInternalSuapeWorkbook(filePath, organization = 'SUAPE') {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const records = [];
  const periods = new Set();
  const sheets = [];

  for (const worksheet of workbook.worksheets) {
    let headerRow = 0;
    let headers = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (headerRow) return;
      const values = Array.from({ length: row.cellCount }, (_, index) => cellText(row.getCell(index + 1).value));
      const normalized = values.map(normalizeText);
      if (normalized.includes('NOME') && normalized.includes('CHAPA') && normalized.includes('CPF')) {
        headerRow = rowNumber;
        headers = values;
      }
    });
    if (!headerRow) continue;

    const nameCol = columnIndex(headers, ['NOME']);
    const employeeIdCol = columnIndex(headers, ['CHAPA', 'MATRICULA']);
    const cpfCol = columnIndex(headers, ['CPF']);
    const typeCol = columnIndex(headers, ['TIPO DE FUNCIONARIO', 'TIPO']);
    const yearCol = columnIndex(headers, ['ANO COMPETENCIA', 'ANO']);
    const monthCol = columnIndex(headers, ['MES COMPETENCIA', 'MES']);
    sheets.push(worksheet.name);

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const name = cellText(row.getCell(nameCol).value);
      const employeeId = cellText(row.getCell(employeeIdCol).value);
      if (!name || !employeeId || /TOTAL/i.test(name)) return;

      const normalizedName = normalizeName(name);
      if (!normalizedName) return;
      const maskedCpf = cpfCol ? cellText(row.getCell(cpfCol).value) : '';
      const rawType = typeCol ? cellText(row.getCell(typeCol).value) : '';
      const year = yearCol ? Number(cellText(row.getCell(yearCol).value)) : 0;
      const month = monthCol ? Number(cellText(row.getCell(monthCol).value)) : 0;
      const referencePeriod = year >= 2000 && month >= 1 && month <= 12
        ? `${year}-${String(month).padStart(2, '0')}`
        : null;
      if (referencePeriod) periods.add(referencePeriod);

      records.push({
        employeeKey: `internal:${stableHash(organization, employeeId || normalizedName, normalizeIdentifier(maskedCpf))}`,
        employeeId,
        name,
        normalizedName,
        maskedCpf: maskedCpf || null,
        employmentType: employmentTypeFor(worksheet.name, rawType),
        organization,
        referencePeriod,
        sourceSheet: worksheet.name,
        sourceRow: rowNumber,
      });
    });
  }

  return {
    records,
    sheets,
    periods: [...periods].sort(),
    sourceName: path.basename(filePath),
  };
}

async function importInternalSuape(prisma, filePath, organization = 'SUAPE') {
  const bytes = await fs.readFile(filePath);
  const fileHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const existing = await prisma.internalDataset.findUnique({ where: { fileHash } });
  if (existing) return { ...existing, reused: true };

  const parsed = await parseInternalSuapeWorkbook(filePath, organization);
  if (parsed.records.length === 0) throw new Error('Nenhuma pessoa válida foi localizada na planilha interna.');
  const uniquePeople = new Set(parsed.records.map((record) => record.employeeKey));

  return await prisma.$transaction(async (tx) => {
    await tx.internalAffiliation.updateMany({ where: { organization, current: true }, data: { current: false } });
    const dataset = await tx.internalDataset.create({
      data: {
        id: crypto.randomUUID(),
        organization,
        sourceName: parsed.sourceName,
        fileHash,
        referencePeriod: parsed.periods.length === 1 ? parsed.periods[0] : null,
        recordCount: parsed.records.length,
        uniquePersonCount: uniquePeople.size,
        metadata: {
          periods: parsed.periods,
          sheets: parsed.sheets,
          privacy: 'Somente identificação funcional mínima; remuneração e eventos da folha não foram importados.',
        },
      },
    });

    for (const record of parsed.records) {
      const person = await tx.internalPerson.upsert({
        where: { employeeKey: record.employeeKey },
        update: {
          employeeId: record.employeeId,
          name: record.name,
          normalizedName: record.normalizedName,
          maskedCpf: record.maskedCpf,
          organization,
        },
        create: {
          id: crypto.randomUUID(),
          employeeKey: record.employeeKey,
          employeeId: record.employeeId,
          name: record.name,
          normalizedName: record.normalizedName,
          maskedCpf: record.maskedCpf,
          organization,
        },
      });
      await tx.internalAffiliation.create({
        data: {
          id: crypto.randomUUID(),
          personId: person.id,
          datasetId: dataset.id,
          employmentType: record.employmentType,
          organization,
          referencePeriod: record.referencePeriod,
          sourceSheet: record.sourceSheet,
          sourceRow: record.sourceRow,
          current: true,
        },
      });
    }

    return { ...dataset, reused: false };
  });
}

module.exports = { parseInternalSuapeWorkbook, importInternalSuape, employmentTypeFor };
