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
const { investigate } = require('../services/ai/investigative-leads.service');
const { CompositeSearchProvider } = require('../services/search/composite-search.provider');

const leadSearchProvider = new CompositeSearchProvider({ persistentUse: true });

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

// Última camada: aciona quando o plano fixo termina sem achado relevante.
// O modelo propõe consultas, os buscadores reais executam. As hipóteses do
// modelo voltam em quarentena e não entram no cálculo de risco.
router.post('/investigative-leads', async (req, res) => {
  const { empresa, socios, cobertura } = req.body || {};
  if (!empresa || typeof empresa !== 'object' || !(empresa.razaoSocial || empresa.cnpj)) {
    return res.status(400).json({ ok: false, erro: 'Informe a empresa com ao menos razão social ou CNPJ.' });
  }
  if (!isConfigured()) {
    return res.status(503).json({
      ok: false,
      erro: 'Nenhum provedor de IA gratuito está configurado neste ambiente.',
      provedores: listProviders(),
    });
  }

  try {
    const resultado = await investigate(
      {
        company: empresa,
        shareholders: Array.isArray(socios) ? socios : [],
        coverage: Array.isArray(cobertura) ? cobertura : [],
      },
      leadSearchProvider
    );
    return res.json(resultado);
  } catch (err) {
    console.error('[AI Leads Route] Erro interno:', err.message);
    return res.status(err.status === 429 ? 429 : 503).json({
      ok: false,
      erro: err.message || 'Falha ao gerar a busca assistida.',
      tentativas: err.attempts || [],
    });
  }
});

module.exports = router;
