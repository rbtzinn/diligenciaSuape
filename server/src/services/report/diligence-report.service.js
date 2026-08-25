// ==========================================================
// DILIGÊNCIA 360 — Serviço Principal de Emissão de Dossiês PDF
// ==========================================================

const { DiligenceHistoryService } = require('../diligence-history.service');
const { ReportRepository } = require('../../repositories/report.repository');
const { ReviewRepository } = require('../../repositories/review.repository');
const { ReportGenerator } = require('./report-generator');
const { sanitizeFileName, generateReportNumber } = require('./report-formatter');

const DiligenceReportService = {
  async generateDiligenceReport(diligenceId, user, { isPreview = false } = {}) {
    // 1. Carrega dados EXCLUSIVAMENTE do snapshot histórico
    const diligence = await DiligenceHistoryService.getDiligenceById(diligenceId);
    if (!diligence) {
      throw new Error('Dossiê histórico não encontrado.');
    }

    const isCompleted = diligence.status === 'completed';
    if (!isCompleted && !isPreview) {
      throw new Error(
        'O dossiê oficial definitivo só pode ser gerado após a aprovação e conclusão formal da diligência. Utilize a opção de prévia se desejar conferência intermediária.'
      );
    }

    // 2. Determina número humano e versão
    const reportNumber = generateReportNumber(diligence.id);
    const lastVersion = await ReportRepository.getLatestVersion(diligence.id);
    const nextVersion = lastVersion + 1;

    const safeName = sanitizeFileName(diligence.razaoSocial || 'EMPRESA');
    const fileName = `${reportNumber}_${safeName}_${diligence.cnpj}.pdf`;

    // 3. Renderiza PDF e gera hash SHA-256
    const { buffer, hashValue } = await ReportGenerator.generateBuffer(
      diligence,
      reportNumber,
      !isCompleted || isPreview
    );

    // 4. Registra metadados e versão do relatório emitido
    const reportRecord = await ReportRepository.createReport({
      diligenceId: diligence.id,
      version: nextVersion,
      reportNumber,
      fileName,
      mimeType: 'application/pdf',
      hashAlgorithm: 'SHA-256',
      hashValue,
      generatedBy: user || null,
      generatedById: user ? user.id : null,
      generatedAt: new Date(),
    });

    // 5. Registra evento de auditoria
    await ReviewRepository.recordAction({
      diligenceId: diligence.id,
      user,
      userId: user ? user.id : null,
      entityType: 'report',
      entityId: reportRecord.id,
      action: 'generate_pdf',
      previousStatus: diligence.status,
      newStatus: diligence.status,
      justification: `Dossiê executivo em PDF emitido (Versão ${nextVersion}, Hash SHA-256: ${hashValue.substring(0, 16)}...).`,
      reviewedBy: user ? user.name : 'Sistema / Diligência 360',
    });

    return {
      buffer,
      fileName,
      hashValue,
      reportNumber,
      version: nextVersion,
      mimeType: 'application/pdf',
    };
  },

  async listReports(diligenceId) {
    return await ReportRepository.listByDiligenceId(diligenceId);
  },
};

module.exports = { DiligenceReportService };
