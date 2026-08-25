// ==========================================================
// DILIGÊNCIA 360 — Rota de Status e Diagnóstico de Saúde
// ==========================================================

const express = require('express');
const CguService = require('../services/cgu.service');
const DatajudService = require('../services/datajud.service');
const { checkDatabaseHealth, getPrismaClient } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  let internalSuape = { available: false, people: 0, referencePeriod: null };
  if (dbHealth.connected) {
    const prisma = await getPrismaClient();
    const dataset = prisma ? await prisma.internalDataset.findFirst({ where: { status: 'active' }, orderBy: { importedAt: 'desc' } }) : null;
    if (dataset) internalSuape = { available: true, people: dataset.uniquePersonCount, referencePeriod: dataset.referencePeriod };
  }

  res.json({
    status: dbHealth.connected ? 'online' : 'degraded',
    backend: 'online',
    database: {
      connected: dbHealth.connected,
      provider: 'PostgreSQL',
      ...(!dbHealth.connected ? { message: 'Persistência permanente indisponível.' } : {}),
    },
    cguConfigurada: CguService.isConfigured(),
    buscaWebConfigurada: true,
    datajudConfigurada: DatajudService.isConfigured(),
    internalSuape,
    versao: '2.0.0-modular',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
