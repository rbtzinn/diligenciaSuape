// ==========================================================
// DILIGÊNCIA 360 — Rede regulatória de fundos de investimento
// Fonte pública oficial: Cadastro de Fundos da CVM
// ==========================================================

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const AdmZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const { safeFetch } = require('../utils/safeFetch');
const CompanyService = require('./company.service');

const DATA_URL = 'https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip';
const SOURCE_PAGE = 'https://dados.cvm.gov.br/dataset/fi-cad';
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'cvm-funds');
const CACHE_FILE = path.join(CACHE_DIR, 'registro_fundo_classe.zip');
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MEMORY_TTL_MS = 6 * 60 * 60 * 1_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

let indexCache = null;
let indexJob = null;

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function compactHash(...values) {
  return crypto.createHash('sha256').update(values.join('|')).digest('hex').slice(0, 20);
}

function parseNumber(value) {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCompanyShape(name, document) {
  if ([8, 14].includes(digits(document).length)) return true;
  const normalized = normalize(name);
  return /\b(LTDA|S\.?A\.?|EIRELI|FUNDO|FIP|HOLDING|PARTICIPACOES)\b/.test(normalized);
}

function personKey(name) {
  return `person:cvm-network:${compactHash(normalize(name))}`;
}

function companyKey(document, name) {
  const value = digits(document);
  if (value.length === 14) return `company:cnpj:${value}`;
  if (value.length === 8) return `company:cnpj-base:${value}`;
  return `company:cvm-network:${compactHash(normalize(name))}`;
}

function relationshipType(qualification, isCompany) {
  const value = normalize(qualification);
  if (value.includes('ADMINISTRADOR') || value.includes('DIRETOR') || value.includes('PRESIDENTE')) return 'DIRECTOR_OF';
  if (value.includes('REPRESENTANTE')) return 'LEGAL_REPRESENTATIVE_OF';
  return isCompany || value.includes('SOCIO') || value.includes('ACIONISTA')
    ? 'SHAREHOLDER_OF'
    : 'MEMBER_OF';
}

async function freshCacheFile() {
  try {
    const stat = await fs.stat(CACHE_FILE);
    return stat.isFile() && stat.size > 1_000 && Date.now() - stat.mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

async function getDatasetBuffer() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  if (await freshCacheFile()) return fs.readFile(CACHE_FILE);

  const response = await safeFetch(DATA_URL, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  if (!response.ok) throw new Error(`Cadastro de Fundos/CVM: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1_000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error('Cadastro de Fundos/CVM: arquivo ZIP inválido');
  }

  const temporary = `${CACHE_FILE}.part-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, buffer);
  await fs.copyFile(temporary, CACHE_FILE);
  await fs.unlink(temporary).catch(() => undefined);
  return buffer;
}

function parseEntry(zip, entryName) {
  const entry = zip.getEntry(entryName);
  if (!entry) throw new Error(`Cadastro de Fundos/CVM: ${entryName} ausente no ZIP`);
  return parse(entry.getData().toString('latin1'), {
    columns: true,
    delimiter: ';',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  });
}

function buildFundIndexes(fundRows, classRows) {
  const fundByCnpj = new Map();
  const fundById = new Map();
  const classByCnpj = new Map();
  const classesByFundId = new Map();

  fundRows.forEach((row) => {
    const cnpj = digits(row.CNPJ_Fundo);
    const id = cleanText(row.ID_Registro_Fundo);
    if (cnpj.length === 14) fundByCnpj.set(cnpj, row);
    if (id) fundById.set(id, row);
  });

  classRows.forEach((row) => {
    const cnpj = digits(row.CNPJ_Classe);
    const fundId = cleanText(row.ID_Registro_Fundo);
    if (cnpj.length === 14) classByCnpj.set(cnpj, row);
    if (!fundId) return;
    const current = classesByFundId.get(fundId) || [];
    current.push(row);
    classesByFundId.set(fundId, current);
  });

  return { fundByCnpj, fundById, classByCnpj, classesByFundId };
}

async function loadIndexes() {
  if (indexCache && Date.now() - indexCache.loadedAt < MEMORY_TTL_MS) return indexCache.indexes;
  if (indexJob) return indexJob;

  indexJob = (async () => {
    const buffer = await getDatasetBuffer();
    const zip = new AdmZip(buffer);
    const indexes = buildFundIndexes(
      parseEntry(zip, 'registro_fundo.csv'),
      parseEntry(zip, 'registro_classe.csv'),
    );
    indexCache = { loadedAt: Date.now(), indexes };
    return indexes;
  })().finally(() => {
    indexJob = null;
  });
  return indexJob;
}

function addEntity(entityMap, entity) {
  const current = entityMap.get(entity.key);
  entityMap.set(entity.key, {
    ...current,
    ...entity,
    properties: { ...(current?.properties || {}), ...(entity.properties || {}) },
    identifiers: [...(current?.identifiers || []), ...(entity.identifiers || [])]
      .filter((identifier, index, all) => all.findIndex((candidate) => (
        candidate.type === identifier.type && candidate.value === identifier.value
      )) === index),
    depth: Math.min(current?.depth ?? entity.depth ?? 0, entity.depth ?? 0),
  });
}

function addRelationship(relationshipMap, relationship) {
  const key = relationship.key || `fund-rel:${compactHash(relationship.sourceKey, relationship.type, relationship.targetKey)}`;
  const current = relationshipMap.get(key);
  relationshipMap.set(key, {
    ...current,
    ...relationship,
    key,
    properties: { ...(current?.properties || {}), ...(relationship.properties || {}) },
  });
  return key;
}

function qsaEntity(member, relatedCompanyCnpj) {
  const name = cleanText(member.nome_socio);
  const rawDocument = cleanText(member.cnpj_cpf_do_socio);
  const document = digits(rawDocument);
  const isCompany = hasCompanyShape(name, rawDocument);
  const type = isCompany ? 'Company' : 'Person';
  const key = isCompany ? companyKey(document, name) : personKey(name);
  return {
    key,
    type,
    name,
    role: isCompany ? 'related_shareholder_company' : 'related_governance_person',
    depth: 2,
    confidence: document.length === 14 || !isCompany ? 100 : 85,
    properties: {
      qualification: cleanText(member.qualificacao_socio) || null,
      joinedAt: cleanText(member.data_entrada_sociedade) || null,
      relatedCompanyCnpj,
      cnpjBase: isCompany && document.length === 8 ? document : null,
      incompleteIdentifier: isCompany && document.length !== 14,
    },
    identifiers: document.length > 0 ? [{
      type: isCompany ? (document.length === 14 ? 'CNPJ' : 'CNPJ_BASE') : 'MASKED_CPF',
      value: rawDocument || document,
      provider: 'BrasilAPI / Receita Federal',
      confidence: document.length === 14 || !isCompany ? 100 : 85,
    }] : [],
  };
}

function fundProfile(fund, fundClass) {
  return {
    cvmFundCode: cleanText(fund.Codigo_CVM) || null,
    fundType: cleanText(fund.Tipo_Fundo) || null,
    registrationDate: cleanText(fund.Data_Registro) || null,
    registrationStatus: cleanText(fund.Situacao) || null,
    statusStartDate: cleanText(fund.Data_Inicio_Situacao) || null,
    fiscalYearStart: cleanText(fund.Data_Inicio_Exercicio_Social) || null,
    fiscalYearEnd: cleanText(fund.Data_Fim_Exercicio_Social) || null,
    netAssetValue: parseNumber(fundClass?.Patrimonio_Liquido || fund.Patrimonio_Liquido),
    netAssetValueDate: cleanText(fundClass?.Data_Patrimonio_Liquido || fund.Data_Patrimonio_Liquido) || null,
    className: cleanText(fundClass?.Denominacao_Social) || null,
    classType: cleanText(fundClass?.Tipo_Classe) || null,
    condominiumForm: cleanText(fundClass?.Forma_Condominio) || null,
  };
}

function regulatedParties(fund, fundClass) {
  const parties = [];
  const addCompany = (cnpj, name, type, label, role, extra = {}) => {
    const value = digits(cnpj);
    if (value.length !== 14 || !cleanText(name)) return;
    parties.push({ cnpj: value, name: cleanText(name), type, label, role, extra });
  };

  addCompany(fund.CNPJ_Administrador, fund.Administrador, 'ADMINISTERS_FUND', 'Administra o fundo', 'fund_administrator');
  addCompany(fund.CPF_CNPJ_Gestor, fund.Gestor, 'MANAGES_FUND', 'Faz a gestão do fundo', 'fund_manager', {
    managerPersonType: cleanText(fund.Tipo_Pessoa_Gestor) || null,
  });
  addCompany(fundClass?.CNPJ_Auditor, fundClass?.Auditor, 'AUDITS_FUND', 'Audita a classe do fundo', 'fund_auditor');
  addCompany(fundClass?.CNPJ_Custodiante, fundClass?.Custodiante, 'CUSTODIAN_OF', 'Mantém a custódia da classe', 'fund_custodian');
  addCompany(fundClass?.CNPJ_Controlador, fundClass?.Controlador, 'CONTROLS_FUND', 'Realiza a controladoria da classe', 'fund_controller');
  return parties;
}

async function expandPartyQsa(party, entityMap, relationshipMap, evidences) {
  const response = await CompanyService.getCompanyByCNPJ(party.cnpj);
  if (!response.ok || !response.data) return { ok: false, cnpj: party.cnpj, status: response.status || 503 };
  const company = response.data;
  const targetKey = companyKey(party.cnpj, party.name);
  addEntity(entityMap, {
    key: targetKey,
    type: 'Company',
    name: cleanText(company.razao_social) || party.name,
    role: party.role,
    depth: 1,
    confidence: 100,
    properties: {
      cnpj: party.cnpj,
      tradeName: cleanText(company.nome_fantasia) || null,
      registrationStatus: cleanText(company.descricao_situacao_cadastral) || null,
      municipality: cleanText(company.municipio) || null,
      state: cleanText(company.uf) || null,
      source: response.fonte || 'BrasilAPI',
    },
    identifiers: [{ type: 'CNPJ', value: party.cnpj, provider: response.fonte || 'BrasilAPI', confidence: 100 }],
  });

  for (const member of Array.isArray(company.qsa) ? company.qsa : []) {
    if (!cleanText(member.nome_socio)) continue;
    const entity = qsaEntity(member, party.cnpj);
    addEntity(entityMap, entity);
    const type = relationshipType(member.qualificacao_socio, entity.type === 'Company');
    const relationshipKey = addRelationship(relationshipMap, {
      sourceKey: entity.key,
      targetKey,
      type,
      label: cleanText(member.qualificacao_socio) || (type === 'DIRECTOR_OF' ? 'Administra a empresa' : 'Integra o QSA'),
      status: 'CONFIRMED',
      confidence: entity.confidence,
      properties: {
        qualification: cleanText(member.qualificacao_socio) || null,
        joinedAt: cleanText(member.data_entrada_sociedade) || null,
        provider: response.fonte || 'BrasilAPI / Receita Federal',
      },
    });
    evidences.push({
      relationshipKey,
      provider: 'CORPORATE_REGISTRY',
      sourceName: response.fonte || 'BrasilAPI / Receita Federal',
      sourceUrl: `https://brasilapi.com.br/api/cnpj/v1/${party.cnpj}`,
      query: party.cnpj,
      identifier: cleanText(member.cnpj_cpf_do_socio) || member.nome_socio,
      excerpt: `${member.nome_socio} consta no QSA de ${company.razao_social} como “${member.qualificacao_socio || 'integrante'}”.`,
      confidence: entity.confidence,
      retrievedAt: response.consultadoEm || new Date().toISOString(),
    });

    const representativeName = cleanText(member.nome_representante_legal);
    if (!representativeName || normalize(representativeName) === 'NAO INFORMADO') continue;
    const representativeKey = personKey(representativeName);
    addEntity(entityMap, {
      key: representativeKey,
      type: 'Person',
      name: representativeName,
      role: 'legal_representative',
      depth: 3,
      confidence: 100,
      properties: {
        qualification: cleanText(member.qualificacao_representante_legal) || 'Representante legal',
        representedEntity: entity.name,
      },
      identifiers: member.cpf_representante_legal ? [{
        type: 'MASKED_CPF',
        value: cleanText(member.cpf_representante_legal),
        provider: response.fonte || 'BrasilAPI',
        confidence: 100,
      }] : [],
    });
    const representativeRelationshipKey = addRelationship(relationshipMap, {
      sourceKey: representativeKey,
      targetKey: entity.key,
      type: 'LEGAL_REPRESENTATIVE_OF',
      label: cleanText(member.qualificacao_representante_legal) || 'Representa legalmente',
      status: 'CONFIRMED',
      confidence: 100,
      properties: { provider: response.fonte || 'BrasilAPI / Receita Federal' },
    });
    evidences.push({
      relationshipKey: representativeRelationshipKey,
      provider: 'CORPORATE_REGISTRY',
      sourceName: response.fonte || 'BrasilAPI / Receita Federal',
      sourceUrl: `https://brasilapi.com.br/api/cnpj/v1/${party.cnpj}`,
      query: party.cnpj,
      identifier: cleanText(member.cpf_representante_legal) || representativeName,
      excerpt: `${representativeName} é informado como representante legal de ${entity.name} no QSA consultado.`,
      confidence: 100,
      retrievedAt: response.consultadoEm || new Date().toISOString(),
    });
  }
  return { ok: true, cnpj: party.cnpj };
}

async function buildFundNetwork(cnpj, indexes) {
  const exactFund = indexes.fundByCnpj.get(cnpj);
  const exactClass = indexes.classByCnpj.get(cnpj);
  const fund = exactFund || (exactClass ? indexes.fundById.get(cleanText(exactClass.ID_Registro_Fundo)) : null);
  if (!fund) {
    return {
      ok: true,
      status: 200,
      applicable: false,
      provider: 'CVM — Cadastro de Fundos',
      entities: [],
      relationships: [],
      evidences: [],
      aviso: 'O CNPJ não consta como fundo ou classe no cadastro público atual da CVM.',
      sourceUrl: SOURCE_PAGE,
      consultadoEm: new Date().toISOString(),
    };
  }

  const fundId = cleanText(fund.ID_Registro_Fundo);
  const fundClasses = indexes.classesByFundId.get(fundId) || [];
  const fundClass = exactClass
    || fundClasses.find((row) => digits(row.CNPJ_Classe) === cnpj)
    || fundClasses[0]
    || null;
  const rootKey = `company:cnpj:${cnpj}`;
  const entityMap = new Map();
  const relationshipMap = new Map();
  const evidences = [];
  const parties = regulatedParties(fund, fundClass);

  addEntity(entityMap, {
    key: rootKey,
    type: 'InvestmentFund',
    name: cleanText(fund.Denominacao_Social) || cleanText(fundClass?.Denominacao_Social) || `Fundo ${cnpj}`,
    role: 'root',
    depth: 0,
    confidence: 100,
    properties: { cnpj, ...fundProfile(fund, fundClass), source: 'CVM — Cadastro de Fundos' },
    identifiers: [{ type: 'CNPJ', value: cnpj, provider: 'CVM', confidence: 100 }],
  });

  parties.forEach((party) => {
    const key = companyKey(party.cnpj, party.name);
    addEntity(entityMap, {
      key,
      type: 'Company',
      name: party.name,
      role: party.role,
      depth: 1,
      confidence: 100,
      properties: { cnpj: party.cnpj, regulatedRole: party.label, ...party.extra },
      identifiers: [{ type: 'CNPJ', value: party.cnpj, provider: 'CVM', confidence: 100 }],
    });
    const relationshipKey = addRelationship(relationshipMap, {
      sourceKey: key,
      targetKey: rootKey,
      type: party.type,
      label: party.label,
      status: 'CONFIRMED',
      confidence: 100,
      properties: {
        provider: 'CVM — Cadastro de Fundos',
        className: cleanText(fundClass?.Denominacao_Social) || null,
        ownershipRelation: false,
        ...party.extra,
      },
    });
    evidences.push({
      relationshipKey,
      provider: 'CVM_FUND_REGISTRY',
      sourceName: 'CVM — Cadastro de Fundos',
      sourceUrl: SOURCE_PAGE,
      query: cnpj,
      identifier: party.cnpj,
      excerpt: `${party.name} consta no cadastro da CVM com o papel “${party.label}”. Esse vínculo de prestação regulada não implica participação societária ou posição de cotista.`,
      confidence: 100,
      retrievedAt: new Date().toISOString(),
    });
  });

  const directorName = cleanText(fund.Diretor);
  if (directorName) {
    const directorKey = personKey(directorName);
    addEntity(entityMap, {
      key: directorKey,
      type: 'Person',
      name: directorName,
      role: 'fund_responsible_director',
      depth: 1,
      confidence: 100,
      properties: { position: 'Diretor responsável', source: 'CVM — Cadastro de Fundos' },
      identifiers: [],
    });
    const relationshipKey = addRelationship(relationshipMap, {
      sourceKey: directorKey,
      targetKey: rootKey,
      type: 'RESPONSIBLE_DIRECTOR_OF',
      label: 'Diretor responsável pelo fundo',
      status: 'CONFIRMED',
      confidence: 100,
      properties: { provider: 'CVM — Cadastro de Fundos' },
    });
    evidences.push({
      relationshipKey,
      provider: 'CVM_FUND_REGISTRY',
      sourceName: 'CVM — Cadastro de Fundos',
      sourceUrl: SOURCE_PAGE,
      query: cnpj,
      identifier: directorName,
      excerpt: `${directorName} consta como diretor responsável no registro atual do fundo.`,
      confidence: 100,
      retrievedAt: new Date().toISOString(),
    });
  }

  const expansions = await Promise.all(parties.map((party) => (
    expandPartyQsa(party, entityMap, relationshipMap, evidences).catch((error) => ({
      ok: false,
      cnpj: party.cnpj,
      status: 503,
      erro: error.message,
    }))
  )));
  const failures = expansions.filter((result) => !result.ok);

  return {
    ok: true,
    status: 200,
    applicable: true,
    provider: 'CVM — Cadastro de Fundos',
    fund: {
      cnpj: digits(fund.CNPJ_Fundo) || cnpj,
      name: cleanText(fund.Denominacao_Social),
      ...fundProfile(fund, fundClass),
    },
    fundClass: fundClass ? {
      cnpj: digits(fundClass.CNPJ_Classe),
      name: cleanText(fundClass.Denominacao_Social),
      type: cleanText(fundClass.Tipo_Classe),
      status: cleanText(fundClass.Situacao),
      netAssetValue: parseNumber(fundClass.Patrimonio_Liquido),
      netAssetValueDate: cleanText(fundClass.Data_Patrimonio_Liquido) || null,
    } : null,
    directParties: parties.length + (directorName ? 1 : 0),
    expandedCompanies: expansions.filter((result) => result.ok).length,
    expansionFailures: failures.length,
    consultaParcial: failures.length > 0,
    entities: [...entityMap.values()],
    relationships: [...relationshipMap.values()],
    evidences,
    sourceUrl: SOURCE_PAGE,
    dataUrl: DATA_URL,
    consultadoEm: new Date().toISOString(),
  };
}

const CvmFundNetworkService = {
  async getRelationshipNetwork({ cnpj }) {
    const targetCnpj = digits(cnpj);
    if (targetCnpj.length !== 14) {
      return { ok: false, status: 400, applicable: false, erro: 'CNPJ inválido.', entities: [], relationships: [], evidences: [] };
    }
    try {
      const indexes = await loadIndexes();
      return await buildFundNetwork(targetCnpj, indexes);
    } catch (error) {
      return {
        ok: false,
        status: 503,
        applicable: true,
        provider: 'CVM — Cadastro de Fundos',
        entities: [],
        relationships: [],
        evidences: [],
        erro: error.message,
        sourceUrl: SOURCE_PAGE,
        consultadoEm: new Date().toISOString(),
      };
    }
  },
};

module.exports = {
  CvmFundNetworkService,
  buildFundIndexes,
  buildFundNetwork,
};
