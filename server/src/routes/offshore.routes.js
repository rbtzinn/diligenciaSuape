const express = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { OffshoreService } = require('../services/offshore.service');

const router = express.Router();
router.use(authenticate);

router.post('/search', async (req, res) => {
  const { company, shareholders } = req.body || {};
  if (!company?.razaoSocial) return res.status(400).json({ ok: false, erro: 'Informe a empresa para a reconciliação offshore.' });
  const result = await OffshoreService.search({ company, shareholders });
  return res.status(result.status || 200).json(result);
});

module.exports = router;
