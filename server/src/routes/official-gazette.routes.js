const express = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { OfficialGazetteService } = require('../services/official-gazette.service');

const router = express.Router();
router.use(authenticate);

router.post('/search', async (req, res) => {
  const {
    cnpj,
    razaoSocial,
    nomeFantasia,
    shareholders,
    territoryIds,
    publishedSince,
  } = req.body || {};
  if (!razaoSocial) return res.status(400).json({ ok: false, erro: 'Informe a razão social da empresa.' });
  const result = await OfficialGazetteService.search(
    { cnpj, razaoSocial, nomeFantasia },
    { shareholders, territoryIds, publishedSince },
  );
  return res.status(result.status || 200).json(result);
});

module.exports = router;
