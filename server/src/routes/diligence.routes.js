// ==========================================================
// DILIGÊNCIA 360 — Rotas de Histórico e Dossiês Permanentes
// ==========================================================

const express = require('express');
const { DiligenceHistoryService } = require('../services/diligence-history.service');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { isScoreWithinLevel } = require('../services/risk-assessment.service');

const router = express.Router();

router.use(authenticate);

router.post('/', authorize(['admin', 'analyst']), async (req, res) => {
  try {
    const payload = req.body || {};
    if (req.user) {
      payload.createdById = req.user.id;
      payload.createdBy = { id: req.user.id, name: req.user.name };
      if (Array.isArray(payload.timeline)) {
        payload.timeline.unshift({
          time: new Date().toISOString(),
          txt: `Diligência iniciada por ${req.user.name}.`,
          tipo: 'info',
          userId: req.user.id,
        });
      }
    }

    const result = await DiligenceHistoryService.saveDiligence(payload);

    if (!result.persisted) {
      return res.status(503).json({
        ok: false,
        persisted: false,
        id: result.id,
        erro: result.aviso || 'Banco de dados PostgreSQL indisponível. Dossiê não persistido permanentemente.',
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao salvar diligência:', err.message);
    return res.status(500).json({ ok: false, persisted: false, erro: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const filters = {
      status: req.query.status,
      responsibleId: req.query.responsibleId,
      reviewerId: req.query.reviewerId,
      cnpj: req.query.cnpj,
      level: req.query.level,
    };
    const list = await DiligenceHistoryService.listDiligences(limit, filters);
    return res.json({ ok: true, count: list.length, items: list });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao listar histórico:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const diligence = await DiligenceHistoryService.getDiligenceById(id);

    if (!diligence) {
      return res.status(404).json({ ok: false, erro: 'Dossiê de diligência não encontrado.' });
    }

    return res.json({ ok: true, data: diligence });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao recuperar dossiê:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post('/:id/reviews', authorize(['admin', 'analyst', 'reviewer']), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.body?.entityType === 'egos_finding' && String(req.body?.justification || '').trim().length < 5) {
      return res.status(400).json({ ok: false, erro: 'Informe uma justificativa objetiva para registrar a decisão.' });
    }
    const reviewData = {
      ...req.body,
      diligenceId: id,
      userId: req.user ? req.user.id : undefined,
      reviewedBy: req.user ? req.user.name : (req.body.reviewedBy || 'Auditor Compliance'),
    };
    const review = await DiligenceHistoryService.recordReview(reviewData);
    return res.status(201).json({ ok: true, data: review });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao registrar revisão:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.patch('/:id/risk', authorize(['admin', 'analyst', 'reviewer']), async (req, res) => {
  try {
    const score = Number(req.body?.score);
    const level = String(req.body?.level || '').trim();
    const justification = String(req.body?.justification || '').trim();
    const allowedLevels = new Set(['Atenção Baixa', 'Atenção Moderada', 'Atenção Elevada', 'Atenção Crítica']);

    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return res.status(400).json({ ok: false, erro: 'Informe uma pontuação entre 0 e 100.' });
    }
    if (!allowedLevels.has(level)) {
      return res.status(400).json({ ok: false, erro: 'Selecione um nível de risco válido.' });
    }
    if (!isScoreWithinLevel(level, score)) {
      return res.status(400).json({ ok: false, erro: 'A pontuação informada não pertence à faixa do nível selecionado.' });
    }
    if (justification.length < 10) {
      return res.status(400).json({ ok: false, erro: 'Registre uma justificativa objetiva com pelo menos 10 caracteres.' });
    }

    const risk = await DiligenceHistoryService.overrideRisk({
      diligenceId: req.params.id,
      userId: req.user?.id,
      score,
      level,
      justification,
      reviewedBy: req.user?.name || 'Auditor Compliance SUAPE',
    });
    return res.json({ ok: true, data: risk });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao ajustar risco:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.delete('/:id', authorize(['admin', 'analyst']), async (req, res) => {
  try {
    const { id } = req.params;
    await DiligenceHistoryService.deleteDiligence(id);
    return res.json({ ok: true, message: 'Dossiê excluído com sucesso.' });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao excluir dossiê:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

module.exports = router;
