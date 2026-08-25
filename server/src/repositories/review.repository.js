// ==========================================================
// DILIGÊNCIA 360 — Revisões humanas em snapshots versionados
// ==========================================================

const crypto = require('crypto');
const { DiligenceRepository } = require('./diligence.repository');
const { decisionForManualLevel } = require('../services/risk-assessment.service');

function findEntity(snapshot, entityType, entityId) {
  if (entityType === 'adverse_media') {
    return (snapshot.adverseMedia?.results || []).find((item) => item.id === entityId);
  }
  if (entityType === 'process_discovery') {
    return (snapshot.processosDescobertos || []).find((item) => item.id === entityId);
  }
  if (entityType === 'egos_finding') {
    return (snapshot.egos?.findings || []).find((item) => item.id === entityId);
  }
  if (entityType === 'egos_resolution') {
    return (snapshot.egos?.resolutions || []).find((item) => item.id === entityId);
  }
  if (entityType === 'pep_match') {
    for (const result of snapshot.pepResults || []) {
      const match = (result.registros || []).find((item) => item.id === entityId);
      if (match) return match;
    }
  }
  return null;
}

const ReviewRepository = {
  async overrideRisk({ diligenceId, user, userId, score, level, justification, reviewedBy }) {
    let response;
    await DiligenceRepository.mutate(diligenceId, (snapshot) => {
      const currentRisk = snapshot.risco || {};
      const currentBreakdown = Array.isArray(currentRisk.detalhes) ? currentRisk.detalhes : [];
      const previousOverride = currentBreakdown.find((item) => item?.natureza === 'manual_override');
      const automaticScore = Number(previousOverride?.automaticScore ?? currentRisk.automaticScore ?? currentRisk.score ?? 0);
      const automaticLevel = String(previousOverride?.automaticLevel ?? currentRisk.nivel ?? 'Atenção Baixa');
      const finalRisk = decisionForManualLevel(level, score, justification);
      const reviewedAt = new Date().toISOString();
      const cleanBreakdown = currentBreakdown.filter((item) => item?.natureza !== 'manual_override');
      const manualDetail = {
        criterio: 'Classificação final ajustada pelo Compliance',
        pontos: finalRisk.score - automaticScore,
        info: justification,
        categoria: 'DECISAO_HUMANA',
        natureza: 'manual_override',
        confianca: 'alta',
        requerRevisao: false,
        automaticScore,
        automaticLevel,
        finalScore: finalRisk.score,
        finalLevel: finalRisk.nivel,
        reviewedBy,
        reviewedAt,
      };
      const breakdown = [...cleanBreakdown, manualDetail];

      response = {
        ...finalRisk,
        automaticScore,
        methodologyVersion: 'v2.0-exposure+human',
        detalhes: breakdown,
        manualOverride: {
          score: finalRisk.score,
          level: finalRisk.nivel,
          reason: justification,
          automaticScore,
          automaticLevel,
          reviewedBy,
          reviewedAt,
        },
      };
      snapshot.risco = response;
    }, {
      user: user || { id: userId, name: reviewedBy },
      action: 'override',
      entityType: 'risk_assessment',
      entityId: diligenceId,
      previousStatus: 'automatic',
      newStatus: `${score}|${level}`,
      justification: `Classificação final ajustada para ${level} (${score}/100). ${justification}`,
      metadata: { score, level, reason: justification },
    });
    return response;
  },

  async recordAction(data) {
    return await this.recordReview(data);
  },

  async recordReview({
    diligenceId,
    user,
    userId,
    entityType,
    entityId,
    action,
    previousStatus,
    newStatus,
    justification,
    reviewedBy = 'Auditor Compliance SUAPE',
  }) {
    const review = {
      id: crypto.randomUUID(),
      diligenceId,
      userId: user?.firebaseUid || user?.id || userId || null,
      entityType,
      entityId,
      action,
      previousStatus: previousStatus || null,
      newStatus: newStatus || '',
      justification: justification || '',
      reviewedBy: user?.name || reviewedBy,
      reviewedAt: new Date().toISOString(),
    };

    await DiligenceRepository.mutate(diligenceId, (snapshot) => {
      const entity = findEntity(snapshot, entityType, entityId);
      if (entityType === 'egos_finding' || entityType === 'egos_resolution') {
        if (!entity) throw new Error('Item EGOS não localizado nesta diligência.');
        entity.reviewStatus = newStatus;
      } else if (entity) {
        if ('reviewStatus' in entity || entityType === 'pep_match') entity.reviewStatus = newStatus;
        else entity.status = newStatus;
      }
    }, {
      id: review.id,
      user: user || { id: userId, name: reviewedBy },
      action,
      entityType,
      entityId,
      previousStatus,
      newStatus,
      justification: justification
        || `Ação registrada (${entityType}): status alterado de "${previousStatus || 'inicial'}" para "${newStatus}".`,
    });

    return review;
  },
};

module.exports = { ReviewRepository };
