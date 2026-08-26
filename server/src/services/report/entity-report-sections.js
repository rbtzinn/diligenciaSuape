const {
  PAGE,
  COLORS,
  cleanText,
  clampText,
  statusPalette,
  drawPill,
  beginSectionPage,
  drawMetricRow,
  drawCallout,
  drawSubheading,
  drawEmptyState,
  drawFooter,
} = require('./report-theme');
const { formatCNPJ, formatDateTime } = require('./report-formatter');

function humanizeProperty(key) {
  const labels = {
    cnpj: 'CNPJ',
    cpf: 'CPF',
    qualification: 'Qualificação',
    registrationStatus: 'Situação cadastral',
    publishedAt: 'Data de publicação',
    role: 'Papel',
    organization: 'Organização',
  };
  return labels[key] || String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function confidenceLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Não informada';
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(normalized)}%`;
}

function relationshipStatus(status) {
  return String(status || '').toUpperCase() === 'CONFIRMED' ? 'Confirmado' : 'Revisar';
}

function drawEntityOverview(doc, diligence, reportNumber, context, emittedAt) {
  const { entity, metrics } = context;
  let y = beginSectionPage(doc, {
    number: 1,
    eyebrow: 'Relatório contextual de evidências',
    title: clampText(entity.name, 74),
    subtitle: `Recorte da diligência ${reportNumber} para a entidade selecionada na rede de vínculos.`,
  });

  drawPill(doc, entity.typeLabel, PAGE.left, y, { foreground: COLORS.blue, background: COLORS.blueSoft }, { minWidth: 70 });
  drawPill(doc, `Grau ${Number(entity.depth || 0)}`, PAGE.left + 88, y, { foreground: COLORS.navy, background: COLORS.cloud }, { minWidth: 58 });
  drawPill(doc, `Confiança ${confidenceLabel(entity.confidence)}`, PAGE.left + 164, y, { foreground: COLORS.green, background: COLORS.greenSoft }, { minWidth: 98 });
  y += 37;

  y = drawCallout(doc, {
    y,
    minHeight: 72,
    palette: { foreground: COLORS.navy, background: COLORS.cloud, border: COLORS.line },
    title: `Contexto: ${cleanText(diligence.razaoSocial)}`,
    body: `CNPJ ${formatCNPJ(diligence.cnpj)}. Este relatório reúne somente os vínculos, achados, evidências e conteúdos públicos associados à entidade selecionada no snapshot da diligência. Emitido em ${formatDateTime(emittedAt)}.`,
    titleSize: 10,
    bodySize: 7.5,
  }) + 17;

  y = drawMetricRow(doc, [
    { value: String(metrics.relatedEntities), label: 'Entidades ligadas', caption: 'Conexões diretas', palette: { foreground: COLORS.blue, background: COLORS.blueSoft } },
    { value: String(metrics.evidences), label: 'Evidências', caption: 'Diretas ou do vínculo', palette: { foreground: COLORS.navy, background: COLORS.cloud } },
    { value: String(metrics.news), label: 'Notícias e conteúdos', caption: 'Relacionados nominalmente', palette: { foreground: COLORS.amber, background: COLORS.amberSoft } },
    { value: String(metrics.linkedSources), label: 'Links disponíveis', caption: 'Hyperlinks no PDF', palette: { foreground: COLORS.green, background: COLORS.greenSoft } },
  ], y) + 18;

  y = drawSubheading(doc, 'Dados preservados da entidade', y, 'Os campos abaixo vêm do snapshot estruturado e não representam conclusão autônoma.');
  const properties = entity.propertiesList;
  if (properties.length === 0) {
    y = drawEmptyState(doc, 'Sem atributos adicionais', 'A entidade possui nome, tipo, grau e confiança, mas nenhum atributo primitivo adicional foi armazenado.', y, 66) + 18;
  } else {
    const columns = 2;
    const gap = 8;
    const cardWidth = (PAGE.contentWidth - gap) / columns;
    properties.slice(0, 8).forEach((property, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = PAGE.left + column * (cardWidth + gap);
      const cardY = y + row * 49;
      doc.roundedRect(x, cardY, cardWidth, 41, 7).fillAndStroke(COLORS.white, COLORS.line);
      doc.fillColor(COLORS.muted).font('Courier-Bold').fontSize(5.8)
        .text(humanizeProperty(property.key).toUpperCase(), x + 10, cardY + 8, { width: cardWidth - 20, characterSpacing: 0.2 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(7.3)
        .text(clampText(property.value, 62), x + 10, cardY + 21, { width: cardWidth - 20, height: 15 });
    });
    y += Math.ceil(Math.min(properties.length, 8) / columns) * 49 + 10;
  }

  drawCallout(doc, {
    y: Math.max(y, 689),
    minHeight: 66,
    palette: { foreground: COLORS.amber, background: COLORS.amberSoft, border: '#E9CF83' },
    title: 'Como interpretar este recorte',
    body: 'Vínculo, menção pública, correspondência nominal ou classificação PEP não comprovam crime, sanção, autoria ou identidade. Abra as fontes, confira o conteúdo integral e valide identificadores antes de concluir.',
    titleSize: 9.2,
    bodySize: 7.1,
  });
}

function drawRelationshipsPage(doc, context) {
  let y = beginSectionPage(doc, {
    number: 2,
    eyebrow: 'Entidade selecionada',
    title: 'Vínculos e achados relacionados',
    subtitle: 'Conexões diretas da entidade, com status, confiança e quantidade de evidências ligadas a cada relação.',
  });

  if (context.relationships.length === 0) {
    y = drawEmptyState(doc, 'Nenhum vínculo direto', 'O snapshot não contém relações diretas para a entidade selecionada.', y, 72) + 18;
  } else {
    const visibleRelationships = context.relationships.slice(0, 8);
    visibleRelationships.forEach((relationship, index) => {
      const rowHeight = 49;
      const palette = relationshipStatus(relationship.status) === 'Confirmado'
        ? { foreground: COLORS.green, background: COLORS.greenSoft }
        : { foreground: COLORS.amber, background: COLORS.amberSoft };
      doc.roundedRect(PAGE.left, y, PAGE.contentWidth, rowHeight, 7)
        .fillAndStroke(index % 2 ? '#FAFBFC' : COLORS.white, COLORS.line);
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(7.7)
        .text(clampText(relationship.counterpart?.name, 66), PAGE.left + 12, y + 9, { width: 270, height: 16 });
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.4)
        .text(`${cleanText(relationship.label || relationship.type)} | confiança ${confidenceLabel(relationship.confidence)} | ${relationship.evidenceCount} evidência(s)`, PAGE.left + 12, y + 29, { width: 360, height: 14 });
      drawPill(doc, relationshipStatus(relationship.status), PAGE.left + 397, y + 14, palette, { width: 78, height: 20, fontSize: 5.9 });
      y += rowHeight + 6;
    });
    if (context.relationships.length > visibleRelationships.length) {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(6.6)
        .text(`Mais ${context.relationships.length - visibleRelationships.length} vínculo(s) permanecem disponíveis na rede interativa.`, PAGE.left, y, { width: PAGE.contentWidth });
      y += 20;
    }
  }

  y = drawSubheading(doc, 'Achados que tocam esta entidade', Math.max(y + 6, 580), `${context.findings.length} achado(s) relacionado(s) no snapshot.`);
  if (context.findings.length === 0) {
    drawEmptyState(doc, 'Sem achados individualizados', 'Nenhum achado foi vinculado diretamente à entidade ou aos seus vínculos imediatos.', y, 58);
  } else {
    context.findings.slice(0, 2).forEach((finding, index) => {
      const palette = statusPalette(finding.status);
      drawCallout(doc, {
        y: y + index * 61,
        minHeight: 54,
        palette: { foreground: palette.foreground, background: palette.background, border: COLORS.line },
        title: clampText(finding.title, 84),
        body: clampText(finding.explanation, 210),
        titleSize: 7.9,
        bodySize: 6.5,
      });
    });
  }
}

function sourceKindLabel(source) {
  if (source.kinds.includes('news') && source.kinds.includes('evidence')) return 'Notícia + evidência';
  if (source.kinds.includes('news')) return 'Notícia / conteúdo público';
  if (source.kinds.includes('document')) return 'Documento relacionado';
  return 'Evidência rastreável';
}

function sourceCardHeight(doc, source) {
  const excerpt = clampText(source.excerpt, 560);
  doc.font('Helvetica').fontSize(7.2);
  const excerptHeight = excerpt && excerpt !== 'Não informado'
    ? Math.min(58, doc.heightOfString(excerpt, { width: PAGE.contentWidth - 28, lineGap: 1.5 }))
    : 0;
  return Math.max(84, 70 + excerptHeight);
}

function drawSourceCard(doc, source, y, index) {
  const height = sourceCardHeight(doc, source);
  doc.roundedRect(PAGE.left, y, PAGE.contentWidth, height, 8)
    .fillAndStroke(index % 2 ? '#FAFBFC' : COLORS.white, COLORS.line);
  doc.fillColor(COLORS.blue).font('Courier-Bold').fontSize(5.8)
    .text(sourceKindLabel(source).toUpperCase(), PAGE.left + 14, y + 10, { width: 175, characterSpacing: 0.25 });
  doc.fillColor(COLORS.muted).font('Courier').fontSize(5.8)
    .text(formatDateTime(source.retrievedAt), PAGE.left + 300, y + 10, { width: 177, align: 'right' });
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8.6)
    .text(clampText(source.title, 108), PAGE.left + 14, y + 25, { width: PAGE.contentWidth - 28, height: 23 });
  doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.5)
    .text(`${cleanText(source.sourceName, 'Fonte pública')}${source.domain ? ` | ${source.domain}` : ''}`, PAGE.left + 14, y + 49, { width: PAGE.contentWidth - 28 });
  if (source.excerpt) {
    doc.fillColor(COLORS.ink).font('Helvetica').fontSize(7.2)
      .text(clampText(source.excerpt, 560), PAGE.left + 14, y + 64, { width: PAGE.contentWidth - 28, height: height - 86, lineGap: 1.5, ellipsis: true });
  }
  if (source.url) {
    doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(7.1)
      .text('Abrir fonte original', PAGE.left + 14, y + height - 18, {
        width: 145,
        link: source.url,
        underline: true,
        lineBreak: false,
      });
    doc.fillColor(COLORS.muted).font('Courier').fontSize(5.6)
      .text(clampText(source.domain || source.url, 66), PAGE.left + 170, y + height - 18, { width: 307, align: 'right', lineBreak: false });
  } else {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(6.4)
      .text('Fonte sem URL pública preservada no snapshot.', PAGE.left + 14, y + height - 18, { width: PAGE.contentWidth - 28 });
  }
  return y + height;
}

function drawSourcesPages(doc, context) {
  const sources = context.sources;
  let pageIndex = 0;
  let y;
  const beginPage = () => {
    pageIndex += 1;
    y = beginSectionPage(doc, {
      number: 2 + pageIndex,
      eyebrow: 'Proveniência e hyperlinks',
      title: pageIndex === 1 ? 'Fontes, notícias e documentos' : 'Fontes - continuação',
      subtitle: 'Cada link abre a fonte externa preservada no momento da diligência. Conteúdos podem mudar após a data de consulta.',
    });
  };

  beginPage();
  if (sources.length === 0) {
    drawEmptyState(doc, 'Nenhuma fonte individual disponível', 'A entidade possui contexto estrutural, mas o snapshot não contém notícia, documento ou evidência individual com proveniência própria.', y, 78);
    return;
  }

  sources.forEach((source, index) => {
    const height = sourceCardHeight(doc, source);
    if (y + height > PAGE.height - 72) beginPage();
    y = drawSourceCard(doc, source, y, index) + 9;
  });
}

const EntityReportSections = {
  renderReport(doc, diligence, reportNumber, context, { emittedAt = new Date().toISOString() } = {}) {
    drawEntityOverview(doc, diligence, reportNumber, context, emittedAt);
    drawRelationshipsPage(doc, context);
    drawSourcesPages(doc, context);
  },

  renderPageFooter(doc, pageNumber, totalPages, reportNumber, emittedAt) {
    drawFooter(doc, pageNumber, totalPages, reportNumber, emittedAt);
  },
};

module.exports = { EntityReportSections };
