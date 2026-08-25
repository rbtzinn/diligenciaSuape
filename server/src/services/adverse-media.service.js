// ==========================================================
// DILIGÊNCIA 360 — Mídia e ocorrências públicas
// Pesquisa a empresa e, separadamente, cada pessoa física do QSA.
// Resultados nominais são hipóteses investigativas, nunca imputação de crime.
// ==========================================================

const crypto = require('crypto');
const { BraveSearchProvider } = require('./search/brave-search.provider');

const SEARCH_DICTIONARY = {
  integrity: ['corrupção', 'fraude', 'suborno', 'improbidade', 'propina', 'desvio', 'lavagem de dinheiro'],
  criminal: ['investigação', 'investigado', 'operação', 'denúncia', 'denunciado', 'condenação', 'condenado', 'ação penal', 'polícia federal', 'mandado', 'prisão'],
  judicial: ['ação civil pública', 'processo', 'execução fiscal', 'falência', 'recuperação judicial', 'multa'],
  environmental: ['crime ambiental', 'dano ambiental', 'multa ambiental', 'ibama', 'desmatamento', 'poluição'],
  labor: ['trabalho escravo', 'trabalho infantil', 'ação trabalhista', 'mpt', 'fiscalização do trabalho'],
};

const MAX_COMPANY_QUERIES = parseInt(process.env.ADVERSE_MEDIA_MAX_QUERIES, 10) || 4;
const MAX_PERSON_SUBJECTS = parseInt(process.env.ADVERSE_MEDIA_MAX_PERSON_SUBJECTS, 10) || 20;
const MAX_PERSON_QUERIES = parseInt(process.env.ADVERSE_MEDIA_MAX_PERSON_QUERIES, 10) || 40;
const SEARCH_CONCURRENCY = Math.max(1, Math.min(parseInt(process.env.ADVERSE_MEDIA_CONCURRENCY, 10) || 3, 6));
const CACHE_TTL_MS = 10 * 60 * 1000;

const memoryCache = new Map();

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    return u.toString().replace(/\/$/, '');
  } catch {
    return rawUrl;
  }
}

function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function maskedDocumentDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 5 && digits.length < 14 ? digits : '';
}

function isNaturalPerson(shareholder) {
  const name = normalizeText(shareholder?.nome_socio || shareholder?.name);
  const document = String(shareholder?.cnpj_cpf_do_socio || shareholder?.cpfCnpj || '');
  const digits = document.replace(/\D/g, '');
  if (!name || name.split(' ').length < 2) return false;
  if (digits.length === 14 && !document.includes('*')) return false;
  return !/\b(ltda|limitada|s a|sa|sociedade|companhia|empresa|holding|participacoes|eireli)\b/.test(name);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

class AdverseMediaService {
  constructor(provider = new BraveSearchProvider()) {
    this.provider = provider;
  }

  isConfigured() {
    return this.provider.isConfigured();
  }

  generateQueries(company) {
    const queries = [];
    const razao = (company.razaoSocial || '').trim();
    const fantasia = (company.nomeFantasia || '').trim();
    const cnpj = String(company.cnpj || '').replace(/\D/g, '');

    if (razao) {
      queries.push(`"${razao}" (fraude OR corrupção OR suborno OR improbidade)`);
      queries.push(`"${razao}" ("ação civil pública" OR investigação OR condenação OR denúncia)`);
      queries.push(`"${razao}" ("crime ambiental" OR "trabalho escravo" OR sanção)`);
    }

    if (fantasia && fantasia.length >= 4 && fantasia.toLowerCase() !== razao.toLowerCase()) {
      queries.push(`"${fantasia}" (fraude OR corrupção OR investigação)`);
    }

    if (cnpj && cnpj.length === 14) {
      queries.push(`"${cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}"`);
    }

    return queries.slice(0, MAX_COMPANY_QUERIES);
  }

  generatePersonQueries(person) {
    const name = String(person.nome_socio || person.name || '').trim();
    if (!name) return [];

    return [
      `"${name}" ("ação penal" OR condenação OR condenado OR denúncia OR denunciado OR investigação OR investigado OR prisão)`,
      `"${name}" (corrupção OR fraude OR suborno OR improbidade OR "lavagem de dinheiro" OR "crime ambiental" OR "trabalho escravo")`,
    ];
  }

  buildQueryPlan(company, shareholders = []) {
    const companyPlan = this.generateQueries(company).map((query) => ({
      query,
      subjectType: 'company',
      subjectName: company.razaoSocial || company.nomeFantasia || company.cnpj,
      subjectQualification: null,
      subjectDocument: company.cnpj || null,
      questionnaireRefs: ['4.4', '9.2'],
    }));

    const seenPeople = new Set();
    const naturalPeople = [];
    for (const shareholder of Array.isArray(shareholders) ? shareholders : []) {
      if (!isNaturalPerson(shareholder)) continue;
      const name = String(shareholder.nome_socio || shareholder.name || '').trim();
      const normalizedName = normalizeText(name);
      if (!normalizedName || seenPeople.has(normalizedName)) continue;
      seenPeople.add(normalizedName);
      naturalPeople.push({
        nome_socio: name,
        qualificacao_socio: shareholder.qualificacao_socio || shareholder.qualification || null,
        cnpj_cpf_do_socio: shareholder.cnpj_cpf_do_socio || shareholder.cpfCnpj || null,
      });
    }

    const people = naturalPeople.slice(0, MAX_PERSON_SUBJECTS);
    const personPlan = [];
    let expectedPersonQueries = 0;
    for (const person of people) {
      const personQueries = this.generatePersonQueries(person);
      expectedPersonQueries += personQueries.length;
      for (const query of personQueries) {
        if (personPlan.length >= MAX_PERSON_QUERIES) break;
        personPlan.push({
          query,
          subjectType: 'person',
          subjectName: person.nome_socio,
          subjectQualification: person.qualificacao_socio,
          subjectDocument: person.cnpj_cpf_do_socio,
          questionnaireRefs: ['5.2'],
        });
      }
    }

    return {
      queries: [...companyPlan, ...personPlan],
      people,
      peopleRequested: naturalPeople.length,
      peopleTruncated: naturalPeople.length > people.length || personPlan.length < expectedPersonQueries,
    };
  }

  evaluateCorrelation(company, itemText) {
    const textNorm = normalizeText(itemText);
    const textDigits = String(itemText || '').replace(/\D/g, '');
    const razaoNorm = normalizeText(company.razaoSocial);
    const fantasiaNorm = normalizeText(company.nomeFantasia);
    const cnpjClean = String(company.cnpj || '').replace(/\D/g, '');

    const hasCnpj = !!(cnpjClean && cnpjClean.length === 14 && textDigits.includes(cnpjClean));
    const hasCorporateName = !!(razaoNorm && razaoNorm.length >= 5 && textNorm.includes(razaoNorm));
    const hasTradeName = !!(fantasiaNorm && fantasiaNorm.length >= 4 && textNorm.includes(fantasiaNorm));

    let matchStrength = 'low';
    if (hasCnpj || hasCorporateName) {
      matchStrength = 'high';
    } else if (hasTradeName) {
      matchStrength = 'medium';
    }

    return {
      matchStrength,
      companyMatch: {
        corporateName: hasCorporateName,
        tradeName: hasTradeName,
        cnpj: hasCnpj,
      },
    };
  }

  evaluatePersonCorrelation(person, company, itemText) {
    const textNorm = normalizeText(itemText);
    const textDigits = String(itemText || '').replace(/\D/g, '');
    const personName = normalizeText(person.subjectName);
    const significantTokens = personName.split(' ').filter((token) => token.length > 2 && !['dos', 'das', 'de'].includes(token));
    const tokensMatched = significantTokens.filter((token) => textNorm.includes(token)).length;
    const tokenCoverage = significantTokens.length > 0 ? Math.round((tokensMatched / significantTokens.length) * 100) : 0;
    const fullName = !!(personName && textNorm.includes(personName));
    const cpfDigits = maskedDocumentDigits(person.subjectDocument);
    const maskedCpf = !!(cpfDigits && textDigits.includes(cpfDigits));
    const companyCorrelation = this.evaluateCorrelation(company, itemText);
    const companyContext = Object.values(companyCorrelation.companyMatch).some(Boolean);

    let matchStrength = 'low';
    if (fullName && (maskedCpf || companyContext)) {
      matchStrength = 'high';
    } else if (fullName || tokenCoverage === 100) {
      matchStrength = 'medium';
    }

    return {
      matchStrength,
      companyMatch: companyCorrelation.companyMatch,
      personMatch: {
        fullName,
        maskedCpf,
        companyContext,
        nameTokenCoverage: tokenCoverage,
      },
      identityStatus: maskedCpf ? 'supported' : companyContext && fullName ? 'contextual' : 'unverified',
    };
  }

  classifyTerms(itemText) {
    const textNorm = normalizeText(itemText);
    const matchedTerms = [];
    const categories = [];

    for (const [category, terms] of Object.entries(SEARCH_DICTIONARY)) {
      let categoryMatched = false;
      for (const term of terms) {
        if (textNorm.includes(normalizeText(term))) {
          if (!matchedTerms.includes(term)) matchedTerms.push(term);
          categoryMatched = true;
        }
      }
      if (categoryMatched) categories.push(category);
    }

    return { matchedTerms, categories };
  }

  async searchAdverseMedia(company, shareholders = []) {
    if (!company || (!company.razaoSocial && !company.cnpj)) {
      return { ok: false, status: 400, erro: 'Dados da empresa insuficientes para busca.', results: [] };
    }

    const queryPlan = this.buildQueryPlan(company, shareholders);
    const cnpjClean = String(company.cnpj || '').replace(/\D/g, '');
    const subjectKey = queryPlan.people.map((person) => normalizeText(person.nome_socio)).join('|');
    const cacheKey = stableId(cnpjClean || normalizeText(company.razaoSocial), subjectKey, 'person-media-v2');
    const now = Date.now();

    const cached = memoryCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, cached: true };
    }

    if (!this.isConfigured()) {
      return {
        ok: false,
        semChave: true,
        aviso: 'Integração de pesquisa pública não configurada no servidor.',
        totalFound: 0,
        candidatesCount: 0,
        strongMatches: 0,
        mediumMatches: 0,
        weakMatches: 0,
        companyResultsCount: 0,
        personResultsCount: 0,
        peopleSearched: 0,
        peopleWithCandidates: 0,
        personSearchCompleted: false,
        results: [],
        subjects: [],
        queriesExecuted: [],
        consultadoEm: new Date().toISOString(),
      };
    }

    const queryResponses = await mapWithConcurrency(
      queryPlan.queries,
      SEARCH_CONCURRENCY,
      async (descriptor) => {
        try {
          const response = await this.provider.searchWeb({ query: descriptor.query, count: 10 });
          return { descriptor, response };
        } catch (error) {
          return {
            descriptor,
            response: { ok: false, status: 502, erro: error.message, results: [] },
          };
        }
      }
    );

    const deduplicatedMap = new Map();
    const executedQueries = [];
    const providers = [];

    queryResponses.forEach(({ descriptor, response }, queryIndex) => {
      executedQueries.push({
        query: descriptor.query,
        subjectType: descriptor.subjectType,
        subjectName: descriptor.subjectName,
        ok: response.ok,
        status: response.status,
        count: response.results?.length || 0,
        provider: response.provider,
        erro: response.erro,
      });
      if (response.ok && response.provider) providers.push(response.provider);
      if (!response.ok || !Array.isArray(response.results)) return;

      for (const item of response.results) {
        const normalizedUrl = normalizeUrl(item.url);
        const identity = normalizedUrl || `${item.domain}:${normalizeText(item.title)}`;
        const dedupKey = `${descriptor.subjectType}:${normalizeText(descriptor.subjectName)}:${identity}`;
        const existing = deduplicatedMap.get(dedupKey);
        if (existing) {
          if (!existing.queriesMatched.includes(descriptor.query)) existing.queriesMatched.push(descriptor.query);
          continue;
        }

        const fullContent = `${item.title || ''} ${item.snippet || ''}`;
        const correlation = descriptor.subjectType === 'person'
          ? this.evaluatePersonCorrelation(descriptor, company, fullContent)
          : this.evaluateCorrelation(company, fullContent);
        const { matchedTerms, categories } = this.classifyTerms(fullContent);

        deduplicatedMap.set(dedupKey, {
          id: stableId(descriptor.subjectType, descriptor.subjectName, identity),
          title: item.title,
          url: item.url,
          domain: item.domain,
          publishedAt: item.publishedAt,
          snippet: item.snippet,
          queriesMatched: [descriptor.query],
          matchedTerms,
          categories,
          matchStrength: correlation.matchStrength,
          companyMatch: correlation.companyMatch,
          personMatch: correlation.personMatch,
          subjectType: descriptor.subjectType,
          subjectName: descriptor.subjectName,
          subjectQualification: descriptor.subjectQualification,
          subjectDocument: descriptor.subjectType === 'person' ? descriptor.subjectDocument : undefined,
          questionnaireRefs: descriptor.questionnaireRefs,
          identityStatus: descriptor.subjectType === 'person' ? correlation.identityStatus : 'documented-entity',
          requiresHumanReview: true,
          status: 'candidate',
          searchedAt: new Date().toISOString(),
          firstQueryIndex: queryIndex,
        });
      }
    });

    const results = Array.from(deduplicatedMap.values())
      .sort((a, b) => a.firstQueryIndex - b.firstQueryIndex)
      .map(({ firstQueryIndex: _firstQueryIndex, ...item }) => item);
    const strongMatches = results.filter((result) => result.matchStrength === 'high').length;
    const mediumMatches = results.filter((result) => result.matchStrength === 'medium').length;
    const weakMatches = results.filter((result) => result.matchStrength === 'low').length;
    const companyResults = results.filter((result) => result.subjectType === 'company');
    const personResults = results.filter((result) => result.subjectType === 'person');
    const successfulQueries = executedQueries.filter((query) => query.ok).length;
    const successfulPersonQueries = executedQueries.filter((query) => query.subjectType === 'person' && query.ok).length;
    const scheduledPersonQueries = executedQueries.filter((query) => query.subjectType === 'person').length;
    const consultaParcial = successfulQueries > 0 && successfulQueries < executedQueries.length;

    const subjects = queryPlan.people.map((person) => {
      const name = person.nome_socio;
      const subjectQueries = executedQueries.filter((query) => query.subjectType === 'person' && normalizeText(query.subjectName) === normalizeText(name));
      const subjectResults = personResults.filter((result) => normalizeText(result.subjectName) === normalizeText(name));
      return {
        name,
        qualification: person.qualificacao_socio || undefined,
        searched: subjectQueries.some((query) => query.ok),
        queryCount: subjectQueries.length,
        candidatesCount: subjectResults.length,
        strongMatches: subjectResults.filter((result) => result.matchStrength === 'high').length,
        exactNameCandidates: subjectResults.filter((result) => result.personMatch?.fullName).length,
      };
    });

    const payload = {
      ok: successfulQueries > 0 || queryPlan.queries.length === 0,
      status: successfulQueries > 0 || queryPlan.queries.length === 0 ? 200 : 502,
      provider: unique(providers).join(' + ') || 'Pesquisa Web & Mídia',
      totalFound: results.length,
      candidatesCount: results.length,
      strongMatches,
      mediumMatches,
      weakMatches,
      companyResultsCount: companyResults.length,
      personResultsCount: personResults.length,
      peopleRequested: queryPlan.peopleRequested,
      peopleSearched: subjects.filter((subject) => subject.searched).length,
      peopleWithCandidates: subjects.filter((subject) => subject.candidatesCount > 0).length,
      personSearchCompleted: scheduledPersonQueries > 0 && successfulPersonQueries === scheduledPersonQueries && !queryPlan.peopleTruncated,
      personSearchTruncated: queryPlan.peopleTruncated,
      subjects,
      results,
      queriesExecuted: executedQueries,
      consultaParcial,
      aviso: successfulQueries === 0 && queryPlan.queries.length > 0
        ? 'Fonte de pesquisa indisponível para todas as consultas executadas.'
        : consultaParcial || queryPlan.peopleTruncated
          ? 'Consulta parcial: uma fonte falhou ou o limite técnico de pessoas foi atingido.'
          : undefined,
      consultadoEm: new Date().toISOString(),
    };

    memoryCache.set(cacheKey, { timestamp: now, data: payload });
    return payload;
  }
}

module.exports = { AdverseMediaService, SEARCH_DICTIONARY };
