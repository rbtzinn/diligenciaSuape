// ==========================================================
// DILIGÊNCIA 360 — Serviço Principal de Emissão de Dossiês PDF
// ==========================================================

const { DiligenceHistoryService } = require('../diligence-history.service');
const { DiligenceRepository } = require('../../repositories/diligence.repository');
const { ReportRepository } = require('../../repositories/report.repository');
const { ReportGenerator } = require('./report-generator');
const { sanitizeFileName, generateReportNumber } = require('./report-formatter');
const { getEntityReportContext } = require('./entity-report-context');

const DiligenceReportService = {
  async generateDiligenceReport(diligenceId, user, { isPreview = false, diligence: providedDiligence } = {}) {
    // 1. Carrega dados (utiliza o snapshot fornecido pelo cliente se existir, ou busca no histórico)
    const diligence = providedDiligence || await DiligenceHistoryService.getDiligenceById(diligenceId);
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
    let nextVersion = 1;
    try {
      const lastVersion = await ReportRepository.getLatestVersion(diligence.id);
      nextVersion = lastVersion + 1;
    } catch {
      // Se indisponível, usa versão padrão
    }

    const safeName = sanitizeFileName(diligence.razaoSocial || 'EMPRESA');
    const fileName = `${reportNumber}_${safeName}_${diligence.cnpj}.pdf`;

    // 3. Renderiza PDF e gera hash SHA-256
    const { buffer, hashValue } = await ReportGenerator.generateBuffer(
      diligence,
      reportNumber,
      !isCompleted || isPreview
    );

    // 4. Registra metadados e evento de auditoria em segundo plano (sem travar a entrega do PDF)
    Promise.allSettled([
      ReportRepository.createReport({
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
      }),
      DiligenceRepository.appendAudit({
        diligenceId: diligence.id,
        user,
        userId: user ? user.id : null,
        entityType: 'report',
        entityId: diligence.id,
        action: 'generate_pdf',
        previousStatus: diligence.status,
        newStatus: diligence.status,
        justification: `Dossiê executivo em PDF emitido (Versão ${nextVersion}, Hash SHA-256: ${hashValue.substring(0, 16)}...).`,
        reviewedBy: user ? user.name : 'Sistema / Diligência 360',
      }),
    ]).catch((err) => console.warn('[DiligenceReportService] Falha na auditoria do PDF:', err?.message));

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

  async generateEntityReport(diligenceId, entityId, user, { diligence: providedDiligence } = {}) {
    const diligence = providedDiligence || await DiligenceHistoryService.getDiligenceById(diligenceId);
    if (!diligence) throw new Error('Dossiê histórico não encontrado.');
    if (!entityId) throw new Error('Selecione uma entidade para gerar o relatório.');

    const context = getEntityReportContext(diligence, entityId);
    const reportNumber = `${generateReportNumber(diligence.id)}-ENT`;
    const safeEntityName = sanitizeFileName(context.entity.name || 'ENTIDADE');
    const fileName = `${reportNumber}_${safeEntityName}_EVIDENCIAS.pdf`;
    const { buffer, hashValue } = await ReportGenerator.generateEntityBuffer(
      diligence,
      reportNumber,
      context
    );

    // Registra evento de auditoria sem bloquear a resposta do PDF
    DiligenceRepository.appendAudit({
      diligenceId: diligence.id,
      user,
      userId: user ? user.id : null,
      entityType: 'entity',
      entityId: context.entity.id,
      action: 'generate_entity_evidence_pdf',
      previousStatus: diligence.status,
      newStatus: diligence.status,
      justification: `Relatório contextual de evidências emitido para ${context.entity.name} (Hash SHA-256: ${hashValue.substring(0, 16)}...).`,
      reviewedBy: user ? user.name : 'Sistema / Diligência 360',
    }).catch((err) => console.warn('[DiligenceReportService] Falha na auditoria da entidade:', err?.message));

    return {
      buffer,
      fileName,
      hashValue,
      reportNumber,
      mimeType: 'application/pdf',
      entityName: context.entity.name,
    };
  },
};

module.exports = { DiligenceReportService };
