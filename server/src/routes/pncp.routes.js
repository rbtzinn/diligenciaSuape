// ==========================================================
// DILIGÊNCIA 360 — Rotas do PNCP (contratações públicas)
// ==========================================================

const express = require('express');
const router = express.Router();
const { PncpService } = require('../services/pncp.service');
const { authenticate } = require('../middlewares/auth.middleware');

router.use(authenticate);

router.post('/contratos', async (req, res) => {
  const { cnpj, razaoSocial, nomeFantasia } = req.body || {};

  if (!cnpj && !razaoSocial) {
    return res.status(400).json({
      ok: false,
      erro: 'Informe ao menos o CNPJ ou a razão social da empresa.',
    });
  }

  try {
    const result = await PncpService.search({ cnpj, razaoSocial, nomeFantasia });
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error('[PNCP Route] Erro interno:', err.message);
    return res.status(502).json({
      ok: false,
      erro: 'Falha ao consultar o PNCP.',
      contratos: [],
      contratacoes: [],
    });
  }
});

module.exports = router;
