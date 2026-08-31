// ==========================================================
// DILIGÊNCIA 360 — Mídia e ocorrências públicas
// Busca multi-fonte da empresa e, separadamente, das pessoas do QSA.
// Menção nominal é hipótese investigativa; notícia neutra não eleva risco.
// ==========================================================

const crypto = require('crypto');
const { CompositeSearchProvider } = require('./search/composite-search.provider');

const QUERY_PLAN_VERSION = 'adverse-media-v5';
const SEARCH_DICTIONARY = {
  integrity: [
    'corrupção', 'fraude', 'suborno', 'improbidade', 'propina', 'desvio',
    'lavagem de dinheiro', 'licitação fraudulenta', 'cartel', 'conluio',
  ],
  criminal: [
    'investigação', 'investigado', 'operação', 'denúncia', 'denunciado',
    'condenação', 'condenado', 'ação penal', 'polícia federal', 'mandado',
    'prisão', 'organização criminosa',
  ],
  judicial: [
    'ação civil pública', 'processo', 'execução fiscal', 'falência',
    'recuperação judicial', 'multa', 'indisponibilidade de bens',
  ],
  environmental: [
    'crime ambiental', 'dano ambiental', 'multa ambiental', 'ibama',
    'desmatamento', 'poluição', 'embargo ambiental',
  ],
  labor: [
    'trabalho escravo', 'trabalho infantil', 'ação trabalhista', 'mpt',
    'fiscalização do trabalho', 'lista suja',
  ],
};

function envInt(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MAX_COMPANY_QUERIES = Math.max(3, envInt('ADVERSE_MEDIA_MAX_QUERIES', 6));
const MAX_PERSON_SUBJECTS = envInt('ADVERSE_MEDIA_MAX_PERSON_SUBJECTS', 20);
const MAX_PERSON_QUERIES = envInt('ADVERSE_MEDIA_MAX_PERSON_QUERIES', MAX_PERSON_SUBJECTS * 3);
const SEARCH_CONCURRENCY = Math.max(1, Math.min(envInt('ADVERSE_MEDIA_CONCURRENCY', 4), 6));
const RESULTS_PER_QUERY = Math.max(10, Math.min(envInt('ADVERSE_MEDIA_RESULTS_PER_QUERY', 25), 50));
const GLOBAL_DEADLINE_MS = Math.max(15_000, Math.min(envInt('ADVERSE_MEDIA_DEADLINE_MS', 50_000), 65_000));
const QUERY_TIMEOUT_MS = Math.max(4_000, Math.min(envInt('ADVERSE_MEDIA_QUERY_TIMEOUT_MS', 9_000), 15_000));
const MAX_TOTAL_RESULTS = Math.max(50, Math.min(envInt('ADVERSE_MEDIA_MAX_RESULTS', 250), 500));
const CACHE_TTL_MS = 10 * 60 * 1000;
const PARTIAL_CACHE_TTL_MS = 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 2 * 60 * 1000;
const memoryCache = new Map();

const TRACKING_PARAMS = new Set([
  'gclid', 'fbclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid',
  'igshid', 'ref', 'ref_src', 'source', 'campaign',
]);
const PERSON_STOP_WORDS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(normalizedHaystack, value) {
  const needle = normalizeText(value);
  return Boolean(needle && (' ' + normalizedHaystack + ' ').includes(' ' + needle + ' '));
}

function significantTokens(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !PERSON_STOP_WORDS.has(token));
}

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || '').trim());
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const name of [...url.searchParams.keys()]) {
      const lowerName = name.toLowerCase();
      if (lowerName.startsWith('utm_') || TRACKING_PARAMS.has(lowerName)) {
        url.searchParams.delete(name);
      }
    }
    const params = [...url.searchParams.entries()]
      .sort(([left], [right]) => left.localeCompare(right));
    url.search = '';
    for (const [name, value] of params) url.searchParams.append(name, value);
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(rawUrl || '').trim();
  }
}

function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function quoteSearchTerm(value) {
  const cleaned = String(value || '')
    .replace(/["“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return cleaned ? '"' + cleaned + '"' : '';
}

function formatCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return '';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function visibleMaskedCpfDigits(value) {
  const raw = String(value || '');
  const digits = raw.replace(/\D/g, '');
  return raw.includes('*') && digits.length >= 5 && digits.length <= 9 ? digits : '';
}

function sanitizePersonDocument(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.includes('*') && digits.length <= 9) return '***' + digits.slice(-6) + '**';
  if (digits.length === 11) return '***' + digits.slice(3, 9) + '**';
  return null;
}

function isNaturalPerson(shareholder) {
  const name = normalizeText(shareholder?.nome_socio || shareholder?.name);
  const identifier = String(shareholder?.identificador_de_socio || shareholder?.partnerType || '');
  const document = String(shareholder?.cnpj_cpf_do_socio || shareholder?.cpfCnpj || '');
  const digits = document.replace(/\D/g, '');
  if (identifier === '1') return false;
  if (identifier === '2') return Boolean(name);
  if (!name || name.split(' ').length < 2) return false;
  if (digits.length === 14 && !document.includes('*')) return false;
  return !/\b(ltda|limitada|s a|sa|sociedade|companhia|empresa|holding|participacoes|eireli|fundo|banco)\b/.test(name);
}

function subjectKey(subject) {
  return subject.subjectType + ':' + normalizeText(subject.subjectName);
}

function mergeSubjects(existing = [], incoming = []) {
  const merged = new Map(existing.map((subject) => [subjectKey(subject), subject]));
  for (const subject of incoming) {
    if (!subject?.subjectName) continue;
    const key = subjectKey(subject);
    const current = merged.get(key);
    merged.set(key, current ? {
      ...current,
      ...subject,
      matchBasis: unique([...(current.matchBasis || []), ...(subject.matchBasis || [])]),
      confidence: Math.max(Number(current.confidence || 0), Number(subject.confidence || 0)),
    } : subject);
  }
  return [...merged.values()];
}

function detectCoMentionedSubjects(company, people, itemText) {
  const textNorm = normalizeText(itemText);
  const textDigits = String(itemText || '').replace(/\D/g, '');
  const subjects = [];
  const corporateName = normalizeText(company?.razaoSocial);
  const tradeName = normalizeText(company?.nomeFantasia);
  const cnpj = String(company?.cnpj || '').replace(/\D/g, '');
  const corporateNameMatch = corporateName.length >= 5 && containsPhrase(textNorm, corporateName);
  const tradeNameMatch = tradeName.length >= 4 && containsPhrase(textNorm, tradeName);
  const cnpjMatch = cnpj.length === 14 && textDigits.includes(cnpj);

  if (corporateNameMatch || tradeNameMatch || cnpjMatch) {
    const matchBasis = [];
    if (corporateNameMatch) matchBasis.push('CORPORATE_NAME');
    if (tradeNameMatch) matchBasis.push('TRADE_NAME');
    if (cnpjMatch) matchBasis.push('CNPJ');
    subjects.push({
      subjectType: 'company',
      subjectName: company.razaoSocial || company.nomeFantasia || cnpj,
      subjectDocument: cnpj || null,
      matchBasis,
      confidence: cnpjMatch || corporateNameMatch ? 90 : 75,
    });
  }

  const companyMentioned = subjects.length > 0;
  for (const person of Array.isArray(people) ? people : []) {
    const name = String(person?.nome_socio || person?.name || '').replace(/\s+/g, ' ').trim();
    if (!name || significantTokens(name).length < 2 || !containsPhrase(textNorm, name)) continue;
    const cpfDigits = visibleMaskedCpfDigits(person?.cnpj_cpf_do_socio || person?.cpfCnpj);
    const maskedCpfMatch = Boolean(cpfDigits && textDigits.includes(cpfDigits));
    subjects.push({
      subjectType: 'person',
      subjectName: name,
      subjectDocument: sanitizePersonDocument(person?.cnpj_cpf_do_socio || person?.cpfCnpj),
      matchBasis: maskedCpfMatch ? ['EXACT_NAME', 'MASKED_CPF'] : ['EXACT_NAME'],
      confidence: maskedCpfMatch ? 90 : companyMentioned ? 80 : 65,
    });
  }

  return mergeSubjects([], subjects);
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

async function withTimeout(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve({
          ok: false,
          status: 504,
          erro: 'Tempo limite da consulta ao provedor excedido.',
          results: [],
          partial: true,
        }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function strengthScore(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function publishedDay(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

class AdverseMediaService {
  constructor(provider = new CompositeSearchProvider({ persistentUse: true })) {
    this.provider = provider;
  }

  isConfigured() {
    return Boolean(this.provider?.isConfigured?.());
  }

  generateCompanyQueryDescriptors(company) {
    const razao = String(company?.razaoSocial || '').trim();
    const fantasia = String(company?.nomeFantasia || '').trim();
    const cnpj = String(company?.cnpj || '').replace(/\D/g, '');
    const formattedCnpj = formatCnpj(cnpj);
    const razaoQuoted = quoteSearchTerm(razao);
    const fantasiaQuoted = quoteSearchTerm(fantasia);
    const simplifiedName = razao
      .replace(/\b(LTDA|LIMITADA|EIRELI|S\.?\s*A\.?|SOCIEDADE ANONIMA|ME|EPP)\b\.?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const simplifiedQuoted = quoteSearchTerm(simplifiedName);
    const candidates = [];
    const add = (query, purpose, channel, priority) => {
      if (query) candidates.push({ query: query.slice(0, 390), purpose, channel, priority });
    };

    if (formattedCnpj) {
      add('(' + quoteSearchTerm(formattedCnpj) + ' OR ' + quoteSearchTerm(cnpj) + ')', 'identifier', 'news', 0);
    }
    add(razaoQuoted, 'general_mention', 'news', 1);
    if (razaoQuoted) {
      add(
        razaoQuoted + ' (fraude OR corrupção OR investigação OR denúncia OR condenação OR improbidade OR "lavagem de dinheiro")',
        'adverse_discovery',
        'news',
        2,
      );
    }
    if (fantasiaQuoted && normalizeText(fantasia) !== normalizeText(razao)) {
      add(fantasiaQuoted, 'general_mention', 'news', 3);
    }
    if (simplifiedQuoted && normalizeText(simplifiedName) !== normalizeText(razao) && normalizeText(simplifiedName).length >= 5) {
      add(simplifiedQuoted, 'general_mention', 'news', 4);
    }
    if (fantasiaQuoted && normalizeText(fantasia) !== normalizeText(razao)) {
      add(
        fantasiaQuoted + ' (fraude OR corrupção OR investigação OR denúncia OR sanção OR "crime ambiental")',
        'adverse_discovery',
        'news',
        5,
      );
    }
    if (razaoQuoted) {
      add(
        razaoQuoted + ' ("ação civil pública" OR "execução fiscal" OR falência OR "recuperação judicial" OR "trabalho escravo" OR IBAMA)',
        'adverse_discovery',
        'news',
        6,
      );
    }

    const seen = new Set();
    return candidates
      .filter((descriptor) => {
        const key = normalizeText(descriptor.query);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_COMPANY_QUERIES);
  }

  generateQueries(company) {
    return this.generateCompanyQueryDescriptors(company).map((descriptor) => descriptor.query);
  }

  generatePersonQueryDescriptors(person, company) {
    const name = String(person?.nome_socio || person?.name || '')
      .replace(/["“”]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) return [];
    const nameQuoted = quoteSearchTerm(name);
    const companyName = String(company?.nomeFantasia || company?.razaoSocial || '').trim();
    const companyQuoted = quoteSearchTerm(companyName);
    const descriptors = [
      { query: nameQuoted, purpose: 'general_mention', channel: 'news', priority: 10 },
    ];
    if (companyQuoted && normalizeText(companyName) !== normalizeText(name)) {
      descriptors.push({
        query: nameQuoted + ' ' + companyQuoted,
        purpose: 'person_context',
        channel: 'news',
        priority: 20,
      });
    }
    descriptors.push({
      query: nameQuoted + ' (investigação OR denúncia OR condenação OR corrupção OR fraude OR improbidade OR "lavagem de dinheiro" OR prisão)',
      purpose: 'adverse_discovery',
      channel: 'news',
      priority: 30,
    });
    return descriptors;
  }

  generatePersonQueries(person, company = {}) {
    return this.generatePersonQueryDescriptors(person, company).map((descriptor) => descriptor.query);
  }

  buildQueryPlan(company, shareholders = []) {
    const companySubjectName = company.razaoSocial || company.nomeFantasia || company.cnpj;
    const companyPlan = this.generateCompanyQueryDescriptors(company).map((descriptor) => ({
      ...descriptor,
      subjectType: 'company',
      subjectName: companySubjectName,
      subjectQualification: null,
      subjectDocument: String(company.cnpj || '').replace(/\D/g, '') || null,
      questionnaireRefs: ['4.4', '9.2'],
    }));

    const seenPeople = new Set();
    const naturalPeople = [];
    for (const shareholder of Array.isArray(shareholders) ? shareholders : []) {
      if (!isNaturalPerson(shareholder)) continue;
      const name = String(shareholder.nome_socio || shareholder.name || '').replace(/\s+/g, ' ').trim();
      const normalizedName = normalizeText(name);
      if (!normalizedName || seenPeople.has(normalizedName)) continue;
      seenPeople.add(normalizedName);
      naturalPeople.push({
        nome_socio: name,
        qualificacao_socio: shareholder.qualificacao_socio || shareholder.qualification || null,
        cnpj_cpf_do_socio: sanitizePersonDocument(shareholder.cnpj_cpf_do_socio || shareholder.cpfCnpj),
      });
    }

    const people = naturalPeople.slice(0, MAX_PERSON_SUBJECTS);
    const descriptorSets = people.map((person) => this.generatePersonQueryDescriptors(person, company));
    const personPlan = [];
    const maxRounds = Math.max(0, ...descriptorSets.map((descriptors) => descriptors.length));
    for (let round = 0; round < maxRounds && personPlan.length < MAX_PERSON_QUERIES; round += 1) {
      for (let index = 0; index < people.length && personPlan.length < MAX_PERSON_QUERIES; index += 1) {
        const descriptor = descriptorSets[index][round];
        if (!descriptor) continue;
        const person = people[index];
        personPlan.push({
          ...descriptor,
          subjectType: 'person',
          subjectName: person.nome_socio,
          subjectQualification: person.qualificacao_socio,
          subjectDocument: person.cnpj_cpf_do_socio,
          questionnaireRefs: ['5.2'],
        });
      }
    }

    const expectedPersonQueries = descriptorSets.reduce((total, descriptors) => total + descriptors.length, 0);
    const coveredPeople = new Set(personPlan.map((descriptor) => normalizeText(descriptor.subjectName)));
    return {
      version: QUERY_PLAN_VERSION,
      queries: [...companyPlan, ...personPlan],
      people,
      peopleRequested: naturalPeople.length,
      peopleTruncated: naturalPeople.length > people.length || coveredPeople.size < people.length,
      expansionQueriesSkipped: Math.max(0, expectedPersonQueries - personPlan.length),
      plannedCompanyQueries: companyPlan.length,
      plannedPersonQueries: expectedPersonQueries,
      scheduledPersonQueries: personPlan.length,
    };
  }

  evaluateCorrelation(company, itemText) {
    const textNorm = normalizeText(itemText);
    const textDigits = String(itemText || '').replace(/\D/g, '');
    const razaoNorm = normalizeText(company.razaoSocial);
    const fantasiaNorm = normalizeText(company.nomeFantasia);
    const cnpjClean = String(company.cnpj || '').replace(/\D/g, '');
    const companyTokens = significantTokens(company.razaoSocial);
    const tokensMatched = companyTokens.filter((token) => containsPhrase(textNorm, token)).length;
    const tokenCoverage = companyTokens.length ? tokensMatched / companyTokens.length : 0;
    const hasCnpj = Boolean(cnpjClean.length === 14 && textDigits.includes(cnpjClean));
    const hasCorporateName = Boolean(razaoNorm.length >= 5 && containsPhrase(textNorm, razaoNorm));
    const hasTradeName = Boolean(fantasiaNorm.length >= 4 && containsPhrase(textNorm, fantasiaNorm));
    let matchStrength = 'low';
    if (hasCnpj || hasCorporateName) matchStrength = 'high';
    else if (hasTradeName || (companyTokens.length >= 2 && tokenCoverage >= 0.75)) matchStrength = 'medium';
    return {
      matchStrength,
      companyMatch: {
        corporateName: hasCorporateName,
        tradeName: hasTradeName,
        cnpj: hasCnpj,
      },
      companyNameTokenCoverage: Math.round(tokenCoverage * 100),
    };
  }

  evaluatePersonCorrelation(person, company, itemText) {
    const textNorm = normalizeText(itemText);
    const textDigits = String(itemText || '').replace(/\D/g, '');
    const personName = normalizeText(person.subjectName);
    const tokens = significantTokens(personName);
    const tokensMatched = tokens.filter((token) => containsPhrase(textNorm, token)).length;
    const tokenCoverage = tokens.length > 0 ? Math.round((tokensMatched / tokens.length) * 100) : 0;
    const fullName = Boolean(personName && containsPhrase(textNorm, personName));
    const cpfDigits = visibleMaskedCpfDigits(person.subjectDocument);
    const maskedCpf = Boolean(fullName && cpfDigits && textDigits.includes(cpfDigits));
    const companyCorrelation = this.evaluateCorrelation(company, itemText);
    const companyContext = Object.values(companyCorrelation.companyMatch).some(Boolean);
    let matchStrength = 'low';
    if (fullName && (maskedCpf || companyContext)) matchStrength = 'high';
    else if (fullName || (tokens.length >= 2 && tokenCoverage === 100)) matchStrength = 'medium';
    return {
      matchStrength,
      companyMatch: companyCorrelation.companyMatch,
      personMatch: { fullName, maskedCpf, companyContext, nameTokenCoverage: tokenCoverage },
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
        if (!containsPhrase(textNorm, term)) continue;
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        categoryMatched = true;
      }
      if (categoryMatched) categories.push(category);
    }
    return { matchedTerms, categories };
  }

  async searchAdverseMedia(company, shareholders = [], options = {}) {
    if (!company || (!company.razaoSocial && !company.cnpj)) {
      return { ok: false, status: 400, erro: 'Dados da empresa insuficientes para busca.', results: [] };
    }

    const queryPlan = this.buildQueryPlan(company, shareholders);
    const cnpjClean = String(company.cnpj || '').replace(/\D/g, '');
    const subjectsKey = queryPlan.people
      .map((person) => normalizeText(person.nome_socio) + ':' + (person.cnpj_cpf_do_socio || ''))
      .join('|');
    const cacheKey = stableId(
      QUERY_PLAN_VERSION,
      cnpjClean,
      normalizeText(company.razaoSocial),
      normalizeText(company.nomeFantasia),
      subjectsKey,
      MAX_COMPANY_QUERIES,
      MAX_PERSON_QUERIES,
      RESULTS_PER_QUERY,
    );
    const now = Date.now();

    for (const [key, entry] of memoryCache) {
      if (now - entry.timestamp >= entry.ttlMs) memoryCache.delete(key);
    }
    const cached = memoryCache.get(cacheKey);
    if (!options.forceRefresh && cached && now - cached.timestamp < cached.ttlMs) {
      return { ...cached.data, cached: true };
    }

    if (!this.isConfigured()) {
      return {
        ok: false,
        semChave: true,
        aviso: 'Integração de pesquisa pública não configurada no servidor.',
        totalFound: 0,
        candidatesCount: 0,
        riskRelevantCount: 0,
        generalMentionsCount: 0,
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
        queryPlanVersion: QUERY_PLAN_VERSION,
        consultadoEm: new Date().toISOString(),
      };
    }

    const deadlineAt = Date.now() + GLOBAL_DEADLINE_MS;
    let deadlineExceeded = false;
    const queryResponses = await mapWithConcurrency(
      queryPlan.queries,
      SEARCH_CONCURRENCY,
      async (descriptor) => {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs < 500) {
          deadlineExceeded = true;
          return {
            descriptor,
            response: {
              ok: false,
              status: 504,
              erro: 'Consulta não iniciada por limite global de tempo.',
              results: [],
              partial: true,
            },
          };
        }
        try {
          const response = await withTimeout(
            this.provider.searchWeb({
              query: descriptor.query,
              count: RESULTS_PER_QUERY,
              channel: descriptor.channel,
              purpose: descriptor.purpose,
              priority: descriptor.priority,
              timeoutMs: Math.min(QUERY_TIMEOUT_MS, remainingMs),
            }),
            Math.min(QUERY_TIMEOUT_MS + 500, remainingMs),
          );
          return { descriptor, response };
        } catch (error) {
          return {
            descriptor,
            response: { ok: false, status: 502, erro: error.message, results: [], partial: true },
          };
        }
      },
    );

    const documents = new Map();
    const fingerprintIndex = new Map();
    const executedQueries = [];
    const providers = [];

    queryResponses.forEach(({ descriptor, response }, queryIndex) => {
      const responseSources = unique([
        ...(Array.isArray(response?.providerSources) ? response.providerSources : []),
        response?.provider,
      ]);
      providers.push(...responseSources);
      executedQueries.push({
        query: descriptor.query,
        purpose: descriptor.purpose,
        channel: descriptor.channel,
        subjectType: descriptor.subjectType,
        subjectName: descriptor.subjectName,
        ok: Boolean(response?.ok),
        partial: Boolean(response?.partial),
        status: response?.status,
        count: response?.results?.length || 0,
        provider: responseSources.join(' + ') || response?.provider,
        providerSources: responseSources,
        attempts: response?.attempts,
        erro: response?.erro,
      });
      if (!response?.ok || !Array.isArray(response.results)) return;

      for (const item of response.results) {
        const canonicalUrl = normalizeUrl(item.url);
        const titleNorm = normalizeText(item.title);
        if (!canonicalUrl && !titleNorm) continue;
        const urlKey = canonicalUrl ? 'url:' + canonicalUrl : '';
        const titleFingerprint = titleNorm.length >= 16
          ? 'title:' + titleNorm + ':' + publishedDay(item.publishedAt)
          : '';
        const documentKey = (urlKey && documents.has(urlKey))
          ? urlKey
          : (titleFingerprint && fingerprintIndex.get(titleFingerprint)) || urlKey || titleFingerprint;
        if (!documentKey) continue;

        const fullContent = [
          item.title || '',
          item.snippet || '',
          ...(Array.isArray(item.extraSnippets) ? item.extraSnippets : []),
        ].join(' ');
        const correlation = descriptor.subjectType === 'person'
          ? this.evaluatePersonCorrelation(descriptor, company, fullContent)
          : this.evaluateCorrelation(company, fullContent);
        if (descriptor.subjectType === 'person' && correlation.matchStrength === 'low') continue;
        const { matchedTerms, categories } = this.classifyTerms(fullContent);
        const riskRelevant = matchedTerms.length > 0
          && correlation.matchStrength !== 'low'
          && (descriptor.subjectType !== 'person'
            || (correlation.personMatch?.fullName && correlation.identityStatus !== 'unverified'));
        const matchBasis = descriptor.subjectType === 'person'
          ? [
              ...(correlation.personMatch?.fullName ? ['EXACT_NAME'] : []),
              ...(correlation.personMatch?.maskedCpf ? ['MASKED_CPF'] : []),
              ...(correlation.personMatch?.companyContext ? ['COMPANY_CONTEXT'] : []),
            ]
          : [
              ...(correlation.companyMatch?.corporateName ? ['CORPORATE_NAME'] : []),
              ...(correlation.companyMatch?.tradeName ? ['TRADE_NAME'] : []),
              ...(correlation.companyMatch?.cnpj ? ['CNPJ'] : []),
            ];
        const subject = {
          subjectType: descriptor.subjectType,
          subjectName: descriptor.subjectName,
          subjectQualification: descriptor.subjectQualification || undefined,
          subjectDocument: descriptor.subjectType === 'person'
            ? sanitizePersonDocument(descriptor.subjectDocument)
            : descriptor.subjectDocument || undefined,
          matchStrength: correlation.matchStrength,
          identityStatus: descriptor.subjectType === 'person'
            ? correlation.identityStatus
            : 'documented-entity',
          matchBasis,
          confidence: correlation.matchStrength === 'high' ? 85 : correlation.matchStrength === 'medium' ? 65 : 40,
        };
        const itemSources = unique([
          ...(Array.isArray(item.providerSources) ? item.providerSources : []),
          ...responseSources,
          item.provider,
        ]);
        const coMentionedSubjects = detectCoMentionedSubjects(company, queryPlan.people, fullContent);
        const relatedSubjects = mergeSubjects([subject], coMentionedSubjects.map((coMentioned) => ({
          ...coMentioned,
          subjectQualification: coMentioned.subjectType === 'person'
            ? queryPlan.people.find((person) => normalizeText(person.nome_socio) === normalizeText(coMentioned.subjectName))?.qualificacao_socio
            : undefined,
          matchStrength: coMentioned.confidence >= 85 ? 'high' : 'medium',
          identityStatus: coMentioned.subjectType === 'person'
            ? (coMentioned.matchBasis.includes('MASKED_CPF') ? 'supported' : 'contextual')
            : 'documented-entity',
        })));
        const current = documents.get(documentKey);

        if (current) {
          current.queriesMatched = unique([...current.queriesMatched, descriptor.query]);
          current.queryPurposes = unique([...current.queryPurposes, descriptor.purpose]);
          current.providerSources = unique([...current.providerSources, ...itemSources]);
          current.matchedTerms = unique([...current.matchedTerms, ...matchedTerms]);
          current.categories = unique([...current.categories, ...categories]);
          current.relatedSubjects = mergeSubjects(current.relatedSubjects, relatedSubjects);
          current.coMentionedSubjects = mergeSubjects(current.coMentionedSubjects, coMentionedSubjects);
          current.riskRelevant = current.riskRelevant || riskRelevant;
          if (String(item.snippet || '').length > String(current.snippet || '').length) {
            current.snippet = item.snippet;
          }
          if (strengthScore(correlation.matchStrength) > strengthScore(current.matchStrength)) {
            current.matchStrength = correlation.matchStrength;
            current.companyMatch = correlation.companyMatch;
            current.personMatch = correlation.personMatch;
            current.subjectType = descriptor.subjectType;
            current.subjectName = descriptor.subjectName;
            current.subjectQualification = descriptor.subjectQualification || undefined;
            current.subjectDocument = descriptor.subjectType === 'person'
              ? sanitizePersonDocument(descriptor.subjectDocument) || undefined
              : undefined;
            current.identityStatus = descriptor.subjectType === 'person'
              ? correlation.identityStatus
              : 'documented-entity';
            current.questionnaireRefs = descriptor.questionnaireRefs;
          }
          continue;
        }

        const document = {
          id: stableId('media-document', canonicalUrl || titleFingerprint),
          title: item.title || 'Sem título',
          url: item.url || canonicalUrl,
          canonicalUrl: canonicalUrl || undefined,
          domain: item.domain || '',
          publishedAt: item.publishedAt,
          snippet: item.snippet || '',
          queriesMatched: [descriptor.query],
          queryPurposes: [descriptor.purpose],
          providerSources: itemSources,
          matchedTerms,
          categories,
          riskRelevant,
          matchStrength: correlation.matchStrength,
          companyMatch: correlation.companyMatch,
          personMatch: correlation.personMatch,
          subjectType: descriptor.subjectType,
          subjectName: descriptor.subjectName,
          subjectQualification: descriptor.subjectQualification || undefined,
          subjectDocument: descriptor.subjectType === 'person'
            ? sanitizePersonDocument(descriptor.subjectDocument) || undefined
            : undefined,
          relatedSubjects,
          questionnaireRefs: descriptor.questionnaireRefs,
          identityStatus: descriptor.subjectType === 'person'
            ? correlation.identityStatus
            : 'documented-entity',
          coMentionedSubjects,
          requiresHumanReview: true,
          status: 'candidate',
          searchedAt: new Date().toISOString(),
          firstQueryIndex: queryIndex,
        };
        documents.set(documentKey, document);
        if (titleFingerprint) fingerprintIndex.set(titleFingerprint, documentKey);
      }
    });

    const results = Array.from(documents.values())
      .sort((left, right) => {
        const riskOrder = Number(right.riskRelevant) - Number(left.riskRelevant);
        if (riskOrder) return riskOrder;
        const strengthOrder = strengthScore(right.matchStrength) - strengthScore(left.matchStrength);
        if (strengthOrder) return strengthOrder;
        const dateOrder = (Date.parse(right.publishedAt || '') || 0) - (Date.parse(left.publishedAt || '') || 0);
        return dateOrder || left.firstQueryIndex - right.firstQueryIndex;
      })
      .slice(0, MAX_TOTAL_RESULTS)
      .map(({ firstQueryIndex: _firstQueryIndex, ...item }) => item);
    const associatedWith = (result, type) => (result.relatedSubjects || [])
      .some((subject) => subject.subjectType === type);
    const companyResults = results.filter((result) => associatedWith(result, 'company'));
    const personResults = results.filter((result) => associatedWith(result, 'person'));
    const peopleWithRiskRelevant = new Set(
      results
        .filter((result) => result.riskRelevant)
        .flatMap((result) => result.relatedSubjects || [])
        .filter((subject) => subject.subjectType === 'person')
        .map((subject) => normalizeText(subject.subjectName))
        .filter(Boolean),
    ).size;
    const successfulQueries = executedQueries.filter((query) => query.ok).length;
    const successfulPersonQueries = executedQueries
      .filter((query) => query.subjectType === 'person' && query.ok).length;
    const scheduledPersonQueries = executedQueries
      .filter((query) => query.subjectType === 'person').length;
    const providerPartial = executedQueries.some((query) => query.partial);
    const personPlanIncomplete = queryPlan.peopleTruncated || queryPlan.expansionQueriesSkipped > 0;
    const consultaParcial = personPlanIncomplete
      || deadlineExceeded
      || providerPartial
      || successfulQueries < executedQueries.length;

    const subjects = queryPlan.people.map((person) => {
      const normalizedName = normalizeText(person.nome_socio);
      const subjectQueries = executedQueries.filter((query) => (
        query.subjectType === 'person' && normalizeText(query.subjectName) === normalizedName
      ));
      const subjectResults = personResults.filter((result) => (result.relatedSubjects || [])
        .some((subject) => subject.subjectType === 'person' && normalizeText(subject.subjectName) === normalizedName));
      return {
        name: person.nome_socio,
        qualification: person.qualificacao_socio || undefined,
        searched: subjectQueries.some((query) => query.ok),
        queryCount: subjectQueries.length,
        candidatesCount: subjectResults.length,
        strongMatches: subjectResults.filter((result) => result.matchStrength === 'high').length,
        exactNameCandidates: subjectResults.filter((result) => (result.relatedSubjects || [])
          .some((subject) => (
            normalizeText(subject.subjectName) === normalizedName
            && (subject.matchBasis || []).includes('EXACT_NAME')
          ))).length,
      };
    });

    const allFailed = successfulQueries === 0 && queryPlan.queries.length > 0;
    const payload = {
      ok: !allFailed,
      status: allFailed ? 502 : 200,
      provider: unique(providers).join(' + ') || 'Pesquisa pública multi-fonte',
      providerSources: unique(providers),
      totalFound: results.length,
      candidatesCount: results.length,
      riskRelevantCount: results.filter((result) => result.riskRelevant).length,
      generalMentionsCount: results.filter((result) => !result.riskRelevant).length,
      strongMatches: results.filter((result) => result.matchStrength === 'high').length,
      mediumMatches: results.filter((result) => result.matchStrength === 'medium').length,
      weakMatches: results.filter((result) => result.matchStrength === 'low').length,
      companyResultsCount: companyResults.length,
      personResultsCount: personResults.length,
      peopleRequested: queryPlan.peopleRequested,
      peopleSearched: subjects.filter((subject) => subject.searched).length,
      peopleWithCandidates: subjects.filter((subject) => subject.candidatesCount > 0).length,
      peopleWithRiskRelevant,
      personSearchCompleted: scheduledPersonQueries > 0
        ? successfulPersonQueries === scheduledPersonQueries && !personPlanIncomplete && !deadlineExceeded
        : queryPlan.peopleRequested === 0,
      personSearchTruncated: personPlanIncomplete,
      expansionQueriesSkipped: queryPlan.expansionQueriesSkipped,
      subjects,
      results,
      queriesExecuted: executedQueries,
      queriesPlanned: queryPlan.queries.length,
      queryPlanVersion: QUERY_PLAN_VERSION,
      deadlineExceeded,
      consultaParcial,
      coverageStatus: allFailed ? 'UNAVAILABLE' : consultaParcial ? 'PARTIAL' : 'COMPLETE',
      aviso: allFailed
        ? 'As fontes de pesquisa ficaram indisponíveis para todas as consultas. O resultado não deve ser interpretado como ausência de notícias.'
        : consultaParcial
          ? 'Consulta parcial: uma fonte, pessoa, consulta ou o orçamento de tempo não foi concluído. Os itens retornados continuam disponíveis para leitura.'
          : undefined,
      erro: allFailed
        ? 'As fontes de pesquisa ficaram indisponíveis para todas as consultas executadas.'
        : undefined,
      consultadoEm: new Date().toISOString(),
    };

    if (!allFailed) {
      const ttlMs = consultaParcial
        ? PARTIAL_CACHE_TTL_MS
        : results.length === 0 ? NEGATIVE_CACHE_TTL_MS : CACHE_TTL_MS;
      memoryCache.set(cacheKey, { timestamp: now, ttlMs, data: payload });
    }
    return payload;
  }
}

module.exports = {
  AdverseMediaService,
  SEARCH_DICTIONARY,
  QUERY_PLAN_VERSION,
  detectCoMentionedSubjects,
  normalizeUrl,
  sanitizePersonDocument,
};
