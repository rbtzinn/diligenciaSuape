// ==========================================================
// DILIGÊNCIA 360 — Serviço de Workflow e Transições de Estado
// ==========================================================

const { DiligenceRepository } = require('../repositories/diligence.repository');
const { ReviewRepository } = require('../repositories/review.repository');

const WorkflowService = {
  async submitForReview(diligenceId, user) {
    const diligence = await DiligenceRepository.findById(diligenceId);
    if (!diligence) throw new Error('Diligência não encontrada.');

    if (diligence.status === 'completed') {
      throw new Error('Esta diligência já foi concluída e não pode ser reencaminhada.');
    }

    await DiligenceRepository.updateDiligence(diligenceId, {
      status: 'pending_review',
      returnJustification: null,
    });

    await ReviewRepository.recordAction({
      diligenceId,
      userId: user.id,
      entityType: 'workflow',
      entityId: diligenceId,
      action: 'submit',
      previousStatus: diligence.status,
      newStatus: 'pending_review',
      justification: 'Diligência finalizada pelo analista e encaminhada para revisão formal.',
      reviewedBy: user.name,
    });

    return { ok: true, status: 'pending_review' };
  },

  async startReview(diligenceId, user) {
    const diligence = await DiligenceRepository.findById(diligenceId);
    if (!diligence) throw new Error('Diligência não encontrada.');

    await DiligenceRepository.updateDiligence(diligenceId, {
      status: 'in_review',
      reviewedById: user.id,
    });

    await ReviewRepository.recordAction({
      diligenceId,
      userId: user.id,
      entityType: 'workflow',
      entityId: diligenceId,
      action: 'start_review',
      previousStatus: diligence.status,
      newStatus: 'in_review',
      justification: `Revisão assumida por ${user.name}.`,
      reviewedBy: user.name,
    });

    return { ok: true, status: 'in_review', reviewer: user.name };
  },

  async returnForAdjustments(diligenceId, user, justification) {
    if (!justification || !justification.trim()) {
      throw new Error('A justificativa de devolução para ajustes é obrigatória.');
    }

    const diligence = await DiligenceRepository.findById(diligenceId);
    if (!diligence) throw new Error('Diligência não encontrada.');

    await DiligenceRepository.updateDiligence(diligenceId, {
      status: 'returned_for_adjustments',
      returnJustification: justification.trim(),
      reviewedById: user.id,
    });

    await ReviewRepository.recordAction({
      diligenceId,
      userId: user.id,
      entityType: 'workflow',
      entityId: diligenceId,
      action: 'return',
      previousStatus: diligence.status,
      newStatus: 'returned_for_adjustments',
      justification: justification.trim(),
      reviewedBy: user.name,
    });

    return { ok: true, status: 'returned_for_adjustments', justification: justification.trim() };
  },

  async approveAndComplete(diligenceId, user) {
    const diligence = await DiligenceRepository.findById(diligenceId);
    if (!diligence) throw new Error('Diligência não encontrada.');

    await DiligenceRepository.updateDiligence(diligenceId, {
      status: 'completed',
      completedAt: new Date(),
      reviewedById: user.id,
    });

    await ReviewRepository.recordAction({
      diligenceId,
      userId: user.id,
      entityType: 'workflow',
      entityId: diligenceId,
      action: 'approve',
      previousStatus: diligence.status,
      newStatus: 'completed',
      justification: `Diligência aprovada e formalmente concluída pelo revisor ${user.name}.`,
      reviewedBy: user.name,
    });

    return { ok: true, status: 'completed' };
  },
};

module.exports = { WorkflowService };
