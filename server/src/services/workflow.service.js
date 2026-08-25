// ==========================================================
// DILIGÊNCIA 360 — Workflow sem restrições de perfil
// ==========================================================

const { DiligenceRepository } = require('../repositories/diligence.repository');

function publicUser(user) {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid || user.id,
    name: user.name,
    email: user.email,
  };
}

async function transition(diligenceId, user, options) {
  const current = await DiligenceRepository.findById(diligenceId);
  if (!current) throw new Error('Diligência não encontrada.');
  const previousStatus = current.status || 'in_progress';
  if (options.validate) options.validate(current);

  await DiligenceRepository.mutate(diligenceId, (snapshot) => {
    Object.assign(snapshot, options.patch(snapshot));
  }, {
    user,
    action: options.action,
    entityType: 'workflow',
    entityId: diligenceId,
    previousStatus,
    newStatus: options.status,
    justification: options.justification,
  });
  return { ok: true, status: options.status, ...(options.response || {}) };
}

const WorkflowService = {
  async submitForReview(diligenceId, user) {
    return await transition(diligenceId, user, {
      action: 'submit',
      status: 'pending_review',
      validate(snapshot) {
        if (snapshot.status === 'completed') {
          throw new Error('Esta diligência já foi concluída e não pode ser reencaminhada.');
        }
      },
      patch: () => ({ status: 'pending_review', returnJustification: null }),
      justification: `Diligência encaminhada para revisão por ${user.name}.`,
    });
  },

  async startReview(diligenceId, user) {
    return await transition(diligenceId, user, {
      action: 'start_review',
      status: 'in_review',
      patch: () => ({ status: 'in_review', reviewedBy: publicUser(user) }),
      justification: `Revisão assumida por ${user.name}.`,
      response: { reviewer: user.name },
    });
  },

  async returnForAdjustments(diligenceId, user, justification) {
    const cleanJustification = String(justification || '').trim();
    if (!cleanJustification) {
      throw new Error('A justificativa de devolução para ajustes é obrigatória.');
    }
    return await transition(diligenceId, user, {
      action: 'return',
      status: 'returned_for_adjustments',
      patch: () => ({
        status: 'returned_for_adjustments',
        returnJustification: cleanJustification,
        reviewedBy: publicUser(user),
      }),
      justification: cleanJustification,
      response: { justification: cleanJustification },
    });
  },

  async approveAndComplete(diligenceId, user) {
    return await transition(diligenceId, user, {
      action: 'approve',
      status: 'completed',
      patch: () => ({
        status: 'completed',
        completedAt: new Date().toISOString(),
        reviewedBy: publicUser(user),
      }),
      justification: `Diligência aprovada e formalmente concluída por ${user.name}.`,
    });
  },
};

module.exports = { WorkflowService };
