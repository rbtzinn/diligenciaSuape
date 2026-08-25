const fs = require('fs');
const path = require('path');
const { formatDateTime } = require('./report-formatter');

const PAGE = Object.freeze({
  width: 595.28,
  height: 841.89,
  left: 52,
  right: 52,
  top: 38,
  bottom: 56,
  contentWidth: 491.28,
});

const COLORS = Object.freeze({
  navy: '#071D34',
  navySoft: '#102F4D',
  blue: '#2F61B5',
  blueSoft: '#EAF1FC',
  gold: '#FCB315',
  goldSoft: '#FFF6DE',
  ink: '#17273A',
  slate: '#4F6478',
  muted: '#73869A',
  line: '#D9E2EA',
  cloud: '#F3F6F9',
  white: '#FFFFFF',
  green: '#087A63',
  greenSoft: '#E9F7F2',
  amber: '#9A6700',
  amberSoft: '#FFF4D6',
  red: '#B7352D',
  redSoft: '#FDEDEC',
  neutral: '#596B7D',
  neutralSoft: '#EEF2F5',
});

const logoPath = path.join(
  __dirname,
  '../../../../public/assets/icone-suape-azul.png'
);

function cleanText(value, fallback = 'Não informado') {
  const normalized = String(value ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

function clampText(value, maxLength = 140) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function statusPalette(status) {
  const key = String(status || '').toUpperCase();
  if (['CONSULTED', 'CONCLUIDO', 'CONCLUÍDO', 'OK', 'CONFIRMED', 'COMPLETED'].includes(key)) {
    return { foreground: COLORS.green, background: COLORS.greenSoft, label: 'Consultado' };
  }
  if (['PARTIAL', 'REVIEW', 'INCONCLUSIVE', 'PENDING', 'POSSIBLE_MATCH', 'CANDIDATE'].includes(key)) {
    return { foreground: COLORS.amber, background: COLORS.amberSoft, label: 'Revisar' };
  }
  if (['UNAVAILABLE', 'ERROR', 'CRITICAL', 'BLOCKED'].includes(key)) {
    return { foreground: COLORS.red, background: COLORS.redSoft, label: 'Indisponível' };
  }
  if (['NOT_APPLICABLE', 'NOT_CONSULTED', 'SKIPPED'].includes(key)) {
    return { foreground: COLORS.neutral, background: COLORS.neutralSoft, label: 'Não aplicável' };
  }
  return { foreground: COLORS.neutral, background: COLORS.neutralSoft, label: cleanText(status, 'Informativo') };
}

function drawBrand(doc, x, y, { inverse = false, compact = false } = {}) {
  const iconSize = compact ? 24 : 30;
  doc.save();
  doc.roundedRect(x, y, iconSize, iconSize, compact ? 6 : 8)
    .fill(inverse ? COLORS.white : COLORS.cloud);
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, x + 4, y + 4, { fit: [iconSize - 8, iconSize - 8] });
  }
  const textX = x + iconSize + 9;
  doc.fillColor(inverse ? COLORS.white : COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(compact ? 8.5 : 10)
    .text('COMPLIANCE SUAPE', textX, y + (compact ? 3 : 4), { width: 145 });
  doc.fillColor(inverse ? '#B9CCE0' : COLORS.blue)
    .font('Courier-Bold')
    .fontSize(compact ? 5.8 : 6.5)
    .text('DILIGÊNCIA 360', textX, y + (compact ? 14 : 18), { width: 145, characterSpacing: 0.6 });
  doc.restore();
}

function drawPill(doc, text, x, y, palette, options = {}) {
  const label = cleanText(text);
  const fontSize = options.fontSize || 7;
  const horizontalPadding = options.paddingX || 8;
  doc.font('Helvetica-Bold').fontSize(fontSize);
  const width = options.width || Math.min(
    options.maxWidth || 145,
    Math.max(options.minWidth || 48, doc.widthOfString(label) + horizontalPadding * 2)
  );
  const height = options.height || 20;
  doc.save();
  doc.roundedRect(x, y, width, height, height / 2).fill(palette.background);
  doc.fillColor(palette.foreground)
    .font('Helvetica-Bold')
    .fontSize(fontSize)
    .text(label, x + horizontalPadding, y + (height - fontSize) / 2 - 1, {
      width: width - horizontalPadding * 2,
      align: 'center',
      lineBreak: false,
    });
  doc.restore();
  return width;
}

function beginSectionPage(doc, section) {
  doc.addPage();
  doc.save();
  doc.rect(0, 0, 9, PAGE.height).fill(COLORS.blue);
  doc.rect(9, 0, 3, PAGE.height).fill(COLORS.gold);
  drawBrand(doc, PAGE.left, 28, { compact: true });
  doc.fillColor(COLORS.muted)
    .font('Courier-Bold')
    .fontSize(6.3)
    .text(cleanText(section.eyebrow || 'Dossiê executivo').toUpperCase(), 370, 36, {
      width: 173,
      align: 'right',
      characterSpacing: 0.5,
    });
  doc.roundedRect(PAGE.left, 84, 31, 31, 8).fill(COLORS.navy);
  doc.fillColor(COLORS.white)
    .font('Courier-Bold')
    .fontSize(10)
    .text(String(section.number).padStart(2, '0'), PAGE.left, 94, { width: 31, align: 'center' });
  doc.fillColor(COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(cleanText(section.title), PAGE.left + 44, 83, { width: PAGE.contentWidth - 44 });
  doc.fillColor(COLORS.slate)
    .font('Helvetica')
    .fontSize(8.4)
    .text(cleanText(section.subtitle), PAGE.left + 44, 108, {
      width: PAGE.contentWidth - 44,
      lineGap: 1.5,
    });
  doc.strokeColor(COLORS.line).lineWidth(0.7)
    .moveTo(PAGE.left, 137)
    .lineTo(PAGE.width - PAGE.right, 137)
    .stroke();
  doc.restore();
  doc.x = PAGE.left;
  doc.y = 153;
  return doc.y;
}

function drawMetricRow(doc, metrics, y, options = {}) {
  const gap = options.gap || 8;
  const x = options.x || PAGE.left;
  const width = options.width || PAGE.contentWidth;
  const height = options.height || 63;
  const cardWidth = (width - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach((metric, index) => {
    const cardX = x + index * (cardWidth + gap);
    const palette = metric.palette || { foreground: COLORS.navy, background: COLORS.cloud };
    doc.save();
    doc.roundedRect(cardX, y, cardWidth, height, 9)
      .fillAndStroke(palette.background, palette.border || COLORS.line);
    doc.fillColor(palette.foreground)
      .font('Helvetica-Bold')
      .fontSize(metric.valueSize || 16)
      .text(cleanText(metric.value, '0'), cardX + 12, y + 11, { width: cardWidth - 24 });
    doc.fillColor(COLORS.slate)
      .font('Helvetica-Bold')
      .fontSize(6.4)
      .text(cleanText(metric.label).toUpperCase(), cardX + 12, y + 36, {
        width: cardWidth - 24,
        characterSpacing: 0.25,
      });
    if (metric.caption) {
      doc.fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(6.4)
        .text(clampText(metric.caption, 54), cardX + 12, y + 47, { width: cardWidth - 24 });
    }
    doc.restore();
  });
  return y + height;
}

function drawCallout(doc, config) {
  const x = config.x ?? PAGE.left;
  const y = config.y ?? doc.y;
  const width = config.width ?? PAGE.contentWidth;
  const palette = config.palette || { foreground: COLORS.navy, background: COLORS.cloud, border: COLORS.line };
  const title = cleanText(config.title);
  const body = cleanText(config.body, 'Sem observações adicionais.');
  doc.font('Helvetica').fontSize(config.bodySize || 8.5);
  const bodyHeight = doc.heightOfString(body, { width: width - 34, lineGap: 2 });
  const height = Math.max(config.minHeight || 74, 42 + bodyHeight);
  doc.save();
  doc.roundedRect(x, y, width, height, 10)
    .fillAndStroke(palette.background, palette.border || palette.foreground);
  doc.rect(x, y, 5, height).fill(palette.foreground);
  doc.fillColor(palette.foreground)
    .font('Helvetica-Bold')
    .fontSize(config.titleSize || 11)
    .text(title, x + 17, y + 13, { width: width - 34 });
  doc.fillColor(config.bodyColor || COLORS.ink)
    .font('Helvetica')
    .fontSize(config.bodySize || 8.5)
    .text(body, x + 17, y + 32, { width: width - 34, lineGap: 2 });
  doc.restore();
  return y + height;
}

function drawSubheading(doc, title, y, caption) {
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11)
    .text(cleanText(title), PAGE.left, y, { width: PAGE.contentWidth });
  let nextY = y + 17;
  if (caption) {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text(cleanText(caption), PAGE.left, nextY, { width: PAGE.contentWidth, lineGap: 1.5 });
    nextY += doc.heightOfString(cleanText(caption), { width: PAGE.contentWidth, lineGap: 1.5 }) + 5;
  } else {
    nextY += 4;
  }
  return nextY;
}

function drawEmptyState(doc, title, body, y, height = 64) {
  doc.save();
  doc.roundedRect(PAGE.left, y, PAGE.contentWidth, height, 9)
    .fillAndStroke(COLORS.cloud, COLORS.line);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9)
    .text(cleanText(title), PAGE.left + 14, y + 14, { width: PAGE.contentWidth - 28 });
  doc.fillColor(COLORS.slate).font('Helvetica').fontSize(7.5)
    .text(cleanText(body), PAGE.left + 14, y + 31, { width: PAGE.contentWidth - 28, lineGap: 1.5 });
  doc.restore();
  return y + height;
}

function drawFooter(doc, pageNumber, totalPages, reportNumber, emittedAt, inverse = false) {
  const y = PAGE.height - 31;
  const lineColor = inverse ? '#36506A' : COLORS.line;
  const textColor = inverse ? '#AFC1D3' : COLORS.muted;
  doc.save();
  doc.strokeColor(lineColor).lineWidth(0.5)
    .moveTo(PAGE.left, y - 6)
    .lineTo(PAGE.width - PAGE.right, y - 6)
    .stroke();
  doc.fillColor(textColor).font('Courier').fontSize(6.2)
    .text(
      `DILIGÊNCIA 360 | ${cleanText(reportNumber)} | ${formatDateTime(emittedAt)}`,
      PAGE.left,
      y,
      { width: 370 }
    );
  doc.font('Courier-Bold')
    .text(`${String(pageNumber).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`, 450, y, {
      width: 93,
      align: 'right',
    });
  doc.restore();
}

module.exports = {
  PAGE,
  COLORS,
  cleanText,
  clampText,
  statusPalette,
  drawBrand,
  drawPill,
  beginSectionPage,
  drawMetricRow,
  drawCallout,
  drawSubheading,
  drawEmptyState,
  drawFooter,
};
