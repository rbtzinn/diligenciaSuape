// ==========================================================
// DILIGÊNCIA 360 — Histórico permanente em Google Sheets
// ==========================================================

const crypto = require('crypto');
const { DiligenceRepository } = require('../repositories/diligence.repository');
const { ReviewRepository } = require('../repositories/review.repository');
const { EgosService } = require('../egos/core/egos.service');
const { applyEgosOverlay, decisionForManualLevel } = require('./risk-assessment.service');

const recentDiligenceCache = new Map();

const DiligenceHistoryService = {
  cacheSnapshot(snapshot) {
    if (snapshot?.id) {
      recentDiligenceCache.set(snapshot.id, { snapshot, cachedAt: Date.now() });
      if (recentDiligenceCache.size > 100) {
        const oldestKey = recentDiligenceCache.keys().next().value;
        recentDiligenceCache.delete(oldestKey);
      }
    }
  },

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

    DiligenceHistoryService.cacheSnapshot({ ...snapshot, ...saved });

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

  async saveMedia(id, adverseMedia, automaticRisk, user) {
    const { snapshot } = await DiligenceRepository.mutate(id, (current) => {
      current.adverseMedia = adverseMedia;
      const assessed = applyEgosOverlay(automaticRisk, current.egos);
      const override = current.risco?.manualOverride;
      current.risco = override ? {
        ...assessed,
        ...decisionForManualLevel(override.level, override.score, override.reason),
        manualOverride: override,
      } : assessed;
    }, {
      user, action: 'update_media', entityType: 'diligence', entityId: id,
      justification: 'Publicações e revisões de notícias atualizadas; indicador automático recalculado.',
    });
    this.cacheSnapshot(snapshot);
    return snapshot;
  },

  async getDiligenceById(id) {
    if (recentDiligenceCache.has(id)) {
      return recentDiligenceCache.get(id).snapshot;
    }
    try {
      const found = await Promise.race([
        DiligenceRepository.findById(id),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout na consulta do histórico')), 5000))
      ]);
      if (found) DiligenceHistoryService.cacheSnapshot(found);
      return found;
    } catch (err) {
      console.warn(`[DiligenceHistoryService] Aviso ao recuperar diligência ${id}:`, err?.message);
      return null;
    }
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
