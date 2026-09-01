// ==========================================================
// DILIGÊNCIA 360 — Base funcional minimizada (CSV)
// Formato derivado da folha institucional, contendo apenas as colunas
// que a aplicação usa. Legível, auditável em diff e sem remuneração.
// ==========================================================

const { parse } = require('csv-parse/sync');

const COLUMNS = ['nome', 'chapa', 'cpf_mascarado', 'tipo_vinculo', 'competencia', 'origem'];

function normalizeHeaderName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function isMaskedCpf(value) {
  const normalized = String(value || '').replace(/[^0-9*]/g, '');
  return normalized.length >= 8 && normalized.includes('*');
}

/**
 * Lê o CSV minimizado e devolve as identidades funcionais.
 * Linha sem nome ou sem CPF mascarado é descartada.
 */
function readFunctionalDataset(content, { sourceName = 'Base funcional interna' } = {}) {
  const rows = parse(content, {
    columns: (header) => header.map(normalizeHeaderName),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter: [',', ';'],
    relax_column_count: true,
  });

  const peopleByKey = new Map();
  const sheetCounters = new Map();
  let referencePeriod = null;

  for (const row of rows) {
    const name = String(row.nome || '').replace(/\s+/g, ' ').trim();
    const maskedCpf = String(row.cpf_mascarado || '').trim();
    if (!name || !isMaskedCpf(maskedCpf)) continue;

    const registration = String(row.chapa || '').trim();
    const employmentType = String(row.tipo_vinculo || '').trim() || 'Vínculo institucional';
    const period = String(row.competencia || '').trim() || null;
    const sourceSheet = String(row.origem || '').trim() || null;
    if (period && !referencePeriod) referencePeriod = period;

    const employeeKey = registration || `${sourceSheet || 'base'}:${name}`;
    const affiliation = { employmentType, referencePeriod: period, sourceSheet };
    const existing = peopleByKey.get(employeeKey);

    if (existing) {
      const known = existing.affiliations.some((item) => (
        item.employmentType === affiliation.employmentType && item.sourceSheet === affiliation.sourceSheet
      ));
      if (!known) existing.affiliations.push(affiliation);
      continue;
    }

    peopleByKey.set(employeeKey, { employeeKey, name, maskedCpf, affiliations: [affiliation] });
    const sheetKey = sourceSheet || 'base';
    sheetCounters.set(sheetKey, (sheetCounters.get(sheetKey) || 0) + 1);
  }

  return {
    people: [...peopleByKey.values()],
    dataset: {
      sourceName,
      referencePeriod,
      sheets: [...sheetCounters.entries()].map(([sheet, people]) => ({ sheet, people })),
      payrollValuesImported: false,
    },
  };
}

/**
 * Empacota o CSV como módulo JavaScript.
 *
 * Em ambiente serverless o bundle inclui apenas o que o rastreamento de
 * dependências consegue enxergar no código. Um arquivo lido por caminho vindo
 * de variável de ambiente é invisível para esse rastreamento e fica de fora do
 * deploy sem gerar erro de build. Como módulo, a base é código: entra sempre.
 *
 * O conteúdo continua sendo o mesmo CSV, linha a linha, para que o diff de
 * cada competência permaneça legível em auditoria.
 */
function wrapAsModule(csv, { referencePeriod = null, people = 0 } = {}) {
  const safeCsv = csv.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `// ==========================================================
// DILIGÊNCIA 360 — Base funcional minimizada
// Arquivo gerado por scripts/build-functional-dataset.js. Não edite à mão.
//
// Competência: ${referencePeriod || 'não informada'} | Pessoas: ${people}
// Contém nome, chapa, CPF mascarado, tipo de vínculo, competência e origem.
// Remuneração não é gravada aqui.
// ==========================================================

module.exports = {
  referencePeriod: ${JSON.stringify(referencePeriod)},
  csv: \`${safeCsv}\`,
};
`;
}

function escapeCsvValue(value) {
  const text = String(value ?? '');
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serializa identidades funcionais no formato minimizado. */
function writeFunctionalDataset(people) {
  const lines = [COLUMNS.join(',')];
  for (const person of people) {
    for (const affiliation of person.affiliations) {
      lines.push([
        person.name,
        person.employeeKey,
        person.maskedCpf,
        affiliation.employmentType || '',
        affiliation.referencePeriod || '',
        affiliation.sourceSheet || '',
      ].map(escapeCsvValue).join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { readFunctionalDataset, writeFunctionalDataset, wrapAsModule, COLUMNS };
