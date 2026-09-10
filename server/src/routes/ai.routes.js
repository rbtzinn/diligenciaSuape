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
const newsSearchProvider = new CompositeSearchProvider({ persistentUse: true, freeOnly: true });
const { researchNews, researchInput, planNews, searchNewsQueries } = require('../services/ai/news-research.service');

router.use(authenticate);

// Planning and searches have independent deadlines. No in-memory job is needed
// on Vercel: the authenticated client holds the bounded, validated query plan.
function researchStep(work) {
  return async (req, res) => {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', onClose);
    try {
      const result = await work(req.body || {}, controller.signal);
      if (!controller.signal.aborted) res.json(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
      res.status(error.status >= 400 && error.status <= 599 ? error.status : 503).json({
        ok: false, erro: error.message || 'Não foi possível concluir esta etapa.',
        codigo: error.code, retryAfterSeconds: error.retryAfterSeconds,
      });
    } finally {
      res.off('close', onClose);
    }
  };
}

router.post('/news-research/plan', researchStep(async (body, signal) => {
  const input = researchInput(body);
  const provider = listProviders().find((p) => p.id === 'openrouter-free');
  if (!provider?.configured) {
    const error = new Error(provider?.message || 'Configure OPENROUTER_API_KEY no backend e use OPENROUTER_MODEL=openrouter/free.');
    error.status = 503;
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  return planNews(input, body.contexto, { signal });
}));

router.post('/news-research/search', researchStep((body, signal) => (
  searchNewsQueries(researchInput(body), body.consultas, newsSearchProvider, { signal })
)));

router.post('/news-research', async (req, res) => {
  const { empresa, socios } = req.body || {};
  if (!empresa || !(empresa.razaoSocial || empresa.cnpj)) {
    return res.status(400).json({ ok: false, erro: 'Informe a empresa pesquisada.' });
  }
  if (!listProviders().some((provider) => provider.id === 'openrouter-free' && provider.configured)) {
    return res.status(503).json({ ok: false, erro: 'Configure OPENROUTER_API_KEY e OPENROUTER_MODEL com um modelo :free no servidor para habilitar esta pesquisa sem consumo de modelos pagos.' });
  }
  const company = Object.fromEntries(['razaoSocial', 'nomeFantasia', 'cnpj', 'municipio', 'uf', 'atividade'].map((key) => [key, String(empresa[key] || '').slice(0, 250)]));
  const shareholders = (Array.isArray(socios) ? socios : []).slice(0, 50).map((person) => ({ nome_socio: String(person?.nome_socio || '').slice(0, 200) }));
  try {
    return res.json(await researchNews({ company, shareholders, coverage: [] }, newsSearchProvider));
  } catch {
    return res.status(503).json({ ok: false, erro: 'Não foi possível concluir a pesquisa ampliada.' });
  }
});

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
