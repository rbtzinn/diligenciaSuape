// ==========================================================
// DILIGÊNCIA 360 — Rotas Cadastrais de Empresas
// ==========================================================

const express = require('express');
const CompanyService = require('../services/company.service');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();
router.use(authenticate);

router.post('/network', async (req, res) => {
  const { rootCompany, maxDepth, maxCompanies } = req.body || {};
  const result = await CompanyService.expandCorporateNetwork(rootCompany, {
    maxDepth: Math.min(3, Math.max(1, Number(maxDepth) || 2)),
    maxCompanies: Math.min(30, Math.max(1, Number(maxCompanies) || 20)),
  });
  res.status(result.status || 200).json(result);
});

router.get('/:cnpj', async (req, res) => {
  const result = await CompanyService.getCompanyByCNPJ(req.params.cnpj);
  res.status(result.status || 200).json(result);
});

module.exports = router;
