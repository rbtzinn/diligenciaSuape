// ==========================================================
// DILIGÊNCIA 360 — Mappers de Persistência Relacional
// ==========================================================

const crypto = require('crypto');

const DiligenceMappers = {
  mapShareholders(diligenceId, socios) {
    if (!Array.isArray(socios) || socios.length === 0) return [];
    return socios.map((s) => ({
      id: crypto.randomUUID(),
      diligenceId,
      name: s.nome_socio || '',
      qualification: s.qualificacao_socio || null,
      entryDate: s.data_entrada_sociedade || null,
      cpfCnpj: s.cnpj_cpf_do_socio || null,
      rawData: s,
    }));
  },

  mapPepMatches(diligenceId, pepResults) {
    if (!Array.isArray(pepResults) || pepResults.length === 0) return [];
    const entries = [];
    for (const p of pepResults) {
      if (p.encontrado && Array.isArray(p.registros)) {
        for (const reg of p.registros) {
          entries.push({
            id: crypto.randomUUID(),
            diligenceId,
            nameSearched: p.nome,
            matchedName: reg.nome || p.nome,
            organization: reg.orgao || null,
            role: reg.funcao || null,
            startDate: reg.inicio || null,
            endDate: reg.fim || null,
            status: 'possible_match',
            reviewStatus: 'pending',
            rawData: reg,
          });
        }
      }
    }
    return entries;
  },

  mapSanctions(diligenceId, ceis, cnep) {
    const entries = [];
    if (ceis?.registros) {
      for (const reg of ceis.registros) {
        entries.push({
          id: crypto.randomUUID(),
          diligenceId,
          source: 'CEIS',
          sanctionType: reg.sancao || null,
          sanctioningBody: reg.orgao || null,
          state: reg.uf || null,
          startDate: reg.inicio || null,
          endDate: reg.fim || null,
          active: reg.vigente !== false,
          scope: reg.abrangencia || null,
          processNumber: reg.processo || null,
          legalBasis: reg.fundamentacao || null,
          rawData: reg,
        });
      }
    }
    if (cnep?.registros) {
      for (const reg of cnep.registros) {
        entries.push({
          id: crypto.randomUUID(),
          diligenceId,
          source: 'CNEP',
          sanctionType: reg.sancao || null,
          sanctioningBody: reg.orgao || null,
          state: reg.uf || null,
          startDate: reg.inicio || null,
          endDate: reg.fim || null,
          active: reg.vigente !== false,
          scope: reg.abrangencia || null,
          processNumber: reg.processo || null,
          legalBasis: reg.fundamentacao || null,
          rawData: reg,
        });
      }
    }
    return entries;
  },

  mapAdverseMedia(diligenceId, adverseMedia) {
    if (!adverseMedia?.results || adverseMedia.results.length === 0) return [];
    return adverseMedia.results.map((m) => ({
      // O identificador do provedor pode reaparecer em diligências diferentes.
      // A chave relacional precisa ser exclusiva por registro persistido.
      id: crypto.randomUUID(),
      diligenceId,
      title: m.title || '',
      url: m.url || '',
      domain: m.domain || '',
      publishedAt: m.publishedAt || null,
      snippet: m.snippet || '',
      matchStrength: m.matchStrength || 'low',
      matchedTerms: m.matchedTerms || [],
      categories: m.categories || [],
      status: m.status || 'candidate',
      searchedAt: m.searchedAt ? new Date(m.searchedAt) : new Date(),
      rawData: m,
    }));
  },
};

module.exports = { DiligenceMappers };
