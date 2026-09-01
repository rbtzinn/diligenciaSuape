// ==========================================================
// DILIGÊNCIA 360 — Diários Oficiais (Querido Diário)
// Busca nominal da empresa e das pessoas físicas do quadro.
// Menção nominal é hipótese investigativa, nunca confirmação.
// ==========================================================

const crypto = require('crypto');

const API_URL = process.env.QUERIDO_DIARIO_API_URL || 'https://api.queridodiario.ok.org.br/gazettes';
const REQUEST_TIMEOUT_MS = 15_000;

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

const RESULTS_PER_SUBJECT = envInt('GAZETTE_RESULTS_PER_SUBJECT', 25, 5, 100);
const MAX_PEOPLE = envInt('GAZETTE_MAX_PEOPLE', 20, 0, 40);
const CONCURRENCY = envInt('GAZETTE_CONCURRENCY', 3, 1, 6);
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

async function fetchGazettes({ query, territoryIds = [], since }) {
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

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Diligencia360-SUAPE/2.0' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error(`Querido Diário respondeu HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
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

    const consultedAt = new Date().toISOString();
    const attempts = await mapWithConcurrency(subjects, CONCURRENCY, async (subject) => {
      const query = quotedQuery(subject.name);
      if (!query) {
        return { subject, ok: false, status: 400, erro: 'Nome inválido para consulta.', query, results: [], totalFound: 0 };
      }
      try {
        const payload = await fetchGazettes({ query, territoryIds, since: publishedSince });
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
        return {
          subject,
          ok: false,
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

    if (successful.length === 0) {
      return {
        ok: false,
        status: failed[0]?.status || 503,
        erro: failed[0]?.erro || 'Nenhuma consulta a diários oficiais foi concluída.',
        totalFound: 0,
        returned: 0,
        results: [],
        query: companyQuery,
        consultadoEm: consultedAt,
        subjects: attempts.map((attempt) => ({
          type: attempt.subject.type,
          name: attempt.subject.name,
          qualification: attempt.subject.qualification,
          ok: attempt.ok,
          totalFound: attempt.totalFound,
          returned: attempt.results.length,
          erro: attempt.erro,
        })),
      };
    }

    const deduped = new Map();
    for (const attempt of successful) {
      for (const result of attempt.results) {
        const key = `${result.subjectName}|${result.url || result.id}`;
        if (!deduped.has(key)) deduped.set(key, result);
      }
    }
    const results = [...deduped.values()];
    const totalFound = successful.reduce((sum, attempt) => sum + attempt.totalFound, 0);

    return {
      ok: true,
      status: 200,
      provider: 'Querido Diário / Open Knowledge Brasil',
      query: companyQuery,
      totalFound,
      returned: results.length,
      results,
      consultadoEm: consultedAt,
      partial: failed.length > 0,
      peopleSearched: subjects.filter((subject) => subject.type === 'person').length,
      subjects: attempts.map((attempt) => ({
        type: attempt.subject.type,
        name: attempt.subject.name,
        qualification: attempt.subject.qualification,
        ok: attempt.ok,
        totalFound: attempt.totalFound,
        returned: attempt.results.length,
        erro: attempt.erro,
      })),
      scope: 'Diários oficiais municipais cobertos pelo Querido Diário, pesquisados por razão social, nome fantasia e nome de cada pessoa física do quadro; não inclui DOU, DOE nem todos os municípios brasileiros.',
    };
  },
};

module.exports = { OfficialGazetteService, correlation, personCorrelation, isNaturalPerson };
