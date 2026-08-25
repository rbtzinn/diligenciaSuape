// ==========================================================
// DILIGÊNCIA 360 — Histórico permanente em Google Sheets
// ==========================================================

const crypto = require('crypto');
const { DiligenceRepository } = require('../repositories/diligence.repository');
const { ReviewRepository } = require('../repositories/review.repository');
const { EgosService } = require('../egos/core/egos.service');
const { applyEgosOverlay } = require('./risk-assessment.service');

const DiligenceHistoryService = {
  async saveDiligence(payload) {
    if (!payload || !payload.cnpj) {
      throw new Error('CNPJ obrigatório para persistência da diligência.');
    }

    const id = payload.id || crypto.randomUUID();
    const egos = payload.egos || await EgosService.build(id, payload);
    const risk = applyEgosOverlay(payload.risco, egos);
    const snapshot = {
      ...payload,
      id,
      status: payload.status || 'in_progress',
      dataAnalise: payload.dataAnalise || new Date().toISOString(),
      razaoSocial: payload.razaoSocial || payload.empresa?.razao_social || 'Razão Social',
      nomeFantasia: payload.nomeFantasia || payload.empresa?.nome_fantasia || '',
      risco: risk,
      egos,
    };

    const saved = await DiligenceRepository.saveComplete(snapshot, {
      audit: {
        user: payload.createdBy,
        action: 'create',
        entityType: 'diligence',
        entityId: id,
        previousStatus: '',
        newStatus: snapshot.status,
        justification: `Diligência de ${snapshot.razaoSocial} salva no histórico permanente.`,
      },
    });

    return {
      ok: true,
      id: saved.id,
      cnpj: snapshot.cnpj,
      persisted: true,
      egos: saved.egos,
      risco: saved.risco,
      savedAt: saved.updatedAt,
      storage: 'google_sheets',
    };
  },

  async getDiligenceById(id) {
    return await DiligenceRepository.findById(id);
  },

  async listDiligences(limit = 50, filters = {}) {
    const list = await DiligenceRepository.listAll(limit, filters);
    return list.map((item) => ({
      id: item.id,
      cnpj: item.cnpj,
      razaoSocial: item.razaoSocial,
      nomeFantasia: item.nomeFantasia,
      dataAnalise: item.dataAnalise,
      score: item.preliminaryScore ?? 0,
      nivel: item.preliminaryLevel || 'Atenção Baixa',
      decisao: item.recommendation || '',
      status: item.status || 'in_progress',
      createdBy: item.createdBy,
      completedAt: item.completedAt,
      updatedAt: item.updatedAt,
    }));
  },

  async recordReview(reviewData) {
    return await ReviewRepository.recordReview(reviewData);
  },

  async overrideRisk(riskData) {
    return await ReviewRepository.overrideRisk(riskData);
  },

  async deleteDiligence(id, user) {
    const deleted = await DiligenceRepository.delete(id, user);
    if (!deleted) throw new Error('Dossiê não encontrado ou já removido.');
    return { ok: true, message: 'Dossiê removido da visualização; histórico preservado.' };
  },
};

module.exports = { DiligenceHistoryService };
