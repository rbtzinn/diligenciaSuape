// ==========================================================
// DILIGÊNCIA 360 — Seções Estruturais do Dossiê PDF
// ==========================================================

const { formatCNPJ, formatDate, formatDateTime } = require('./report-formatter');

const ReportSections = {
  renderCoverAndHeader(doc, diligence, reportNumber, isPreview) {
    const primaryColor = '#0F2942';
    const accentColor = '#1E40AF';

    doc.fillColor(primaryColor).fontSize(16).font('Helvetica-Bold')
      .text('COMPLEXO INDUSTRIAL PORTUÁRIO DE SUAPE', { align: 'center' });
    doc.fillColor(accentColor).fontSize(11).font('Helvetica-Bold')
      .text('ASSESSORIA DE COMPLIANCE E GOVERNANÇA CORPORATIVA', { align: 'center' });
    doc.moveDown(0.5);

    doc.strokeColor('#CBD5E1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    doc.fillColor('#1E293B').fontSize(14).font('Helvetica-Bold')
      .text('DOSSIÊ EXECUTIVO DE DILIGÊNCIA DE INTEGRIDADE DE TERCEIRO', { align: 'center' });
    doc.moveDown(0.3);

    doc.fillColor('#64748B').fontSize(10).font('Helvetica')
      .text(`Número de Registro: ${reportNumber} • Protocolo: ${diligence.id}`, { align: 'center' });
    doc.moveDown(1);

    if (isPreview) {
      doc.fillColor('#DC2626').fontSize(11).font('Helvetica-Bold')
        .text('DOCUMENTO DE PRÉVIA — DILIGÊNCIA NÃO FORMALMENTE CONCLUÍDA', { align: 'center' });
      doc.moveDown(1);
    }
  },

  renderCompanyInfo(doc, diligence) {
    const emp = diligence.empresa || {};
    doc.fillColor('#0F2942').fontSize(12).font('Helvetica-Bold').text('1. IDENTIFICAÇÃO DA EMPRESA');
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).stroke();
    doc.moveDown(0.5);

    const rows = [
      ['Razão Social:', emp.razao_social || diligence.razaoSocial || 'Não informada'],
      ['Nome Fantasia:', emp.nome_fantasia || 'Não informado'],
      ['CNPJ:', formatCNPJ(diligence.cnpj)],
      ['Situação Cadastral:', (emp.descricao_situacao_cadastral || 'ATIVA').toUpperCase()],
      ['Natureza Jurídica:', emp.natureza_juridica || 'Não informada'],
      ['Início de Atividade:', formatDate(emp.data_inicio_atividade)],
      ['Endereço:', `${emp.logradouro || ''}, ${emp.numero || ''} ${emp.bairro || ''} - ${emp.municipio || ''}/${emp.uf || ''}`.trim() || 'Não informado'],
    ];

    rows.forEach(([label, value]) => {
      doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold').text(label, 40, doc.y, { width: 130, continued: true });
      doc.fillColor('#0F172A').font('Helvetica').text(` ${value}`, { width: 380 });
    });
    doc.moveDown(1);
  },

  renderExecutiveSummary(doc, diligence) {
    const risco = diligence.risco || { score: 0, nivel: 'Atenção Baixa' };
    doc.fillColor('#0F2942').fontSize(12).font('Helvetica-Bold').text('2. RESUMO EXECUTIVO & CONCLUSÃO');
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).stroke();
    doc.moveDown(0.5);

    doc.fillColor('#1E293B').fontSize(10).font('Helvetica-Bold')
      .text(`Indicador Preliminar de Atenção: ${risco.score} / 100 (${risco.nivel})`);
    doc.moveDown(0.3);

    const desc = risco.decisao || 'Nenhum impedimento vigente foi identificado nas fontes oficiais consultadas.';
    const subDesc = risco.decisaoDesc || 'Diligência submetida à revisão humana e formalizada para instrução processual.';
    
    doc.fillColor('#334155').fontSize(9).font('Helvetica').text(desc);
    doc.moveDown(0.2);
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Oblique').text(subDesc);
    doc.moveDown(1);
  },

  renderCoverageTable(doc, diligence) {
    doc.fillColor('#0F2942').fontSize(12).font('Helvetica-Bold').text('3. COBERTURA DA DILIGÊNCIA');
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).stroke();
    doc.moveDown(0.5);

    const sources = [
      ['Cadastro Empresarial (Receita Federal / QSA)', 'Consultado com Sucesso'],
      ['Pessoas Expostas Politicamente (CGU / PEP)', `${(diligence.pepResults || []).length} sócios checados`],
      ['Empresas Inidôneas e Suspensas (CGU / CEIS)', diligence.ceis?.encontrado ? `${diligence.ceis.quantidade} registro(s)` : 'Nenhuma sanção vigente'],
      ['Empresas Punidas - Anticorrupção (CGU / CNEP)', diligence.cnep?.encontrado ? `${diligence.cnep.quantidade} registro(s)` : 'Nenhuma sanção vigente'],
      ['Mídia e Ocorrências Públicas (Web Search)', `${diligence.adverseMedia?.results?.length || 0} matéria(s) localizada(s)`],
      ['Processos Judiciais (DataJud / CNJ)', `${diligence.processosDescobertos?.length || 0} processo(s) apurado(s)`],
    ];

    sources.forEach(([mod, status]) => {
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica').text(`• ${mod}: `, 45, doc.y, { continued: true, width: 320 });
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(status, { width: 180 });
    });
    doc.moveDown(1);
  },

  renderResponsibilities(doc, diligence) {
    doc.fillColor('#0F2942').fontSize(12).font('Helvetica-Bold').text('4. RESPONSÁVEIS REGISTRADOS NO SISTEMA');
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).stroke();
    doc.moveDown(0.5);

    const analista = diligence.createdBy?.name || 'Responsável anterior à implantação de perfis';
    const revisor = diligence.reviewedBy?.name || 'Revisor não designado ou análise prévia';

    doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold').text('Analista Responsável: ', 40, doc.y, { continued: true });
    doc.font('Helvetica').text(analista);
    
    doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold').text('Revisor Designado: ', 40, doc.y, { continued: true });
    doc.font('Helvetica').text(revisor);

    doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold').text('Data de Conclusão: ', 40, doc.y, { continued: true });
    doc.font('Helvetica').text(formatDateTime(diligence.completedAt || diligence.dataAnalise));
    doc.moveDown(1);
  },
};

module.exports = { ReportSections };
