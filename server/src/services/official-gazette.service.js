// ==========================================================
// DILIGÊNCIA 360 — Diários Oficiais (Querido Diário)
// Busca nominal da empresa e das pessoas físicas do quadro.
// Menção nominal é hipótese investigativa, nunca confirmação.
// ==========================================================

const crypto = require('crypto');
const { SOURCE_STATUS, resolveSourceStatus } = require('../domain/source-status');
const {
  MATCH_LEVEL,
  buildEntityProfile,
  resolveEntityMatch,
} = require('../entity-resolution/entity-resolution');

// O host antigo (api.queridodiario.ok.org.br) saiu do ar; queridodiario.ok.org.br/api
// responde 302 para cá. Apontar direto evita depender do redirecionamento.
const API_URL = process.env.QUERIDO_DIARIO_API_URL || 'https://api.queridodiario.org.br/gazettes';
const REQUEST_TIMEOUT_MS = 15_000;

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

const RESULTS_PER_SUBJECT = envInt('GAZETTE_RESULTS_PER_SUBJECT', 25, 5, 100);
const MAX_PEOPLE = envInt('GAZETTE_MAX_PEOPLE', 20, 0, 40);
const CONCURRENCY = envInt('GAZETTE_CONCURRENCY', 3, 1, 6);

// Orçamento global da rota. Vinte e dois sujeitos a 15 s cada, com concorrência
// 3, levam cerca de 110 s — bem além do que o cliente e a função serverless
// esperam. O prazo abaixo faz o endpoint devolver o que já concluiu em vez de
// morrer inteiro: os sujeitos não iniciados viram lacuna declarada, não erro.
const GLOBAL_DEADLINE_MS = envInt('GAZETTE_DEADLINE_MS', 40_000, 10_000, 55_000);
// Timeout por sujeito. Precisa caber dentro do prazo global com folga.
const SUBJECT_TIMEOUT_MS = envInt('GAZETTE_SUBJECT_TIMEOUT_MS', 12_000, 4_000, 20_000);

// A primeira consulta de um termo inédito é fria no servidor do Querido Diário
// e demora dezenas de segundos; as seguintes voltam em centenas de
// milissegundos, do cache deles. Medido: 35,8 s na primeira, 0,3 s nas
// seguintes. Com timeout de 12 s e uma tentativa só, todo termo novo abortava,
// e como o abort não interrompe o trabalho do servidor, a execução seguinte
// repetia a mesma consulta fria — a fonte aparecia como indisponível para
// sempre.
//
// Abortar e tentar de novo aproveita justamente esse trabalho já feito: em
// teste, a segunda tentativa devolveu o mesmo resultado que uma consulta sem
// limite de tempo, incluindo total_gazettes e a lista completa.
const SUBJECT_MAX_ATTEMPTS = envInt('GAZETTE_SUBJECT_ATTEMPTS', 3, 1, 5);
// Pausa para o servidor terminar de montar o resultado antes da nova tentativa.
const SUBJECT_RETRY_DELAY_MS = envInt('GAZETTE_RETRY_DELAY_MS', 1_500, 200, 5_000);

function pause(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
const CACHE_TTL_MS = envInt('GAZETTE_CACHE_TTL_MS', 10 * 60 * 1000, 60_000, 60 * 60 * 1000);

// Cache por consulta, não por diligência: o mesmo nome pesquisado em duas
// execuções seguidas não precisa bater na API de novo, e sujeito repetido entre
// empresa e QSA é resolvido antes de virar requisição.
const queryCache = new Map();

const PERSON_STOP_WORDS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function cleanExcerpt(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 900);
}

function significantTokens(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(' ')
    .filter((token) => token.length > 2 && !PERSON_STOP_WORDS.has(token));
}

function correlation(company, excerpts) {
  const content = normalizeText(excerpts.join(' '));
  const corporateName = normalizeText(company.razaoSocial);
  const tradeName = normalizeText(company.nomeFantasia);
  const cnpj = String(company.cnpj || '').replace(/\D/g, '');
  const contentDigits = excerpts.join(' ').replace(/\D/g, '');
  if ((cnpj.length === 14 && contentDigits.includes(cnpj)) || (corporateName.length >= 8 && content.includes(corporateName))) return 'high';
  if (tradeName.length >= 4 && content.includes(tradeName)) return 'medium';
  return 'low';
}

// Homônimo é o principal risco da busca nominal: o nome completo precisa
// aparecer inteiro e, de preferência, junto de uma âncora (empresa ou CNPJ).
function personCorrelation(person, company, excerpts) {
  const content = normalizeText(excerpts.join(' '));
  const fullName = normalizeText(person.name);
  if (!fullName || !content.includes(fullName)) return 'low';

  const anchors = [company?.razaoSocial, company?.nomeFantasia]
    .map(normalizeText)
    .filter((value) => value.length >= 5);
  const cnpjDigits = String(company?.cnpj || '').replace(/\D/g, '');
  const contentDigits = excerpts.join(' ').replace(/\D/g, '');
  const hasAnchor = anchors.some((anchor) => content.includes(anchor))
    || (cnpjDigits.length === 14 && contentDigits.includes(cnpjDigits));

  if (hasAnchor) return 'high';
  return significantTokens(person.name).length >= 3 ? 'medium' : 'low';
}

function quotedQuery(value) {
  const cleaned = String(value || '').replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? `"${cleaned}"` : '';
}

function isNaturalPerson(shareholder) {
  const document = String(shareholder?.cnpj_cpf_do_socio || shareholder?.cpfCnpj || '').replace(/\D/g, '');
  if (document.length === 14) return false;
  const type = String(shareholder?.identificador_de_socio ?? shareholder?.tipo ?? '').trim();
  if (type === '1') return false;
  const name = normalizeText(shareholder?.nome_socio || shareholder?.name || shareholder?.nome);
  if (!name) return false;
  return !/\b(LTDA|S\/?A|EIRELI|ME|EPP|SOCIEDADE|PARTICIPACOES|HOLDING|EMPREENDIMENTOS|COMERCIO|INDUSTRIA)\b/.test(name);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return output;
}

function buildResult(item, subject, strength) {
  const excerpts = (Array.isArray(item.excerpts) ? item.excerpts : []).map(cleanExcerpt).filter(Boolean);
  return {
    id: crypto
      .createHash('sha256')
      .update(`${subject.name}|${String(item.url || `${item.territory_id}:${item.date}`)}`)
      .digest('hex')
      .slice(0, 32),
    date: item.date || null,
    territoryId: item.territory_id || null,
    territoryName: item.territory_name || 'Município não informado',
    stateCode: item.state_code || null,
    edition: item.edition || null,
    url: item.url || null,
    txtUrl: item.txt_url || null,
    excerpts,
    matchStrength: strength(excerpts),
    subjectType: subject.type,
    subjectName: subject.name,
    subjectQualification: subject.qualification || null,
  };
}

async function fetchOnce({ query, territoryIds, since, timeoutMs }) {
  const url = new URL(API_URL);
  const params = new URLSearchParams({
    querystring: query,
    excerpt_size: '650',
    number_of_excerpts: '2',
    size: String(RESULTS_PER_SUBJECT),
    sort_by: 'relevance',
  });
  for (const territoryId of territoryIds) params.append('territory_ids', String(territoryId));
  if (since) params.set('published_since', since);
  url.search = params.toString();

  const cacheKey = url.toString();
  const cached = queryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  // AbortController próprio em vez de AbortSignal.timeout: o prazo global da
  // rota precisa poder encurtar o timeout do sujeito quando o tempo restante
  // for menor do que o teto configurado.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Diligencia360-SUAPE/2.0' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Querido Diário respondeu HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    queryCache.set(cacheKey, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeout = new Error('Tempo limite da consulta ao Querido Diário esgotado.');
      timeout.status = 504;
      timeout.timedOut = true;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGazettes({
  query,
  territoryIds = [],
  since,
  timeoutMs = REQUEST_TIMEOUT_MS,
  deadlineAt,
  attempts = SUBJECT_MAX_ATTEMPTS,
}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Tentativa que não cabe no orçamento da rota não recupera nada: só atrasa
    // a resposta parcial que já existe.
    const remaining = deadlineAt ? deadlineAt - Date.now() : Infinity;
    if (remaining < 1_500) break;
    try {
      return await fetchOnce({
        query,
        territoryIds,
        since,
        timeoutMs: Math.min(timeoutMs, remaining),
      });
    } catch (error) {
      lastError = error;
      // 4xx é a consulta que está errada, e repetir devolve o mesmo erro.
      if (error.status && error.status >= 400 && error.status < 500) break;
      if (attempt < attempts) await pause(SUBJECT_RETRY_DELAY_MS);
    }
  }
  throw lastError || new Error('Tempo limite da consulta ao Querido Diário esgotado.');
}

const OfficialGazetteService = {
  /**
   * Busca nominal em diários oficiais municipais.
   * @param {object} company empresa investigada
   * @param {object} options
   * @param {Array} [options.shareholders] quadro societário; pessoas físicas viram sujeitos de busca
   * @param {string[]} [options.territoryIds] códigos IBGE para restringir o alcance
   * @param {string} [options.publishedSince] data ISO (YYYY-MM-DD) inicial
   */
  async search(company, options = {}) {
    if (!company?.razaoSocial) {
      return { ok: false, status: 400, erro: 'Razão social necessária para consultar diários oficiais.', totalFound: 0, returned: 0, results: [] };
    }

    const territoryIds = Array.isArray(options.territoryIds)
      ? options.territoryIds.map((value) => String(value).replace(/\D/g, '')).filter(Boolean)
      : [];
    const publishedSince = /^\d{4}-\d{2}-\d{2}$/.test(String(options.publishedSince || ''))
      ? String(options.publishedSince)
      : undefined;

    const subjects = [{
      type: 'company',
      name: String(company.razaoSocial).trim(),
      qualification: null,
      strength: (excerpts) => correlation(company, excerpts),
    }];

    if (company.nomeFantasia && normalizeText(company.nomeFantasia) !== normalizeText(company.razaoSocial)) {
      subjects.push({
        type: 'company',
        name: String(company.nomeFantasia).trim(),
        qualification: 'Nome fantasia',
        strength: (excerpts) => correlation(company, excerpts),
      });
    }

    // O diário oficial cita a empresa pelo nome curto, não pela razão social
    // completa: "Contrato 21/2022, firmado com a SOLIMP (Motoristas)". Como a
    // consulta é por frase exata, procurar apenas
    // "SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA" não casa com nada, e o dossiê
    // conclui que não há publicação quando o contrato está publicado.
    const simplifiedName = String(company.razaoSocial)
      .replace(/\b(LTDA|LIMITADA|EIRELI|S\.?\s*A\.?|SOCIEDADE ANONIMA|ME|EPP)\b\.?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const alreadySearched = new Set(subjects.map((subject) => normalizeText(subject.name)));

    if (
      simplifiedName
      && significantTokens(simplifiedName).length >= 1
      && !alreadySearched.has(normalizeText(simplifiedName))
    ) {
      subjects.push({
        type: 'company',
        name: simplifiedName,
        qualification: 'Razão social sem o tipo societário',
        strength: (excerpts) => correlation(company, excerpts),
      });
      alreadySearched.add(normalizeText(simplifiedName));
    }

    // Última variante: o primeiro termo distintivo da razão social, que costuma
    // ser a marca usada nas publicações. Só entra quando é palavra própria, com
    // ao menos quatro letras, para não pesquisar termo genérico do ramo.
    const [firstToken] = significantTokens(simplifiedName || company.razaoSocial);
    if (firstToken && firstToken.length >= 4 && !alreadySearched.has(normalizeText(firstToken))) {
      subjects.push({
        type: 'company',
        name: firstToken.toUpperCase(),
        qualification: 'Termo distintivo da razão social',
        strength: (excerpts) => correlation(company, excerpts),
      });
    }

    const seenPeople = new Set();
    for (const shareholder of Array.isArray(options.shareholders) ? options.shareholders : []) {
      if (subjects.length >= MAX_PEOPLE + 2) break;
      if (!isNaturalPerson(shareholder)) continue;
      const name = String(shareholder.nome_socio || shareholder.name || shareholder.nome || '').replace(/\s+/g, ' ').trim();
      const key = normalizeText(name);
      // Nome com uma palavra só gera ruído puro em diário oficial.
      if (!key || seenPeople.has(key) || significantTokens(name).length < 2) continue;
      seenPeople.add(key);
      const person = { name };
      subjects.push({
        type: 'person',
        name,
        qualification: shareholder.qualificacao_socio || shareholder.qualification || null,
        strength: (excerpts) => personCorrelation(person, company, excerpts),
      });
    }

    // Deduplicação de sujeitos: razão social sem sufixo, termo distintivo e nome
    // fantasia colidem com frequência, e cada colisão era uma requisição inteira
    // gasta para trazer exatamente o mesmo resultado.
    const uniqueSubjects = [];
    const seenSubjects = new Set();
    for (const subject of subjects) {
      const key = normalizeText(subject.name);
      if (!key || seenSubjects.has(key)) continue;
      seenSubjects.add(key);
      uniqueSubjects.push(subject);
    }
    const duplicateSubjects = subjects.length - uniqueSubjects.length;

    const consultedAt = new Date().toISOString();
    const deadlineAt = Date.now() + GLOBAL_DEADLINE_MS;
    let deadlineExceeded = false;

    const attempts = await mapWithConcurrency(uniqueSubjects, CONCURRENCY, async (subject) => {
      const query = quotedQuery(subject.name);
      if (!query) {
        return { subject, ok: false, status: 400, erro: 'Nome inválido para consulta.', query, results: [], totalFound: 0 };
      }

      // Sujeito que nem chega a começar é lacuna declarada, não falha da fonte.
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs < 1_500) {
        deadlineExceeded = true;
        return {
          subject,
          ok: false,
          notStarted: true,
          status: 504,
          erro: 'Consulta não iniciada: o orçamento de tempo da rota se esgotou antes.',
          query,
          totalFound: 0,
          results: [],
        };
      }

      try {
        const payload = await fetchGazettes({
          query,
          territoryIds,
          since: publishedSince,
          timeoutMs: SUBJECT_TIMEOUT_MS,
          deadlineAt,
        });
        const gazettes = Array.isArray(payload.gazettes) ? payload.gazettes : [];
        return {
          subject,
          ok: true,
          status: 200,
          query,
          totalFound: Number(payload.total_gazettes) || gazettes.length,
          results: gazettes.map((item) => buildResult(item, subject, subject.strength)),
        };
      } catch (error) {
        if (error.timedOut) deadlineExceeded = true;
        // A falha de um sujeito nunca derruba os demais: o resultado dele vira
        // lacuna, e os que concluíram continuam valendo.
        return {
          subject,
          ok: false,
          timedOut: Boolean(error.timedOut),
          status: error.status || 503,
          erro: `Falha ao consultar Querido Diário: ${error.message}`,
          query,
          totalFound: 0,
          results: [],
        };
      }
    });

    const successful = attempts.filter((attempt) => attempt.ok);
    const failed = attempts.filter((attempt) => !attempt.ok);
    const companyQuery = attempts[0]?.query || quotedQuery(company.razaoSocial);

    const subjectReport = (attempt) => ({
      type: attempt.subject.type,
      name: attempt.subject.name,
      qualification: attempt.subject.qualification,
      ok: attempt.ok,
      notStarted: Boolean(attempt.notStarted),
      timedOut: Boolean(attempt.timedOut),
      totalFound: attempt.totalFound,
      returned: attempt.results.length,
      erro: attempt.erro,
    });
    // Três contagens distintas, porque significam coisas distintas: o que
    // concluiu, o que a fonte recusou e o que nem chegou a ser tentado.
    const completedSubjects = successful.length;
    const failedSubjects = failed.filter((attempt) => !attempt.notStarted).length;
    const unavailableSubjects = failed.filter((attempt) => attempt.notStarted).length;

    if (successful.length === 0) {
      return {
        ok: false,
        status: failed[0]?.status || 503,
        sourceStatus: SOURCE_STATUS.UNAVAILABLE,
        erro: failed[0]?.erro || 'Nenhuma consulta a diários oficiais foi concluída.',
        aviso: 'Nenhum sujeito pôde ser consultado. A lista vazia não significa ausência de publicação.',
        totalFound: 0,
        returned: 0,
        results: [],
        discardedResults: [],
        falsePositivesDiscarded: 0,
        completedSubjects,
        failedSubjects,
        unavailableSubjects,
        duplicateSubjects,
        deadlineExceeded,
        query: companyQuery,
        consultadoEm: consultedAt,
        subjects: attempts.map(subjectReport),
      };
    }

    const deduped = new Map();
    for (const attempt of successful) {
      for (const result of attempt.results) {
        const key = `${result.subjectName}|${result.url || result.id}`;
        if (!deduped.has(key)) deduped.set(key, result);
      }
    }

    // Resolução de identidade sobre os trechos publicados. O diário cita a
    // empresa pelo nome curto, e uma palavra isolada da razão social não a
    // identifica: "guerra" num decreto municipal não é GUERRA CONSTRUCOES LTDA.
    const profile = buildEntityProfile({ ...company, socios: options.shareholders });
    const retained = [];
    const discardedResults = [];
    for (const result of deduped.values()) {
      // Apenas o texto publicado. Incluir o nome do sujeito pesquisado faria a
      // consulta confirmar a si mesma: todo resultado traria a razão social
      // porque foi ela que perguntamos, e nada seria jamais descartado.
      const evidenceText = (result.excerpts || []).join(' ');
      const entityMatch = resolveEntityMatch(profile, { text: evidenceText });

      // Sujeito pessoa continua julgado pelo nome da pessoa, que já é avaliado
      // por `personCorrelation`; a camada empresarial não se aplica a ele.
      if (result.subjectType === 'person') {
        retained.push({ ...result, entityMatch });
        continue;
      }

      if (entityMatch.level === MATCH_LEVEL.FALSE_POSITIVE) {
        discardedResults.push({
          id: result.id,
          date: result.date,
          territoryName: result.territoryName,
          url: result.url,
          subjectName: result.subjectName,
          level: entityMatch.level,
          score: entityMatch.score,
          basis: entityMatch.basis,
        });
        continue;
      }

      retained.push({
        ...result,
        entityMatch,
        // O selo textual passa a refletir a identidade resolvida, e não apenas a
        // presença da string no trecho.
        matchStrength: entityMatch.level === MATCH_LEVEL.CONFIRMED
          || entityMatch.level === MATCH_LEVEL.HIGH_CONFIDENCE
          ? 'high'
          : 'medium',
      });
    }

    const results = retained;
    const totalFound = successful.reduce((sum, attempt) => sum + attempt.totalFound, 0);
    const sourceStatus = resolveSourceStatus({
      attempted: attempts.length,
      succeeded: successful.length,
      resultCount: results.length,
    });

    return {
      ok: true,
      status: 200,
      sourceStatus,
      provider: 'Querido Diário / Open Knowledge Brasil',
      query: companyQuery,
      totalFound,
      returned: results.length,
      results,
      discardedResults,
      falsePositivesDiscarded: discardedResults.length,
      completedSubjects,
      failedSubjects,
      unavailableSubjects,
      duplicateSubjects,
      deadlineExceeded,
      consultadoEm: consultedAt,
      partial: failed.length > 0,
      peopleSearched: subjects.filter((subject) => subject.type === 'person').length,
      subjects: attempts.map(subjectReport),
      scope: 'Diários oficiais municipais cobertos pelo Querido Diário, pesquisados por razão social, nome fantasia e nome de cada pessoa física do quadro; não inclui DOU, DOE nem todos os municípios brasileiros.',
    };
  },
};

/**
 * Esvazia o cache por consulta. Existe para o teste poder isolar cada cenário:
 * sem isso, uma consulta bem-sucedida de um teste responderia pela consulta
 * indisponível do teste seguinte, e a suíte validaria o cache em vez da regra.
 */
OfficialGazetteService.clearCache = function clearCache() {
  queryCache.clear();
};

module.exports = { OfficialGazetteService, correlation, personCorrelation, isNaturalPerson };
