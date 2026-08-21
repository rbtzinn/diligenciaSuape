// ==========================================================
// DILIGÊNCIA 360 — Rotas do Portal da Transparência (CGU)
// ==========================================================

const express = require('express');
const CguService = require('../services/cgu.service');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate);

// CEIS — Empresas Inidôneas e Suspensas
router.get('/ceis/:cnpj', async (req, res) => {
  const result = await CguService.getCEIS(req.params.cnpj);
  res.status(result.status || 200).json(result);
});

// CNEP — Cadastro Nacional de Empresas Punidas
router.get('/cnep/:cnpj', async (req, res) => {
  const result = await CguService.getCNEP(req.params.cnpj);
  res.status(result.status || 200).json(result);
});

// PEP — Pessoas Expostas Politicamente
router.get('/pep', async (req, res) => {
  const result = await CguService.getPEP(req.query.nome);
  res.status(result.status || 200).json(result);
});

module.exports = router;
