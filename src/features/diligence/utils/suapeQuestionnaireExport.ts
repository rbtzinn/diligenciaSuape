// ==========================================================
// DILIGÊNCIA 360 — Exportador do Questionário SUAPE 2026.2
// Gera planilha compatível com Microsoft Excel contendo todas
// as 10 seções do questionário com respostas e formatação.
// ==========================================================

import type { SuapeQuestionnaireReport } from './suapeQuestionnaireEngine';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Gera um arquivo SpreadsheetML (XML do Excel), que abre nativamente no
 * Microsoft Excel com suporte a cores, bordas, larguras de coluna e abas.
 */
export function generateSuapeExcelXml(report: SuapeQuestionnaireReport): string {
  const rowsXml: string[] = [];

  // Cabeçalho institucional
  rowsXml.push(`
    <Row ss:Height="28">
      <Cell ss:MergeAcross="5" ss:StyleID="TitleHeader">
        <Data ss:Type="String">QUESTIONÁRIO DE DILIGÊNCIA PRÉVIA DE INTEGRIDADE — EMPRESA SUAPE 2026.2</Data>
      </Cell>
    </Row>
    <Row ss:Height="20">
      <Cell ss:MergeAcross="5" ss:StyleID="SubHeader">
        <Data ss:Type="String">Complexo Industrial Portuário Governador Eraldo Gueiros · Programa de Integridade e Conformidade</Data>
      </Cell>
    </Row>
    <Row ss:Height="18">
      <Cell ss:StyleID="LabelBold"><Data ss:Type="String">Empresa Avaliada:</Data></Cell>
      <Cell ss:MergeAcross="2" ss:StyleID="ValueNormal"><Data ss:Type="String">${escapeXml(report.companyName)}</Data></Cell>
      <Cell ss:StyleID="LabelBold"><Data ss:Type="String">CNPJ:</Data></Cell>
      <Cell ss:StyleID="ValueNormal"><Data ss:Type="String">${escapeXml(report.cnpjFormatted)}</Data></Cell>
    </Row>
    <Row ss:Height="18">
      <Cell ss:StyleID="LabelBold"><Data ss:Type="String">Data de Emissão:</Data></Cell>
      <Cell ss:StyleID="ValueNormal"><Data ss:Type="String">${escapeXml(new Date(report.generatedAt).toLocaleDateString('pt-BR'))}</Data></Cell>
      <Cell ss:StyleID="LabelBold"><Data ss:Type="String">Índice de Preenchimento:</Data></Cell>
      <Cell ss:StyleID="ValueNormal"><Data ss:Type="String">${report.metrics.completionPercent}% respondido</Data></Cell>
      <Cell ss:StyleID="LabelBold"><Data ss:Type="String">Status Geral:</Data></Cell>
      <Cell ss:StyleID="ValueNormal"><Data ss:Type="String">${report.metrics.review > 0 ? 'PONTOS DE ATENÇÃO' : 'REGULAR'}</Data></Cell>
    </Row>
    <Row ss:Height="12"><Cell ss:MergeAcross="5"/></Row>
  `);

  // Tabela de colunas
  rowsXml.push(`
    <Row ss:Height="24">
      <Cell ss:StyleID="ColHeader"><Data ss:Type="String">Item</Data></Cell>
      <Cell ss:StyleID="ColHeader"><Data ss:Type="String">Seção / Pergunta Oficial</Data></Cell>
      <Cell ss:StyleID="ColHeader"><Data ss:Type="String">Classificação</Data></Cell>
      <Cell ss:StyleID="ColHeader"><Data ss:Type="String">Resposta da Diligência</Data></Cell>
      <Cell ss:StyleID="ColHeader"><Data ss:Type="String">Detalhamento / Instruções</Data></Cell>
      <Cell ss:StyleID="ColHeader"><Data ss:Type="String">Fonte Oficial</Data></Cell>
    </Row>
  `);

  report.sections.forEach((sec) => {
    // Linha de Seção
    rowsXml.push(`
      <Row ss:Height="22">
        <Cell ss:MergeAcross="5" ss:StyleID="SectionHeader">
          <Data ss:Type="String">${escapeXml(sec.title)} — ${escapeXml(sec.subtitle)}</Data>
        </Cell>
      </Row>
    `);

    sec.questions.forEach((q) => {
      let statusStyle = 'StatusNeutral';
      if (q.status === 'automated' || q.status === 'regular') statusStyle = 'StatusOk';
      if (q.status === 'review') statusStyle = 'StatusWarn';
      if (q.status === 'declaratory') statusStyle = 'StatusInfo';

      rowsXml.push(`
        <Row ss:Height="36">
          <Cell ss:StyleID="CellCode"><Data ss:Type="String">${escapeXml(q.code)}</Data></Cell>
          <Cell ss:StyleID="CellQuestion"><Data ss:Type="String">${escapeXml(q.question)}</Data></Cell>
          <Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${escapeXml(q.statusLabel)}</Data></Cell>
          <Cell ss:StyleID="CellValue"><Data ss:Type="String">${escapeXml(q.value)}</Data></Cell>
          <Cell ss:StyleID="CellDetails"><Data ss:Type="String">${escapeXml(q.details || '')}</Data></Cell>
          <Cell ss:StyleID="CellSource"><Data ss:Type="String">${escapeXml(q.sourceLabel || '')}</Data></Cell>
        </Row>
      `);

      // Se houver tabela de dados anexa (ex: Sócios, PEP, 9.2 Listas Restritivas)
      if (q.tableData && q.tableData.length > 0) {
        const firstRow = q.tableData[0];
        const headers = Object.keys(firstRow);

        rowsXml.push(`
          <Row ss:Height="18">
            <Cell ss:StyleID="TableSubCode"><Data ss:Type="String">Subtabela</Data></Cell>
            <Cell ss:MergeAcross="4" ss:StyleID="TableSubHeader">
              <Data ss:Type="String">Detalhamento Tabular — ${escapeXml(q.question)} (${headers.join(' | ')})</Data>
            </Cell>
          </Row>
        `);

        q.tableData.slice(0, 15).forEach((item) => {
          const content = headers.map((h) => `${h}: ${item[h] ?? ''}`).join('  |  ');
          rowsXml.push(`
            <Row ss:Height="18">
              <Cell ss:StyleID="TableSubCode"><Data ss:Type="String">»</Data></Cell>
              <Cell ss:MergeAcross="4" ss:StyleID="TableSubRow">
                <Data ss:Type="String">${escapeXml(content)}</Data>
              </Cell>
            </Row>
          `);
        });
      }
    });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <Style ss:ID="TitleHeader">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F2D59" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SubHeader">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Italic="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="LabelBold">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F2D59"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ValueNormal">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1E293B"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ColHeader">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0F2D59" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
  </Style>
  <Style ss:ID="SectionHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0F2D59"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="CellCode">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0F2D59"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellQuestion">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#1E293B"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="StatusOk">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#065F46"/>
   <Interior ss:Color="#D1FAE5" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/>
   </Borders>
  </Style>
  <Style ss:ID="StatusWarn">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#9A3412"/>
   <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
   </Borders>
  </Style>
  <Style ss:ID="StatusInfo">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#1E40AF"/>
   <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BFDBFE"/>
   </Borders>
  </Style>
  <Style ss:ID="StatusNeutral">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#475569"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellValue">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#0F172A"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellDetails">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#64748B"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="CellSource">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Color="#475569" ss:Italic="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="TableSubCode">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="8" ss:Color="#94A3B8"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TableSubHeader">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#334155"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="TableSubRow">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="8" ss:Color="#475569"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Questionário SUAPE">
  <Table ss:ExpandedColumnCount="6" x:FullColumns="1" x:FullRows="1">
   <Column ss:Width="50"/>
   <Column ss:Width="230"/>
   <Column ss:Width="130"/>
   <Column ss:Width="300"/>
   <Column ss:Width="260"/>
   <Column ss:Width="160"/>
   ${rowsXml.join('\n')}
  </Table>
 </Worksheet>
</Workbook>`;
}

/**
 * Dispara o download da planilha preenchida no navegador
 */
export function downloadSuapeQuestionnaireExcel(report: SuapeQuestionnaireReport): void {
  const xmlContent = generateSuapeExcelXml(report);
  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const cleanCnpj = report.cnpj.replace(/\D/g, '');
  link.href = url;
  link.download = `Questionario_Diligencia_SUAPE_${cleanCnpj}_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
