// ==========================================================
// DILIGÊNCIA 360 — Rotas de Emissão e Download de Dossiês PDF
// ==========================================================

const express = require('express');
const { DiligenceReportService } = require('../services/report/diligence-report.service');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

// 1. Download do Dossiê Executivo em PDF
router.all(
  '/:id/report',
  async (req, res) => {
    try {
      const { id } = req.params;
      const isPreview = req.query.preview === 'true' || req.body?.preview === true;
      const providedDiligence = req.body?.diligence || req.body?.snapshot;

      const report = await DiligenceReportService.generateDiligenceReport(id, req.user, {
        isPreview,
        diligence: providedDiligence,
      });

      res.setHeader('Content-Type', report.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
      res.setHeader('X-Report-Hash', report.hashValue);
      res.setHeader('X-Report-Number', report.reportNumber);
      res.setHeader('X-Report-Version', String(report.version));

      return res.send(report.buffer);
    } catch (err) {
      console.error('[ReportRoutes] Erro na emissão do relatório PDF:', err.message);
      return res.status(400).json({ ok: false, erro: err.message });
    }
  }
);

// 2. Histórico de Versões do Relatório
router.get(
  '/:id/reports',
  async (req, res) => {
    try {
      const { id } = req.params;
      const reports = await DiligenceReportService.listReports(id);
      return res.json({ ok: true, count: reports.length, items: reports });
    } catch (err) {
      return res.status(500).json({ ok: false, erro: err.message });
    }
  }
);

// 3. Relatório contextual da entidade selecionada na rede
router.all(
  '/:id/entity-report',
  async (req, res) => {
    try {
      const entityId = String(req.query.entityId || req.body?.entityId || '');
      const providedDiligence = req.body?.diligence || req.body?.snapshot;

      const report = await DiligenceReportService.generateEntityReport(
        req.params.id,
        entityId,
        req.user,
        { diligence: providedDiligence }
      );

      res.setHeader('Content-Type', report.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
      res.setHeader('X-Report-Hash', report.hashValue);
      res.setHeader('X-Report-Number', report.reportNumber);
      return res.send(report.buffer);
    } catch (err) {
      console.error('[ReportRoutes] Erro no relatório contextual:', err.message);
      return res.status(400).json({ ok: false, erro: err.message });
    }
  }
);

module.exports = router;
