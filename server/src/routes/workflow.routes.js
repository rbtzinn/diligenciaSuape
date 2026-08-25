// ==========================================================
// DILIGÊNCIA 360 — Rotas de Workflow e Mudança de Estado
// ==========================================================

const express = require('express');
const { WorkflowService } = require('../services/workflow.service');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

// 1. Enviar para revisão — qualquer usuário autenticado pode executar.
router.post('/:id/submit', async (req, res) => {
  try {
    const result = await WorkflowService.submitForReview(req.params.id, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

// 2. Iniciar revisão — qualquer usuário autenticado pode executar.
router.post('/:id/start-review', async (req, res) => {
  try {
    const result = await WorkflowService.startReview(req.params.id, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

// 3. Devolver para ajustes — qualquer usuário autenticado pode executar.
router.post('/:id/return', async (req, res) => {
  try {
    const { justification } = req.body || {};
    const result = await WorkflowService.returnForAdjustments(req.params.id, req.user, justification);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

// 4. Aprovar e concluir — qualquer usuário autenticado pode executar.
router.post('/:id/approve', async (req, res) => {
  try {
    const result = await WorkflowService.approveAndComplete(req.params.id, req.user);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

module.exports = router;
