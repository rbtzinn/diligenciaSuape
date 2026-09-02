// ==========================================================
// DILIGÊNCIA 360 — Rotas do Portal da Transparência (CGU)
// ==========================================================

const express = require('express');
const CguService = require('../services/cgu.service');
const { PersonSanctionsService } = require('../services/person-sanctions.service');
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

// Contratos e pagamentos do Executivo Federal — vínculo exato por CNPJ.
router.get('/federal-exposure/:cnpj', async (req, res) => {
  const result = await CguService.getFederalExposure(req.params.cnpj);
  res.status(result.status || 200).json(result);
});

// PEP — Pessoas Expostas Politicamente
router.get('/pep', async (req, res) => {
  const result = await CguService.getPEP(req.query.nome);
  res.status(result.status || 200).json(result);
});

// Rastreio nominal de sócios pessoa física em CEIS e CNEP.
// Fonte indisponível é lacuna de cobertura declarada no corpo, não erro HTTP:
// o dossiê precisa registrar a tentativa mesmo quando a CGU não responde.
router.post('/person-sanctions', async (req, res) => {
  const result = await PersonSanctionsService.screen(req.body?.shareholders || []);
  res.json(result);
});

module.exports = router;
