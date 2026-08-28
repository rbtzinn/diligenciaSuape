// ==========================================================
// DILIGÊNCIA 360 — Expansão societária por pessoa física
// Usa o grafo público do Minha Receita, derivado dos dados abertos da RFB.
// O serviço público expõe apenas CPF mascarado e um identificador derivado.
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');

const DEFAULT_BASE_URL = 'https://grafo.minhareceita.org';
const DEFAULT_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const responseCache = new Map();

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanCnpj(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function cleanMaskedCpf(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!raw.includes('*') || digits.length !== 6) return '';
  return `***${digits}**`;
}

function normalizeGraphRow(row) {
  const cnpj = cleanCnpj(row?.cnpj);
  const personId = String(row?.id || '').trim().toLowerCase();
  const personName = String(row?.nome || '').replace(/\s+/g, ' ').trim();
  const companyName = String(row?.razao_social || '').replace(/\s+/g, ' ').trim();

  if (cnpj.length !== 14 || !/^[a-f0-9]{32}$/.test(personId) || !personName || !companyName) {
    return null;
  }

  return {
    companyCnpj: cnpj,
    companyName,
    personId,
    personName,
    maskedCpf: cleanMaskedCpf(row?.cpf) || null,
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      output[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return output;
}

class PersonCorporateNetworkService {
  constructor({
    baseUrl = process.env.MINHA_RECEITA_GRAPH_BASE_URL || DEFAULT_BASE_URL,
    fetcher = safeFetch,
  } = {}) {
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetcher = fetcher;
  }

  async fetchNode(identifier) {
    const safeIdentifier = String(identifier || '').trim();
    if (!/^[A-Za-z0-9]{14}$/.test(safeIdentifier) && !/^[a-f0-9]{32}$/i.test(safeIdentifier)) {
      throw new Error('Identificador inválido para consulta no grafo societário.');
    }

    const response = await this.fetcher(`${this.baseUrl}/${encodeURIComponent(safeIdentifier)}`, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });

    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Grafo societário respondeu HTTP ${response.status}.`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Resposta inesperada do grafo societário.');
    }
    return payload.map(normalizeGraphRow).filter(Boolean);
  }

  async expand(rootCompany, options = {}) {
    const rootCnpj = cleanCnpj(rootCompany?.cnpj);
    if (rootCnpj.length !== 14) {
      return {
        ok: false,
        status: 400,
        provider: 'Minha Receita — grafo societário (dados RFB)',
        people: [],
        memberships: [],
        companies: [],
        erro: 'CNPJ raiz inválido para expansão societária por pessoa.',
      };
    }

    const maxPeople = clampInteger(
      options.maxPeople ?? process.env.PERSON_NETWORK_MAX_PEOPLE,
      10,
      1,
      20
    );
    const maxCompanies = clampInteger(
      options.maxCompanies ?? process.env.PERSON_NETWORK_MAX_COMPANIES,
      20,
      1,
      40
    );
    const concurrency = clampInteger(
      options.concurrency ?? process.env.PERSON_NETWORK_CONCURRENCY,
      3,
      1,
      5
    );
    const cacheKey = `${this.baseUrl}|${rootCnpj}|${maxPeople}|${maxCompanies}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return { ...cached.value, cached: true };
    }

    let rootRows;
    try {
      rootRows = await this.fetchNode(rootCnpj);
    } catch (error) {
      return {
        ok: false,
        status: 503,
        provider: 'Minha Receita — grafo societário (dados RFB)',
        rootCnpj,
        people: [],
        memberships: [],
        companies: [],
        failures: 1,
        consultaParcial: true,
        erro: error.message,
        consultadoEm: new Date().toISOString(),
      };
    }

    const peopleById = new Map();
    rootRows
      .filter((row) => row.companyCnpj === rootCnpj)
      .forEach((row) => {
        if (!peopleById.has(row.personId)) {
          peopleById.set(row.personId, {
            id: row.personId,
            name: row.personName,
            maskedCpf: row.maskedCpf,
          });
        }
      });

    const allPeople = [...peopleById.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const people = allPeople.slice(0, maxPeople);
    const expansions = await mapWithConcurrency(people, concurrency, async (person) => {
      try {
        return { person, rows: await this.fetchNode(person.id), error: null };
      } catch (error) {
        return { person, rows: [], error: error.message };
      }
    });

    const companiesByCnpj = new Map();
    const membershipsByKey = new Map();
    let failures = 0;
    let companiesTruncated = false;

    for (const expansion of expansions) {
      if (expansion.error) failures += 1;
      const rows = expansion.rows.length > 0
        ? expansion.rows.filter((row) => row.personId === expansion.person.id)
        : rootRows.filter((row) => row.personId === expansion.person.id);

      for (const row of rows) {
        const isRootCompany = row.companyCnpj === rootCnpj;
        if (!isRootCompany && !companiesByCnpj.has(row.companyCnpj)) {
          if (companiesByCnpj.size >= maxCompanies) {
            companiesTruncated = true;
            continue;
          }
          companiesByCnpj.set(row.companyCnpj, {
            cnpj: row.companyCnpj,
            name: row.companyName,
            depth: 2,
          });
        }

        if (!isRootCompany && !companiesByCnpj.has(row.companyCnpj)) continue;
        const membershipKey = `${row.personId}:${row.companyCnpj}`;
        membershipsByKey.set(membershipKey, {
          personId: row.personId,
          personName: row.personName,
          maskedCpf: row.maskedCpf,
          companyCnpj: row.companyCnpj,
          companyName: row.companyName,
          isRootCompany,
          depth: isRootCompany ? 1 : 2,
          confidence: row.maskedCpf ? 85 : 70,
          matchBasis: row.maskedCpf ? 'EXACT_NAME_AND_MASKED_CPF_HASH' : 'EXACT_NAME_HASH',
          sourceUrl: `${this.baseUrl}/${encodeURIComponent(row.personId)}`,
        });
      }
    }

    const memberships = [...membershipsByKey.values()];
    const companies = [...companiesByCnpj.values()];
    const consultaParcial = failures > 0 || allPeople.length > people.length || companiesTruncated;
    const value = {
      ok: true,
      status: 200,
      provider: 'Minha Receita — grafo societário (dados RFB)',
      rootCnpj,
      people,
      peopleFound: allPeople.length,
      peopleExpanded: people.length - failures,
      peopleTruncated: allPeople.length > people.length,
      memberships,
      companies,
      relatedCompanies: companies.length,
      failures,
      consultaParcial,
      aviso: consultaParcial
        ? 'Expansão limitada ou parcialmente indisponível; os vínculos exibidos mantêm a proveniência disponível.'
        : undefined,
      consultadoEm: new Date().toISOString(),
    };

    responseCache.set(cacheKey, { cachedAt: Date.now(), value });
    if (responseCache.size > MAX_CACHE_ENTRIES) {
      responseCache.delete(responseCache.keys().next().value);
    }
    return value;
  }
}

module.exports = {
  PersonCorporateNetworkService,
  cleanMaskedCpf,
  normalizeGraphRow,
};
