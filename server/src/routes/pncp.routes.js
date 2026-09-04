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
      sourceStatus: 'ERROR',
      erro: 'Informe ao menos o CNPJ ou a razão social da empresa.',
    });
  }

  try {
    const result = await PncpService.search({ cnpj, razaoSocial, nomeFantasia });
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error('[PNCP Route] Erro interno:', err.message);
    // Falha inesperada do próprio Diligência 360 é ERROR, não EMPTY. A lista
    // vazia que ela produz não pode ser lida como ausência de contrato.
    return res.status(502).json({
      ok: false,
      sourceStatus: 'ERROR',
      erro: 'Falha ao consultar o PNCP.',
      aviso: 'A consulta não foi concluída. A ausência de contrato na tela não é conclusão sobre a empresa.',
      contratos: [],
      contratacoes: [],
      consultadoEm: new Date().toISOString(),
    });
  }
});

module.exports = router;
