// ==========================================================
// DILIGÊNCIA 360 — Repositório de Revisões Humanas
// ==========================================================

const { getPrismaClient } = require('../config/database');
const crypto = require('crypto');

const ReviewRepository = {
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
