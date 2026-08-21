// ==========================================================
// DILIGÊNCIA 360 — Repositório de Relatórios e Dossiês (PDF)
// ==========================================================

const { getPrismaClient } = require('../config/database');
const crypto = require('crypto');

const memoryReports = new Map();

const ReportRepository = {
  async createReport(data) {
    const id = data.id || crypto.randomUUID();
    const record = {
      id,
      diligenceId: data.diligenceId,
      version: data.version || 1,
      reportNumber: data.reportNumber,
      fileName: data.fileName,
      mimeType: data.mimeType || 'application/pdf',
      hashAlgorithm: data.hashAlgorithm || 'SHA-256',
      hashValue: data.hashValue,
      generatedById: data.generatedById || null,
      generatedAt: data.generatedAt || new Date(),
    };

    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.diligenceReport.create({
        data: record,
        include: {
          generatedBy: { select: { id: true, name: true, email: true } },
        },
      });
    }

    memoryReports.set(id, record);
    return record;
  },

  async listByDiligenceId(diligenceId) {
    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.diligenceReport.findMany({
        where: { diligenceId },
        orderBy: { version: 'desc' },
        include: {
          generatedBy: { select: { id: true, name: true, email: true } },
        },
      });
    }

    return Array.from(memoryReports.values())
      .filter((r) => r.diligenceId === diligenceId)
      .sort((a, b) => b.version - a.version);
  },

  async getLatestVersion(diligenceId) {
    const list = await this.listByDiligenceId(diligenceId);
    return list.length > 0 ? list[0].version : 0;
  },
};

module.exports = { ReportRepository };
