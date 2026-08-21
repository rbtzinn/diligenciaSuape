// ==========================================================
// DILIGÊNCIA 360 — Serviço de Mídia Adversa e Ocorrências Públicas
// Estratégia de busca, deduplicação, correlação e categorização determinística
// ==========================================================

const { BraveSearchProvider } = require('./search/brave-search.provider');

const SEARCH_DICTIONARY = {
  integrity: ['corrupção', 'fraude', 'suborno', 'improbidade', 'propina', 'desvio', 'lavagem de dinheiro'],
  criminal: ['investigação', 'operação', 'denúncia', 'condenação', 'polícia federal', 'mandado', 'prisão'],
  judicial: ['ação civil pública', 'processo', 'execução fiscal', 'falência', 'recuperação judicial', 'multa'],
  environmental: ['crime ambiental', 'dano ambiental', 'multa ambiental', 'ibama', 'desmatamento', 'poluição'],
  labor: ['trabalho escravo', 'trabalho infantil', 'ação trabalhista', 'mpt', 'fiscalização do trabalho'],
};

const MAX_QUERIES = parseInt(process.env.ADVERSE_MEDIA_MAX_QUERIES, 10) || 4;

// Cache simples em memória (TTL: 10 minutos)
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

    return queries.slice(0, MAX_QUERIES);
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

  classifyTerms(itemText) {
    const textNorm = normalizeText(itemText);
    const matchedTerms = [];
    const categories = [];

    for (const [category, terms] of Object.entries(SEARCH_DICTIONARY)) {
      let catMatched = false;
      for (const term of terms) {
        const termNorm = normalizeText(term);
        if (textNorm.includes(termNorm)) {
          if (!matchedTerms.includes(term)) matchedTerms.push(term);
          catMatched = true;
        }
      }
      if (catMatched && !categories.includes(category)) {
        categories.push(category);
      }
    }

    return { matchedTerms, categories };
  }

  async searchAdverseMedia(company) {
    if (!company || (!company.razaoSocial && !company.cnpj)) {
      return { ok: false, status: 400, erro: 'Dados da empresa insuficientes para busca.', results: [] };
    }

    const cnpjClean = String(company.cnpj || '').replace(/\D/g, '');
    const cnpjKey = cnpjClean || `name:${normalizeText(company.razaoSocial)}`;
    const now = Date.now();

    // Verificação de cache em memória
    if (memoryCache.has(cnpjKey)) {
      const cached = memoryCache.get(cnpjKey);
      if (now - cached.timestamp < 10 * 60 * 1000) {
        return { ...cached.data, cached: true };
      }
    }

    if (!this.isConfigured()) {
      return {
        ok: false,
        semChave: true,
        aviso: 'Integração de mídia adversa não configurada no servidor (BRAVE_SEARCH_API_KEY ausente).',
        totalFound: 0,
        candidatesCount: 0,
        strongMatches: 0,
        results: [],
        queriesExecuted: [],
        consultadoEm: new Date().toISOString(),
      };
    }

    const queries = this.generateQueries(company);
    const deduplicatedMap = new Map();
    const titleKeyToUrl = new Map();
    const executedQueries = [];

    for (const query of queries) {
      const res = await this.provider.searchWeb({ query, count: 10 });
      executedQueries.push({
        query,
        ok: res.ok,
        status: res.status,
        count: res.results?.length || 0,
        erro: res.erro,
      });

      if (res.ok && Array.isArray(res.results)) {
        for (const item of res.results) {
          const normUrl = normalizeUrl(item.url);
          const id = `${item.domain}:${normalizeText(item.title).substring(0, 40)}`;

          const existingUrl = deduplicatedMap.has(normUrl) ? normUrl : titleKeyToUrl.get(id);
          if (existingUrl) {
            const existing = deduplicatedMap.get(existingUrl);
            if (!existing.queriesMatched.includes(query)) {
              existing.queriesMatched.push(query);
            }
          } else {
            const fullContent = `${item.title} ${item.snippet}`;
            const correlation = this.evaluateCorrelation(company, fullContent);
            const { matchedTerms, categories } = this.classifyTerms(fullContent);

            const record = {
              id,
              title: item.title,
              url: item.url,
              domain: item.domain,
              publishedAt: item.publishedAt,
              snippet: item.snippet,
              queriesMatched: [query],
              matchedTerms,
              categories,
              matchStrength: correlation.matchStrength,
              companyMatch: correlation.companyMatch,
              status: 'candidate',
              searchedAt: new Date().toISOString(),
            };

            deduplicatedMap.set(normUrl, record);
            titleKeyToUrl.set(id, normUrl);
          }
        }
      }
    }

    const results = Array.from(deduplicatedMap.values());
    const strongMatches = results.filter((r) => r.matchStrength === 'high').length;
    const mediumMatches = results.filter((r) => r.matchStrength === 'medium').length;
    const weakMatches = results.filter((r) => r.matchStrength === 'low').length;
    const successfulQueries = executedQueries.filter((query) => query.ok).length;
    const consultaParcial = successfulQueries > 0 && successfulQueries < executedQueries.length;

    const payload = {
      ok: successfulQueries > 0,
      status: successfulQueries > 0 ? 200 : 502,
      provider: 'Brave Search API',
      totalFound: results.length,
      candidatesCount: results.length,
      strongMatches,
      mediumMatches,
      weakMatches,
      results,
      queriesExecuted: executedQueries,
      consultaParcial,
      aviso: successfulQueries === 0
        ? 'Fonte de busca indisponível para todas as consultas executadas.'
        : consultaParcial
          ? 'Consulta realizada parcialmente; uma ou mais buscas falharam.'
          : undefined,
      consultadoEm: new Date().toISOString(),
    };

    memoryCache.set(cnpjKey, { timestamp: now, data: payload });
    return payload;
  }
}

module.exports = { AdverseMediaService, SEARCH_DICTIONARY };
