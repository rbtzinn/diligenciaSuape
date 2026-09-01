// ==========================================================
// DILIGÊNCIA 360 — Status dos provedores e da persistência
// ==========================================================

const express = require('express');
const CguService = require('../services/cgu.service');
const DatajudService = require('../services/datajud.service');
const { checkGoogleSheetsHealth } = require('../config/google-sheets');
const { CompositeSearchProvider } = require('../services/search/composite-search.provider');
const { InternalSuapeProvider } = require('../egos/adapters/internal-suape/internal-suape.provider');

const router = express.Router();
const mediaSearchProvider = new CompositeSearchProvider({ persistentUse: true });

router.get('/', async (_req, res) => {
  const storage = await checkGoogleSheetsHealth();
  const internalSuape = await InternalSuapeProvider.load();

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
    buscaWebConfigurada: mediaSearchProvider.isConfigured(),
    buscaMidia: {
      configured: mediaSearchProvider.isConfigured(),
      providers: mediaSearchProvider.providers.map((provider) => {
        const configured = typeof provider.isConfigured !== 'function' || provider.isConfigured();
        const persistenceAllowed = typeof provider.allowsPersistentUse !== 'function'
          || provider.allowsPersistentUse();
        return {
          id: provider.id || provider.constructor?.name,
          configured,
          enabledForDossier: configured && persistenceAllowed,
        };
      }),
    },
    datajudConfigurada: DatajudService.isConfigured(),
    internalSuape: {
      available: internalSuape.available,
      people: internalSuape.people.length,
      referencePeriod: internalSuape.dataset?.referencePeriod || null,
      sheets: internalSuape.dataset?.sheets || [],
      payrollValuesImported: false,
      message: internalSuape.available
        ? `Identidades funcionais carregadas da base autorizada. Remuneração não é importada.`
        : internalSuape.message || 'Base interna opcional não configurada nesta implantação.',
    },
    versao: '3.0.0-firebase-sheets',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
