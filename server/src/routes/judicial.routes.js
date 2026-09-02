// ==========================================================
// DILIGÊNCIA 360 — Rotas Judiciais (DataJud / CNJ)
// ==========================================================

const express = require('express');
const DatajudService = require('../services/datajud.service');
const { TcePeService } = require('../services/tce-pe.service');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate);

// Consulta e enriquecimento de processo por numeração CNJ
router.get('/processo/:numero', async (req, res) => {
  const result = await DatajudService.consultarProcesso(req.params.numero);
  res.status(result.status || 200).json(result);
});

// Processos de controle externo do TCE-PE pesquisados pelo nome do interessado.
router.post('/tce-pe', async (req, res) => {
  const result = await TcePeService.searchCompany(req.body || {});
  res.status(result.status || 200).json(result);
});

module.exports = router;
