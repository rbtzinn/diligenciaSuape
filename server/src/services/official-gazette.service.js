const crypto = require('crypto');

const API_URL = 'https://api.queridodiario.ok.org.br/gazettes';

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

const OfficialGazetteService = {
  async search(company) {
    if (!company?.razaoSocial) {
      return { ok: false, status: 400, erro: 'Razão social necessária para consultar diários oficiais.', totalFound: 0, returned: 0, results: [] };
    }

    const query = `"${String(company.razaoSocial).replace(/["\\]/g, ' ').trim()}"`;
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      querystring: query,
      excerpt_size: '650',
      number_of_excerpts: '2',
      size: '12',
      sort_by: 'relevance',
    }).toString();
    const consultedAt = new Date().toISOString();

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Diligencia360-SUAPE/2.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        return { ok: false, status: response.status, erro: `Querido Diário respondeu HTTP ${response.status}.`, totalFound: 0, returned: 0, results: [], query, consultadoEm: consultedAt };
      }
      const payload = await response.json();
      const results = (Array.isArray(payload.gazettes) ? payload.gazettes : []).map((item) => {
        const excerpts = (Array.isArray(item.excerpts) ? item.excerpts : []).map(cleanExcerpt).filter(Boolean);
        return {
          id: crypto.createHash('sha256').update(String(item.url || `${item.territory_id}:${item.date}`)).digest('hex').slice(0, 32),
          date: item.date || null,
          territoryId: item.territory_id || null,
          territoryName: item.territory_name || 'Município não informado',
          stateCode: item.state_code || null,
          edition: item.edition || null,
          url: item.url || null,
          txtUrl: item.txt_url || null,
          excerpts,
          matchStrength: correlation(company, excerpts),
        };
      });
      return {
        ok: true,
        status: 200,
        provider: 'Querido Diário / Open Knowledge Brasil',
        query,
        totalFound: Number(payload.total_gazettes) || results.length,
        returned: results.length,
        results,
        consultadoEm: consultedAt,
        scope: 'Diários oficiais municipais cobertos pelo Querido Diário; não inclui DOU, DOE ou todos os municípios brasileiros.',
      };
    } catch (error) {
      return { ok: false, status: 503, erro: `Falha ao consultar Querido Diário: ${error.message}`, totalFound: 0, returned: 0, results: [], query, consultadoEm: consultedAt };
    }
  },
};

module.exports = { OfficialGazetteService, correlation };
