// ==========================================================
// DILIGÊNCIA 360 — Motor Gerador de PDF Institucional (PDFKit)
// ==========================================================

const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const { ReportSections } = require('./report-sections');
const { formatDateTime } = require('./report-formatter');

const ReportGenerator = {
  async generateBuffer(diligence, reportNumber, isPreview = false) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 45, left: 40, right: 40 },
          bufferPages: true,
          info: {
            Title: `Dossiê Executivo - ${reportNumber}`,
            Author: 'Complexo Portuário de Suape • Diligência 360',
            Subject: `Diligência de Integridade - ${diligence.razaoSocial}`,
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

        // 1. Capa e Cabeçalho Institucional
        ReportSections.renderCoverAndHeader(doc, diligence, reportNumber, isPreview);

        // 2. Identificação da Empresa
        ReportSections.renderCompanyInfo(doc, diligence);

        // 3. Resumo Executivo & Conclusão
        ReportSections.renderExecutiveSummary(doc, diligence);

        // 4. Cobertura da Diligência
        ReportSections.renderCoverageTable(doc, diligence);

        // 5. Responsáveis Registrados no Sistema
        ReportSections.renderResponsibilities(doc, diligence);

        // 6. Numeração de Páginas e Rodapés Dinâmicos
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          const pageNum = i + 1;
          const totalPages = range.count;

          doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, 795).lineTo(555, 795).stroke();

          doc.fillColor('#64748B').fontSize(7.5).font('Helvetica')
            .text(
              `Diligência 360 • Reg: ${reportNumber} • Emitido em: ${formatDateTime(new Date().toISOString())}`,
              40,
              802,
              { width: 400 }
            );

          doc.text(`Página ${pageNum} de ${totalPages}`, 455, 802, { width: 100, align: 'right' });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  },
};

module.exports = { ReportGenerator };
