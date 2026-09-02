// ==========================================================
// DILIGÊNCIA 360 — Rotas de análise do dossiê por IA gratuita
// ==========================================================

const express = require('express');
const router = express.Router();
const {
  analyzeDossier,
  buildEvidencePack,
  isConfigured,
  listProviders,
} = require('../services/ai/dossier-analysis.service');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.get('/status', (_req, res) => {
  const providers = listProviders();
  return res.json({
    ok: true,
    configurada: isConfigured(),
    provedores: providers,
    mensagem: isConfigured()
      ? 'Análise por IA disponível em provedores de cota gratuita.'
      : 'Configure GROQ_API_KEY, GEMINI_API_KEY ou GITHUB_MODELS_TOKEN para habilitar a análise por IA.',
  });
});

// Permite conferir exatamente o que seria enviado ao modelo, sem gastar cota.
router.post('/evidence-pack', (req, res) => {
  const dossier = req.body?.dossie;
  if (!dossier || typeof dossier !== 'object') {
    return res.status(400).json({ ok: false, erro: 'Envie o dossiê no campo "dossie".' });
  }
  const pack = buildEvidencePack(dossier);
  return res.json({ ok: true, ...pack });
});

router.post('/dossier-analysis', async (req, res) => {
  const dossier = req.body?.dossie;
  if (!dossier || typeof dossier !== 'object') {
    return res.status(400).json({ ok: false, erro: 'Envie o dossiê no campo "dossie".' });
  }
  if (!isConfigured()) {
    return res.status(503).json({
      ok: false,
      erro: 'Nenhum provedor de IA gratuito está configurado neste ambiente.',
      provedores: listProviders(),
    });
  }

  try {
    const result = await analyzeDossier(dossier);
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error('[AI Route] Erro interno:', err.message);
    return res.status(500).json({ ok: false, erro: 'Falha ao gerar a análise por IA.' });
  }
});

module.exports = router;
