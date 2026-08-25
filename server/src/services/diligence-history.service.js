// ==========================================================
// DILIGÊNCIA 360 — Serviço de Histórico e Persistência Permanente
// ==========================================================

const { CompanyRepository } = require('../repositories/company.repository');
const { DiligenceRepository } = require('../repositories/diligence.repository');
const { ReviewRepository } = require('../repositories/review.repository');
const { formatEgosRun } = require('../egos/core/egos-view.service');

const DiligenceHistoryService = {
  async saveDiligence(payload) {
    if (!payload || !payload.cnpj) {
      throw new Error('CNPJ obrigatório para persistência da diligência.');
    }

    const corporateName = payload.razaoSocial || payload.empresa?.razao_social || 'Razão Social';
    const tradeName = payload.nomeFantasia || payload.empresa?.nome_fantasia || '';

    const company = await CompanyRepository.findOrCreate(payload.cnpj, corporateName, tradeName);
    const saved = await DiligenceRepository.saveComplete(company.id, payload);

    return {
      ok: true,
      id: saved.id,
      companyId: company.id,
      cnpj: company.cnpj,
      persisted: saved.persisted !== false,
      egos: saved.egos,
      aviso: saved.aviso || undefined,
      savedAt: saved.createdAt || new Date(),
    };
  },

  async getDiligenceById(id) {
    const raw = await DiligenceRepository.findById(id);
    if (!raw) return null;

    if (raw.empresa && raw.risco) return raw;

    const companySnapshot = raw.companySnapshot || {};

    const formattedSocios = (raw.shareholders || []).map((s) => ({
      nome_socio: s.name,
      qualificacao_socio: s.qualification || undefined,
      data_entrada_sociedade: s.entryDate || undefined,
      data_saida_sociedade: s.rawData?.data_saida_sociedade || undefined,
      cnpj_cpf_do_socio: s.cpfCnpj || undefined,
    }));

    const ceisRegs = (raw.sanctions || [])
      .filter((sn) => sn.source === 'CEIS')
      .map((sn) => ({
        sancao: sn.sanctionType || undefined,
        orgao: sn.sanctioningBody || undefined,
        uf: sn.state || undefined,
        inicio: sn.startDate || undefined,
        fim: sn.endDate || undefined,
        vigente: sn.active,
        abrangencia: sn.scope || undefined,
        processo: sn.processNumber || undefined,
        fundamentacao: sn.legalBasis || undefined,
      }));

    const cnepRegs = (raw.sanctions || [])
      .filter((sn) => sn.source === 'CNEP')
      .map((sn) => ({
        sancao: sn.sanctionType || undefined,
        orgao: sn.sanctioningBody || undefined,
        uf: sn.state || undefined,
        inicio: sn.startDate || undefined,
        fim: sn.endDate || undefined,
        vigente: sn.active,
        abrangencia: sn.scope || undefined,
        processo: sn.processNumber || undefined,
        fundamentacao: sn.legalBasis || undefined,
      }));

    const pepMap = new Map();
    (raw.pepMatches || []).forEach((pm) => {
      if (!pepMap.has(pm.nameSearched)) {
        pepMap.set(pm.nameSearched, {
          nome: pm.nameSearched,
          ok: true,
          fonte: 'CGU / PEP',
          encontrado: true,
          quantidade: 0,
          registros: [],
        });
      }
      const entry = pepMap.get(pm.nameSearched);
      entry.quantidade += 1;
      entry.registros.push({
        nome: pm.matchedName || pm.nameSearched,
        orgao: pm.organization || undefined,
        funcao: pm.role || undefined,
        inicio: pm.startDate || undefined,
        fim: pm.endDate || undefined,
      });
    });

    const formattedDiscoveries = (raw.discoveries || []).map((disc) => ({
      processNumber: disc.processNumber,
      formattedProcessNumber: disc.formattedProcessNumber || disc.processNumber,
      tribunal: disc.tribunal,
      status: disc.status,
      primarySource: {
        type: disc.sourceType,
        name: disc.sourceName,
        url: disc.sourceUrl || undefined,
        excerpt: disc.excerpt || undefined,
        discoveredAt: disc.discoveredAt.toISOString(),
      },
      sources: [
        {
          type: disc.sourceType,
          name: disc.sourceName,
          url: disc.sourceUrl || undefined,
          excerpt: disc.excerpt || undefined,
          discoveredAt: disc.discoveredAt.toISOString(),
        },
      ],
      dataJud: disc.judicialProcess ? {
        numero: disc.judicialProcess.formattedNumber || disc.judicialProcess.processNumber,
        numeroLimpo: disc.judicialProcess.processNumber,
        tribunal: disc.judicialProcess.tribunal,
        tribunalNome: '',
        grau: disc.judicialProcess.degree || 'G1',
        classe: disc.judicialProcess.className || 'Não informada',
        categoria: { id: 'outros', label: 'Ação Judicial', badgeVariant: 'neutral' },
        assuntos: [],
        orgaoJulgador: { codigo: 0, nome: disc.judicialProcess.courtName || 'Não informado' },
        dataAjuizamento: disc.judicialProcess.filingDate || '',
        nivelSigilo: disc.judicialProcess.secrecyLevel || 0,
        sistema: disc.judicialProcess.systemName || 'PJe',
        formato: 'Eletrônico',
        ultimaAtualizacao: disc.judicialProcess.lastDatajudUpdate || '',
        totalMovimentos: 0,
        movimentos: [],
        fonte: 'CNJ - DataJud',
        consultadoEm: disc.discoveredAt.toISOString(),
      } : undefined,
    }));

    const mediaCoverage = raw.egosRun?.coverage?.find((item) => item.axis === 'MEDIA');
    const diligenceMeta = companySnapshot?._diligenceMeta || {};
    const mediaMeta = diligenceMeta.adverseMedia || {};
    const { _diligenceMeta: _storedMeta, ...cleanCompanySnapshot } = companySnapshot;
    const formattedMediaResults = (raw.adverseMedia || []).map((m) => {
      const stored = m.rawData && typeof m.rawData === 'object' && !Array.isArray(m.rawData)
        ? m.rawData
        : {};
      return {
        ...stored,
        id: m.id,
        title: m.title,
        url: m.url,
        domain: m.domain,
        publishedAt: m.publishedAt || undefined,
        snippet: m.snippet || '',
        queriesMatched: Array.isArray(stored.queriesMatched) ? stored.queriesMatched : [],
        matchedTerms: Array.isArray(m.matchedTerms) ? m.matchedTerms : [],
        categories: Array.isArray(m.categories) ? m.categories : [],
        matchStrength: m.matchStrength,
        companyMatch: stored.companyMatch || { corporateName: false, tradeName: false, cnpj: false },
        status: m.status,
        searchedAt: m.searchedAt?.toISOString ? m.searchedAt.toISOString() : String(m.searchedAt || raw.startedAt),
      };
    });
    const companyMediaResults = formattedMediaResults.filter((item) => item.subjectType !== 'person').length;
    const personMediaResults = formattedMediaResults.filter((item) => item.subjectType === 'person').length;

    return {
      id: raw.id,
      status: raw.status,
      returnJustification: raw.returnJustification || undefined,
      createdBy: raw.createdBy || undefined,
      reviewedBy: raw.reviewedBy || undefined,
      cnpj: raw.company?.cnpj || companySnapshot.cnpj || '',
      cnpjFmt: companySnapshot.cnpj || raw.company?.cnpj || '',
      razaoSocial: raw.company?.corporateName || companySnapshot.razao_social || '',
      nomeFantasia: raw.company?.tradeName || companySnapshot.nome_fantasia || '',
      dataAnalise: raw.startedAt ? raw.startedAt.toISOString() : new Date().toISOString(),
      companySource: diligenceMeta.companySource || undefined,
      companyConsultedAt: diligenceMeta.companyConsultedAt || undefined,
      empresa: cleanCompanySnapshot,
      socios: formattedSocios,
      governanceHistory: diligenceMeta.governanceHistory || undefined,
      fundNetwork: diligenceMeta.fundNetwork || undefined,
      ceis: {
        ok: true,
        fonte: 'CGU / CEIS',
        encontrado: ceisRegs.length > 0,
        quantidade: ceisRegs.length,
        vigentes: ceisRegs.filter((r) => r.vigente).length,
        historicas: ceisRegs.filter((r) => !r.vigente).length,
        registros: ceisRegs,
      },
      cnep: {
        ok: true,
        fonte: 'CGU / CNEP',
        encontrado: cnepRegs.length > 0,
        quantidade: cnepRegs.length,
        vigentes: cnepRegs.filter((r) => r.vigente).length,
        historicas: cnepRegs.filter((r) => !r.vigente).length,
        registros: cnepRegs,
      },
      pepResults: Array.from(pepMap.values()),
      processosDescobertos: formattedDiscoveries,
      adverseMedia: {
        ok: mediaCoverage ? mediaCoverage.status === 'CONSULTED' || mediaCoverage.status === 'PARTIAL' : true,
        semChave: mediaCoverage?.status === 'UNAVAILABLE' || undefined,
        aviso: mediaCoverage?.status === 'UNAVAILABLE' ? mediaCoverage.message : undefined,
        provider: mediaMeta.provider || 'Pesquisa Web & Mídia',
        totalFound: formattedMediaResults.length,
        candidatesCount: formattedMediaResults.filter((item) => item.status === 'candidate').length,
        strongMatches: formattedMediaResults.filter((item) => item.matchStrength === 'high').length,
        mediumMatches: formattedMediaResults.filter((item) => item.matchStrength === 'medium').length,
        weakMatches: formattedMediaResults.filter((item) => item.matchStrength === 'low').length,
        companyResultsCount: Number.isFinite(mediaMeta.companyResultsCount) ? mediaMeta.companyResultsCount : companyMediaResults,
        personResultsCount: Number.isFinite(mediaMeta.personResultsCount) ? mediaMeta.personResultsCount : personMediaResults,
        peopleRequested: mediaMeta.peopleRequested || 0,
        peopleSearched: mediaMeta.peopleSearched || 0,
        peopleWithCandidates: mediaMeta.peopleWithCandidates || 0,
        personSearchCompleted: mediaMeta.personSearchCompleted === true,
        personSearchTruncated: mediaMeta.personSearchTruncated === true,
        consultaParcial: mediaMeta.consultaParcial === true,
        subjects: Array.isArray(mediaMeta.subjects) ? mediaMeta.subjects : [],
        queriesExecuted: Array.isArray(mediaMeta.queriesExecuted) ? mediaMeta.queriesExecuted : [],
        results: formattedMediaResults,
        consultadoEm: mediaMeta.consultadoEm || (raw.startedAt ? raw.startedAt.toISOString() : new Date().toISOString()),
      },
      risco: {
        score: raw.preliminaryScore,
        nivel: raw.preliminaryLevel,
        cor: raw.preliminaryScore > 45 ? 'critical' : raw.preliminaryScore > 15 ? 'medium' : 'low',
        emoji: '',
        decisao: raw.recommendation,
        decisaoDesc: raw.summary || '',
        detalhes: raw.riskAssessment?.breakdown || [],
      },
      timeline: (raw.auditEvents || []).map((e) => ({
        time: e.createdAt.toISOString(),
        txt: e.message,
        tipo: e.eventType || 'info',
      })),
      egos: formatEgosRun(raw.egosRun),
    };
  },

  async listDiligences(limit = 50, filters = {}) {
    const list = await DiligenceRepository.listAll(limit, filters);
    return list.map((item) => ({
      id: item.id,
      cnpj: item.company?.cnpj || item.cnpj,
      razaoSocial: item.company?.corporateName || item.razaoSocial,
      nomeFantasia: item.company?.tradeName || item.nomeFantasia,
      dataAnalise: item.startedAt ? item.startedAt.toISOString() : item.dataAnalise,
      score: item.preliminaryScore ?? item.risco?.score ?? 0,
      nivel: item.preliminaryLevel || item.risco?.nivel || 'Atenção Baixa',
      decisao: item.recommendation || item.risco?.decisao || '',
      status: item.status || 'completed',
    }));
  },

  async recordReview(reviewData) {
    return await ReviewRepository.recordReview(reviewData);
  },

  async deleteDiligence(id) {
    await DiligenceRepository.delete(id);
    return { ok: true, message: 'Dossiê excluído com sucesso.' };
  },
};

module.exports = { DiligenceHistoryService };
