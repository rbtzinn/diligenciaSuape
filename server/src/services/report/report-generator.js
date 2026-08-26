// ==========================================================
// DILIGÊNCIA 360 — Motor Gerador de PDF Institucional (PDFKit)
// ==========================================================

const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const { ReportSections } = require('./report-sections');
const { EntityReportSections } = require('./entity-report-sections');

function collectPdf(doc, render) {
  return new Promise((resolve, reject) => {
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(buffers);
      resolve({
        buffer,
        hashValue: crypto.createHash('sha256').update(buffer).digest('hex'),
      });
    });
    doc.on('error', reject);

    try {
      render(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

const ReportGenerator = {
  async generateBuffer(diligence, reportNumber, isPreview = false) {
    const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          bufferPages: true,
          autoFirstPage: true,
          info: {
            Title: `Dossiê Executivo - ${reportNumber}`,
            Author: 'Complexo Portuário de Suape • Diligência 360',
            Subject: `Diligência de Integridade - ${diligence.razaoSocial}`,
            Keywords: 'SUAPE, compliance, diligência, integridade, terceiros',
          },
        });

    return collectPdf(doc, () => {
        const emittedAt = new Date().toISOString();
        ReportSections.renderReport(doc, diligence, reportNumber, { isPreview, emittedAt });

        // Numeração, registro e data de emissão em todas as páginas.
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          ReportSections.renderPageFooter(doc, i + 1, range.count, reportNumber, emittedAt);
        }
    });
  },

  async generateEntityBuffer(diligence, reportNumber, context) {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: `Relatório de Evidências - ${context.entity.name}`,
        Author: 'Complexo Portuário de Suape - Diligência 360',
        Subject: `Evidências e vínculos da entidade ${context.entity.name}`,
        Keywords: 'SUAPE, compliance, evidências, vínculos, fontes, notícias',
      },
    });

    return collectPdf(doc, () => {
      const emittedAt = new Date().toISOString();
      EntityReportSections.renderReport(doc, diligence, reportNumber, context, { emittedAt });
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        EntityReportSections.renderPageFooter(doc, i + 1, range.count, reportNumber, emittedAt);
      }
    });
  },
};

module.exports = { ReportGenerator };
