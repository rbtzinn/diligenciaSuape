const { normalizeName } = require('../egos/domain/normalization');
const { nameSimilarity } = require('../egos/entity-resolution/entity-resolution.service');

const RECONCILE_URL = 'https://offshoreleaks.icij.org/api/v1/reconcile';

const OffshoreService = {
  async search({ company, shareholders = [] }) {
    const sources = [{
      sourceType: 'company',
      sourceName: company.razaoSocial,
      sourceReference: String(company.cnpj || '').replace(/\D/g, ''),
      aliases: [company.nomeFantasia].filter(Boolean),
    }];
    for (const shareholder of shareholders.slice(0, 24)) {
      if (!shareholder.nome_socio) continue;
      sources.push({
        sourceType: 'person',
        sourceName: shareholder.nome_socio,
        sourceReference: normalizeName(shareholder.nome_socio),
        aliases: [],
      });
    }

    const queries = Object.fromEntries(sources.map((source, index) => [`q${index}`, { query: source.sourceName }]));
    const consultedAt = new Date().toISOString();
    try {
      const response = await fetch(RECONCILE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Diligencia360-SUAPE/2.0' },
        body: JSON.stringify({ type: 'Node', queries }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        return { ok: false, status: response.status, erro: `ICIJ respondeu HTTP ${response.status}.`, totalQueries: sources.length, candidates: [], consultadoEm: consultedAt };
      }
      const payload = await response.json();
      const candidates = [];
      const seen = new Set();
      for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index];
        const results = Array.isArray(payload[`q${index}`]?.result) ? payload[`q${index}`].result : [];
        let acceptedForSource = 0;
        for (const item of results) {
          const similarity = nameSimilarity(source.sourceName, item.name);
          const aliasExact = source.aliases.some((alias) => normalizeName(alias) === normalizeName(item.name));
          if (!item.match && similarity < 0.92 && !aliasExact) continue;
          const uniqueKey = `${source.sourceType}:${source.sourceReference}:${item.id}`;
          if (seen.has(uniqueKey)) continue;
          seen.add(uniqueKey);
          const confidence = Math.min(69, Math.max(
            item.match ? 69 : 0,
            Math.round(similarity * 68),
            aliasExact ? 62 : 0
          ));
          candidates.push({
            sourceType: source.sourceType,
            sourceName: source.sourceName,
            sourceReference: source.sourceReference,
            id: String(item.id),
            name: item.name,
            description: item.description || 'Registro na base Offshore Leaks.',
            offshoreType: item.types?.[0]?.name || 'Node',
            score: Number(item.score) || 0,
            reconciliationMatch: item.match === true,
            confidence,
            url: `https://offshoreleaks.icij.org/nodes/${item.id}`,
          });
          acceptedForSource += 1;
          if (acceptedForSource >= 3) break;
        }
      }

      return {
        ok: true,
        status: 200,
        provider: 'ICIJ Offshore Leaks Reconciliation API',
        totalQueries: sources.length,
        candidates,
        consultadoEm: consultedAt,
        disclaimer: 'A presença na base não implica ilegalidade. Correspondências nominais podem ser homônimos e exigem validação humana.',
      };
    } catch (error) {
      return { ok: false, status: 503, erro: `Falha ao consultar ICIJ: ${error.message}`, totalQueries: sources.length, candidates: [], consultadoEm: consultedAt };
    }
  },
};

module.exports = { OffshoreService };
