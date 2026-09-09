// ==========================================================
// DILIGÊNCIA 360 — Rotas de Mídia Adversa e Ocorrências Públicas
// ==========================================================

const express = require('express');
const router = express.Router();
const { AdverseMediaService } = require('../services/adverse-media.service');
const { authenticate } = require('../middlewares/auth.middleware');

const { CompositeSearchProvider } = require('../services/search/composite-search.provider');
const adverseMediaService = new AdverseMediaService();
const freeProvider = new CompositeSearchProvider({ persistentUse: true, freeOnly: true });
freeProvider.cacheScope = 'free-news';
const freeNewsService = new AdverseMediaService(freeProvider);
router.use(authenticate);

router.post('/search', async (req, res) => {
  const { cnpj, razaoSocial, nomeFantasia, municipio, uf, shareholders, forceRefresh, newsOnly, subjectName, queryOffset } = req.body || {};

  if (!cnpj && !razaoSocial) {
    return res.status(400).json({
      ok: false,
      status: 400,
      erro: 'Informe ao menos o CNPJ ou a Razão Social da empresa.',
    });
  }

  try {
    const result = await (newsOnly === true ? freeNewsService : adverseMediaService).searchAdverseMedia(
      // Município e UF são âncoras de identidade: confirmam a empresa quando o
      // nome, sozinho, seria ambíguo. Ausentes, a resolução apenas não pontua.
      { cnpj, razaoSocial, nomeFantasia, municipio, uf },
      Array.isArray(shareholders) ? shareholders : [],
      { forceRefresh: forceRefresh === true, newsOnly: newsOnly === true, subjectName: typeof subjectName === 'string' ? subjectName.slice(0, 200) : '', queryOffset: Number.isSafeInteger(queryOffset) && queryOffset >= 0 ? queryOffset : 0 }
    );

    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error('[Adverse Media Route] Erro interno:', err.message);
    return res.status(500).json({
      ok: false,
      status: 500,
      erro: 'Falha ao processar pesquisa de mídia adversa.',
    });
  }
});

module.exports = router;
