// ==========================================================
// DILIGÊNCIA 360 — Rotas de Mídia Adversa e Ocorrências Públicas
// ==========================================================

const express = require('express');
const router = express.Router();
const { AdverseMediaService } = require('../services/adverse-media.service');
const { authenticate } = require('../middlewares/auth.middleware');

const adverseMediaService = new AdverseMediaService();
router.use(authenticate);

router.post('/search', async (req, res) => {
  const { cnpj, razaoSocial, nomeFantasia, municipio, uf, shareholders, forceRefresh } = req.body || {};

  if (!cnpj && !razaoSocial) {
    return res.status(400).json({
      ok: false,
      status: 400,
      erro: 'Informe ao menos o CNPJ ou a Razão Social da empresa.',
    });
  }

  try {
    const result = await adverseMediaService.searchAdverseMedia(
      // Município e UF são âncoras de identidade: confirmam a empresa quando o
      // nome, sozinho, seria ambíguo. Ausentes, a resolução apenas não pontua.
      { cnpj, razaoSocial, nomeFantasia, municipio, uf },
      Array.isArray(shareholders) ? shareholders : [],
      { forceRefresh: forceRefresh === true }
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
