// ==========================================================
// DILIGÊNCIA 360 — Rotas de Workflow e Mudança de Estado
// ==========================================================

const express = require('express');
const { WorkflowService } = require('../services/workflow.service');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

// 1. Enviar para Revisão (Analista ou Admin)
router.post('/:id/submit', authorize(['admin', 'analyst']), async (req, res) => {
  try {
    const result = await WorkflowService.submitForReview(req.params.id, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

// 2. Iniciar Revisão (Revisor ou Admin)
router.post('/:id/start-review', authorize(['admin', 'reviewer']), async (req, res) => {
  try {
    const result = await WorkflowService.startReview(req.params.id, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

// 3. Devolver para Ajustes (Revisor ou Admin)
router.post('/:id/return', authorize(['admin', 'reviewer']), async (req, res) => {
  try {
    const { justification } = req.body || {};
    const result = await WorkflowService.returnForAdjustments(req.params.id, req.user, justification);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

// 4. Aprovar e Concluir Diligência (Revisor ou Admin)
router.post('/:id/approve', authorize(['admin', 'reviewer']), async (req, res) => {
  try {
    const result = await WorkflowService.approveAndComplete(req.params.id, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

module.exports = router;
