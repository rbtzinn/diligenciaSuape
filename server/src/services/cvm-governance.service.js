// ==========================================================
// DILIGÊNCIA 360 — Histórico de Governança em Companhias Abertas
// Fonte pública: Formulário de Referência (FRE) da CVM
// ==========================================================

const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse');
const { safeFetch } = require('../utils/safeFetch');

const FRE_BASE_URL = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS';
const SOURCE_PAGE = `${FRE_BASE_URL}/`;
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'cvm-fre');
const DOWNLOAD_TIMEOUT_MS = 120_000;
const downloadJobs = new Map();
const resultCache = new Map();
const RESULT_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseNumber(value) {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function maskDocument(value, personType = '') {
  const document = digits(value);
  const isPerson = normalize(personType).includes('FISICA') || document.length === 11;
  if (isPerson && document.length === 11) return `***.${document.slice(3, 6)}.${document.slice(6, 9)}-**`;
  if (document.length === 14) {
    return `${document.slice(0, 2)}.${document.slice(2, 5)}.${document.slice(5, 8)}/${document.slice(8, 12)}-${document.slice(12)}`;
  }
  return undefined;
}

function publicCompanyNature(legalNature) {
  const value = normalize(legalNature);
  if (!value) return true;
  return value.includes('ANONIMA ABERTA') || value.includes('ECONOMIA MISTA');
}

function compareDocumentRows(left, right) {
  const leftReference = Date.parse(left.Data_Referencia || '') || 0;
  const rightReference = Date.parse(right.Data_Referencia || '') || 0;
  if (leftReference !== rightReference) return leftReference - rightReference;

  const leftVersion = Number(left.Versao) || 0;
  const rightVersion = Number(right.Versao) || 0;
  if (leftVersion !== rightVersion) return leftVersion - rightVersion;

  return (Number(left.ID_Documento) || 0) - (Number(right.ID_Documento) || 0);
}

function latestDocumentRows(rows) {
  if (!rows.length) return [];
  const latest = rows.reduce((best, row) => (compareDocumentRows(row, best) > 0 ? row : best), rows[0]);
  return rows.filter((row) => String(row.ID_Documento) === String(latest.ID_Documento));
}

function classifyAdministration(organization) {
  const value = normalize(organization);
  if (value.includes('CONSELHO FISCAL')) return 'fiscal_council';
  if (value.includes('CONSELHO DE ADMINISTRACAO')) return 'board';
  return 'director';
}

function cleanRole(value) {
  return cleanText(value).replace(/^\d+\s*-\s*/, '');
}

function administrationRecord(row, year) {
  const category = classifyAdministration(row.Orgao_Administracao);
  const name = cleanText(row.Nome);
  const documentKey = digits(row.CPF);
  return {
    id: `cvm-admin-${year}-${row.ID_Documento}-${documentKey || normalize(name)}`,
    identityKey: `ADMIN:${documentKey || normalize(name)}`,
    name,
    category,
    qualification: cleanRole(row.Cargo_Eletivo_Ocupado) || cleanText(row.Orgao_Administracao) || 'Administrador',
    organization: cleanText(row.Orgao_Administracao),
    document: maskDocument(row.CPF, 'Pessoa Física'),
    year,
    referenceDate: cleanText(row.Data_Referencia) || undefined,
    electionDate: cleanText(row.Data_Eleicao) || undefined,
    possessionDate: cleanText(row.Data_Posse) || undefined,
    firstMandateStart: cleanText(row.Data_Inicio_Primeiro_Mandato) || undefined,
    mandateTerm: cleanText(row.Prazo_Mandato) || undefined,
    electedByController: normalize(row.Eleito_Controlador) === 'S',
    sourceDocumentId: cleanText(row.ID_Documento),
    sourceVersion: Number(row.Versao) || undefined,
  };
}

function isNamedTopLevelShareholder(row) {
  if (cleanText(row.ID_Acionista_Relacionado) || cleanText(row.Acionista_Relacionado)) return false;
  const name = normalize(row.Acionista);
  return Boolean(name) && name !== 'OUTROS' && name !== 'ACOES TESOURARIA';
}

function shareholderRecord(row, year) {
  const name = cleanText(row.Acionista);
  const documentKey = digits(row.CPF_CNPJ_Acionista);
  const controller = normalize(row.Acionista_Controlador) === 'S';
  return {
    id: `cvm-shareholder-${year}-${row.ID_Documento}-${documentKey || normalize(name)}`,
    identityKey: `SHAREHOLDER:${documentKey || normalize(name)}`,
    name,
    category: 'shareholder',
    qualification: controller ? 'Acionista controlador' : 'Acionista relevante informado no FRE',
    organization: 'Posição acionária',
    document: maskDocument(row.CPF_CNPJ_Acionista, row.Tipo_Pessoa_Acionista),
    year,
    referenceDate: cleanText(row.Data_Referencia) || undefined,
    compositionDate: cleanText(row.Data_Composicao_Capital_Social) || undefined,
    lastChangeDate: cleanText(row.Data_Ultima_Alteracao) || undefined,
    totalSharePercent: parseNumber(row.Percentual_Total_Acoes_Circulacao),
    ordinarySharePercent: parseNumber(row.Percentual_Acao_Ordinaria_Circulacao),
    preferredSharePercent: parseNumber(row.Percentual_Acao_Preferencial_Circulacao),
    controller,
    shareholderAgreement: normalize(row.Participante_Acordo_Acionistas) === 'S',
    sourceDocumentId: cleanText(row.ID_Documento),
    sourceVersion: Number(row.Versao) || undefined,
  };
}

async function parseEntryForCompany(entry, targetCnpj) {
  if (!entry) return [];
  const rows = [];
  const parser = parse({
    columns: true,
    delimiter: ';',
    encoding: 'latin1',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });

  const stream = Readable.from([entry.getData()]).pipe(parser);
  for await (const row of stream) {
    if (digits(row.CNPJ_Companhia) === targetCnpj) rows.push(row);
  }
  return latestDocumentRows(rows);
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 1_000;
  } catch {
    return false;
  }
}

async function downloadAnnualZip(year) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const filePath = path.join(CACHE_DIR, `fre_cia_aberta_${year}.zip`);
  if (await fileExists(filePath)) return filePath;

  if (downloadJobs.has(year)) return downloadJobs.get(year);

  const job = (async () => {
    const url = `${FRE_BASE_URL}/fre_cia_aberta_${year}.zip`;
    const response = await safeFetch(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
    if (!response.ok) throw new Error(`CVM FRE ${year}: HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1_000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error(`CVM FRE ${year}: arquivo anual inválido`);
    }

    const temporaryPath = `${filePath}.part-${process.pid}-${Date.now()}`;
    await fs.writeFile(temporaryPath, buffer);
    await fs.rename(temporaryPath, filePath);
    return filePath;
  })().finally(() => downloadJobs.delete(year));

  downloadJobs.set(year, job);
  return job;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function readAnnualGovernance(zipPath, year, targetCnpj) {
  const zip = new AdmZip(zipPath);
  const administratorsEntry = zip.getEntry(`fre_cia_aberta_administrador_membro_conselho_fiscal_${year}.csv`);
  const shareholdersEntry = zip.getEntry(`fre_cia_aberta_posicao_acionaria_${year}.csv`);

  const administratorRows = await parseEntryForCompany(administratorsEntry, targetCnpj);
  const shareholderRows = await parseEntryForCompany(shareholdersEntry, targetCnpj);
  const administrators = administratorRows
    .filter((row) => cleanText(row.Nome))
    .map((row) => administrationRecord(row, year));
  const shareholders = shareholderRows
    .filter(isNamedTopLevelShareholder)
    .map((row) => shareholderRecord(row, year));
  const sample = administratorRows[0] || shareholderRows[0];

  return {
    year,
    administrators,
    shareholders,
    coverage: {
      year,
      status: administrators.length || shareholders.length ? 'consulted' : 'no_record',
      administrators: administrators.length,
      shareholders: shareholders.length,
      referenceDate: sample?.Data_Referencia || undefined,
      documentId: sample?.ID_Documento || undefined,
      version: Number(sample?.Versao) || undefined,
    },
  };
}

function aggregateGovernanceRecords(records, years) {
  const byIdentity = new Map();
  records.forEach((record) => {
    const existing = byIdentity.get(record.identityKey) || {
      id: record.identityKey,
      name: record.name,
      document: record.document,
      categories: [],
      years: [],
      snapshots: [],
    };
    if (!existing.categories.includes(record.category)) existing.categories.push(record.category);
    if (!existing.years.includes(record.year)) existing.years.push(record.year);
    existing.snapshots.push(record);
    byIdentity.set(record.identityKey, existing);
  });

  return Array.from(byIdentity.values()).map((member) => {
    member.years.sort((left, right) => left - right);
    member.snapshots.sort((left, right) => left.year - right.year);
    const latest = member.snapshots[member.snapshots.length - 1];
    return {
      ...member,
      qualification: latest.qualification,
      organization: latest.organization,
      firstSeenExercise: member.years[0],
      lastSeenExercise: member.years[member.years.length - 1],
      presentInLatestExercise: member.years.includes(years[years.length - 1]),
      latestSnapshot: latest,
    };
  }).sort((left, right) => {
    const leftShareholder = left.categories.includes('shareholder');
    const rightShareholder = right.categories.includes('shareholder');
    return Number(leftShareholder) - Number(rightShareholder) || left.name.localeCompare(right.name, 'pt-BR');
  });
}

const CvmGovernanceService = {
  async getFiveExerciseHistory({ cnpj, legalNature, referenceDate = new Date() }) {
    const targetCnpj = digits(cnpj);
    if (targetCnpj.length !== 14) {
      return { ok: false, status: 400, applicable: false, erro: 'CNPJ inválido para consulta histórica.' };
    }

    const currentYear = referenceDate.getFullYear();
    const years = Array.from({ length: 5 }, (_, index) => currentYear - 4 + index);
    if (!publicCompanyNature(legalNature)) {
      return {
        ok: true,
        status: 200,
        applicable: false,
        provider: 'CVM — Formulário de Referência (FRE)',
        years,
        members: [],
        coverage: years.map((year) => ({ year, status: 'not_applicable' })),
        coverageStatus: 'not_applicable',
        aviso: 'A base FRE da CVM é destinada a companhias abertas. Para esta empresa, solicite a Certidão Específica — Linha do Tempo do QSA na Junta Comercial competente.',
        sourceUrl: SOURCE_PAGE,
        consultadoEm: new Date().toISOString(),
      };
    }

    const cacheKey = `${targetCnpj}:${years.join('-')}`;
    const cached = resultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cacheHit: true };
    }

    const zipResults = await mapWithConcurrency(years, 2, downloadAnnualZip);
    const annual = [];
    const coverage = [];
    for (let index = 0; index < years.length; index += 1) {
      const year = years[index];
      const zipResult = zipResults[index];
      if (zipResult.status === 'rejected') {
        coverage.push({ year, status: 'unavailable', message: zipResult.reason?.message || 'Arquivo anual indisponível.' });
        continue;
      }

      try {
        const result = await readAnnualGovernance(zipResult.value, year, targetCnpj);
        annual.push(result);
        coverage.push(result.coverage);
      } catch (error) {
        coverage.push({ year, status: 'unavailable', message: error.message || 'Falha ao processar o arquivo anual.' });
      }
    }

    const records = annual.flatMap((item) => [...item.administrators, ...item.shareholders]);
    const members = aggregateGovernanceRecords(records, years);
    const consultedYears = coverage.filter((item) => item.status === 'consulted').length;
    const unavailableYears = coverage.filter((item) => item.status === 'unavailable').length;
    const coverageStatus = consultedYears === years.length
      ? 'complete_public'
      : consultedYears > 0
        ? 'partial'
        : 'unavailable';

    const result = {
      ok: consultedYears > 0,
      status: consultedYears > 0 ? 200 : 503,
      applicable: true,
      provider: 'CVM — Formulário de Referência (FRE)',
      years,
      members,
      coverage,
      coverageStatus,
      directors: members.filter((member) => member.categories.some((category) => category !== 'shareholder')).length,
      shareholders: members.filter((member) => member.categories.includes('shareholder')).length,
      consultedYears,
      unavailableYears,
      aviso: coverageStatus === 'complete_public'
        ? 'Cinco arquivos anuais do FRE foram consultados. A presença indica que a pessoa ou o acionista consta no último documento disponível daquele exercício; ausência não informa, sozinha, a data exata de saída.'
        : 'A consulta histórica ficou parcial. Confira os exercícios marcados como indisponíveis antes de concluir a análise.',
      sourceUrl: SOURCE_PAGE,
      consultadoEm: new Date().toISOString(),
    };
    resultCache.set(cacheKey, { result, expiresAt: Date.now() + RESULT_CACHE_TTL_MS });
    return result;
  },
};

module.exports = {
  CvmGovernanceService,
  aggregateGovernanceRecords,
  administrationRecord,
  shareholderRecord,
};
