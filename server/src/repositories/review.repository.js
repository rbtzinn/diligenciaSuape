// ==========================================================
// DILIGÊNCIA 360 — Repositório de Revisões Humanas
// ==========================================================

const { getPrismaClient } = require('../config/database');
const { decisionForManualLevel } = require('../services/risk-assessment.service');
const crypto = require('crypto');

const ReviewRepository = {
  async overrideRisk({ diligenceId, userId, score, level, justification, reviewedBy }) {
    const prisma = await getPrismaClient();
    if (!prisma) throw new Error('PostgreSQL indisponível para registrar a classificação final de risco.');

    return await prisma.$transaction(async (tx) => {
      const diligence = await tx.diligence.findUnique({
        where: { id: diligenceId },
        include: { riskAssessment: true },
      });
      if (!diligence) throw new Error('Diligência não localizada.');

      const currentRisk = diligence.riskAssessment;
      const currentBreakdown = Array.isArray(currentRisk?.breakdown) ? currentRisk.breakdown : [];
      const previousOverride = currentBreakdown.find((item) => item?.natureza === 'manual_override');
      const automaticScore = Number(previousOverride?.automaticScore ?? currentRisk?.score ?? diligence.preliminaryScore ?? 0);
      const automaticLevel = String(previousOverride?.automaticLevel ?? currentRisk?.level ?? diligence.preliminaryLevel ?? 'Atenção Baixa');
      const finalRisk = decisionForManualLevel(level, score, justification);
      const reviewedAt = new Date();
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
        reviewedAt: reviewedAt.toISOString(),
      };
      const breakdown = [...cleanBreakdown, manualDetail];

      const storedRisk = currentRisk
        ? await tx.riskAssessment.update({
            where: { id: currentRisk.id },
            data: {
              score: finalRisk.score,
              level: finalRisk.nivel,
              decision: finalRisk.decisao,
              decisionDesc: finalRisk.decisaoDesc,
              methodologyVersion: 'v2.0-exposure+human',
              breakdown,
            },
          })
        : await tx.riskAssessment.create({
            data: {
              id: crypto.randomUUID(),
              diligenceId,
              score: finalRisk.score,
              level: finalRisk.nivel,
              decision: finalRisk.decisao,
              decisionDesc: finalRisk.decisaoDesc,
              methodologyVersion: 'v2.0-exposure+human',
              breakdown,
            },
          });

      await tx.diligence.update({
        where: { id: diligenceId },
        data: {
          preliminaryScore: finalRisk.score,
          preliminaryLevel: finalRisk.nivel,
          recommendation: finalRisk.decisao,
          summary: finalRisk.decisaoDesc,
          updatedAt: reviewedAt,
        },
      });

      await tx.reviewAction.create({
        data: {
          id: crypto.randomUUID(),
          diligenceId,
          userId: userId || null,
          entityType: 'risk_assessment',
          entityId: storedRisk.id,
          action: 'override',
          previousStatus: `${currentRisk?.score ?? diligence.preliminaryScore}|${currentRisk?.level ?? diligence.preliminaryLevel}`,
          newStatus: `${finalRisk.score}|${finalRisk.nivel}`,
          justification,
          reviewedBy,
          reviewedAt,
        },
      });

      await tx.auditEvent.create({
        data: {
          id: crypto.randomUUID(),
          diligenceId,
          userId: userId || null,
          eventType: 'risk_override',
          message: `Classificação final de risco ajustada para ${finalRisk.nivel} (${finalRisk.score}/100). Justificativa: ${justification}`,
          metadata: {
            automaticScore,
            automaticLevel,
            finalScore: finalRisk.score,
            finalLevel: finalRisk.nivel,
          },
          actor: reviewedBy,
          createdAt: reviewedAt,
        },
      });

      return {
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
          reviewedAt: reviewedAt.toISOString(),
        },
      };
    });
  },

  async recordAction(data) {
    return await this.recordReview(data);
  },

  async recordReview({
    diligenceId,
    userId,
    entityType,
    entityId,
    action,
    previousStatus,
    newStatus,
    justification,
    reviewedBy = 'Auditor Compliance SUAPE',
  }) {
    const prisma = await getPrismaClient();
    const reviewId = crypto.randomUUID();

    if (prisma) {
      return await prisma.$transaction(async (tx) => {
        const review = await tx.reviewAction.create({
          data: {
            id: reviewId,
            diligenceId,
            userId: userId || null,
            entityType,
            entityId,
            action,
            previousStatus,
            newStatus,
            justification,
            reviewedBy,
          },
        });

        if (entityType === 'pep_match') {
          await tx.pepMatch.updateMany({
            where: { id: entityId, diligenceId },
            data: { reviewStatus: newStatus },
          });
        } else if (entityType === 'adverse_media') {
          await tx.adverseMediaResult.updateMany({
            where: { id: entityId, diligenceId },
            data: { status: newStatus },
          });
        } else if (entityType === 'process_discovery') {
          await tx.processDiscovery.updateMany({
            where: { id: entityId, diligenceId },
            data: { status: newStatus },
          });
        } else if (entityType === 'egos_finding') {
          const finding = await tx.egosFinding.findFirst({
            where: { id: entityId, run: { diligenceId } },
          });
          if (!finding) throw new Error('Item EGOS não localizado nesta diligência.');
          await tx.egosFinding.update({
            where: { id: entityId },
            data: { reviewStatus: newStatus },
          });
        } else if (entityType === 'egos_resolution') {
          const resolution = await tx.egosResolution.findFirst({
            where: { id: entityId, run: { diligenceId } },
          });
          if (!resolution) throw new Error('Resolução de identidade não localizada nesta diligência.');
          await tx.egosResolution.update({
            where: { id: entityId },
            data: { reviewStatus: newStatus },
          });
        }

        await tx.auditEvent.create({
          data: {
            id: crypto.randomUUID(),
            diligenceId,
            userId: userId || null,
            eventType: 'review',
            message: `Ação registrada (${entityType}): status alterado de "${previousStatus || 'inicial'}" para "${newStatus}". Justificativa: ${justification || 'Não informada'}.`,
            actor: reviewedBy,
          },
        });

        return review;
      });
    }

    return {
      id: reviewId,
      diligenceId,
      userId: userId || null,
      entityType,
      entityId,
      action,
      previousStatus,
      newStatus,
      justification,
      reviewedBy,
      reviewedAt: new Date(),
    };
  },
};

module.exports = { ReviewRepository };
