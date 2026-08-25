// ==========================================================
// DILIGÊNCIA 360 — Motor Gerador de PDF Institucional (PDFKit)
// ==========================================================

const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const { ReportSections } = require('./report-sections');

const ReportGenerator = {
  async generateBuffer(diligence, reportNumber, isPreview = false) {
    return new Promise((resolve, reject) => {
      try {
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

        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          const hashValue = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
          resolve({ buffer: pdfBuffer, hashValue });
        });
        doc.on('error', (err) => reject(err));

        const emittedAt = new Date().toISOString();
        ReportSections.renderReport(doc, diligence, reportNumber, { isPreview, emittedAt });

        // Numeração, registro e data de emissão em todas as páginas.
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          ReportSections.renderPageFooter(doc, i + 1, range.count, reportNumber, emittedAt);
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  },
};

module.exports = { ReportGenerator };
