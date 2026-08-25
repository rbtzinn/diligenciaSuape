// ==========================================================
// DILIGÊNCIA 360 — Metadados de relatórios no Google Sheets
// ==========================================================

const crypto = require('crypto');
const { getGoogleSheetsClient } = require('../config/google-sheets');

function mapReport(row) {
  return {
    id: String(row[0] || ''),
    diligenceId: String(row[1] || ''),
    version: Number(row[2] || 1),
    reportNumber: String(row[3] || ''),
    fileName: String(row[4] || ''),
    mimeType: String(row[5] || 'application/pdf'),
    hashAlgorithm: String(row[6] || 'SHA-256'),
    hashValue: String(row[7] || ''),
    generatedById: String(row[8] || '') || null,
    generatedBy: row[8] || row[9] || row[10] ? {
      id: String(row[8] || ''),
      firebaseUid: String(row[8] || ''),
      email: String(row[9] || ''),
      name: String(row[10] || ''),
    } : null,
    generatedAt: String(row[11] || ''),
  };
}

const ReportRepository = {
  async createReport(data) {
    const generatedBy = data.generatedBy || {};
    const record = {
      id: data.id || crypto.randomUUID(),
      diligenceId: data.diligenceId,
      version: data.version || 1,
      reportNumber: data.reportNumber,
      fileName: data.fileName,
      mimeType: data.mimeType || 'application/pdf',
      hashAlgorithm: data.hashAlgorithm || 'SHA-256',
      hashValue: data.hashValue,
      generatedById: generatedBy.firebaseUid || generatedBy.id || data.generatedById || null,
      generatedBy: generatedBy.id ? generatedBy : null,
      generatedAt: (data.generatedAt || new Date()).toISOString?.() || String(data.generatedAt),
    };

    await getGoogleSheetsClient().appendValues('Relatorios!A:L', [[
      record.id,
      record.diligenceId,
      record.version,
      record.reportNumber,
      record.fileName,
      record.mimeType,
      record.hashAlgorithm,
      record.hashValue,
      record.generatedById || '',
      generatedBy.email || '',
      generatedBy.name || '',
      record.generatedAt,
    ]]);
    return record;
  },

  async listByDiligenceId(diligenceId) {
    const rows = await getGoogleSheetsClient().getValues('Relatorios!A:L');
    return rows
      .slice(1)
      .map(mapReport)
      .filter((record) => record.diligenceId === diligenceId)
      .sort((left, right) => right.version - left.version);
  },

  async getLatestVersion(diligenceId) {
    const list = await this.listByDiligenceId(diligenceId);
    return list.length > 0 ? list[0].version : 0;
  },
};

module.exports = { ReportRepository };
