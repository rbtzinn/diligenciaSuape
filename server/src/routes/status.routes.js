// ==========================================================
// DILIGÊNCIA 360 — Status dos provedores e da persistência
// ==========================================================

const express = require('express');
const CguService = require('../services/cgu.service');
const DatajudService = require('../services/datajud.service');
const { checkGoogleSheetsHealth } = require('../config/google-sheets');

const router = express.Router();

router.get('/', async (_req, res) => {
  const storage = await checkGoogleSheetsHealth();

  res.json({
    status: storage.connected ? 'online' : 'degraded',
    backend: 'online',
    database: {
      connected: storage.connected,
      provider: 'Google Sheets',
      ...(!storage.connected ? { message: storage.message || 'Persistência permanente indisponível.' } : {}),
    },
    storage: {
      connected: storage.connected,
      provider: 'Google Sheets',
    },
    cguConfigurada: CguService.isConfigured(),
    buscaWebConfigurada: true,
    datajudConfigurada: DatajudService.isConfigured(),
    internalSuape: {
      available: false,
      people: 0,
      referencePeriod: null,
      message: 'Base interna opcional não configurada nesta implantação.',
    },
    versao: '3.0.0-firebase-sheets',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
