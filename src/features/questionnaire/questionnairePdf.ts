// ==========================================================
// DILIGÊNCIA 360 — PDF do Questionário de Diligência
// ==========================================================
// Gera, no navegador, o documento que a empresa anexa ao SEI: as
// respostas no layout de SUAPE e, no fim, as evidências incorporadas
// (páginas de PDF copiadas, imagens em página própria), cada uma com o
// número do anexo e o SHA-256 no índice. Um arquivo só, sem servidor.
//
// As fontes padrão do PDF usam a codificação WinAnsi, que cobre o
// português. O que ficar de fora (emoji, símbolos) é trocado antes de
// desenhar: a pdf-lib recusa o documento inteiro por um caractere.
// ==========================================================

import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from 'pdf-lib';
import {
  DECLARATION_FIELDS,
  DECLARATION_TEXT,
  QUESTIONNAIRE_SECTIONS,
  REGISTRIES,
  type ChoiceDef,
  type TableDef,
  type TextFieldDef,
} from './questionnaireCatalog';
import {
  collectEvidences,
  filledRows,
  requiresRegistries,
  type Evidence,
  type QuestionnaireState,
} from './questionnaireState';

const A4: [number, number] = [595.28, 841.89];
const MARGIN_X = 50;
const TOP = A4[1] - 88;
const BOTTOM = 64;
const WIDTH = A4[0] - MARGIN_X * 2;

const BRAND = rgb(0.176, 0.376, 0.678);
const NAVY = rgb(0.067, 0.157, 0.302);
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.36, 0.4, 0.46);
const LINE = rgb(0.82, 0.85, 0.9);
const SOFT = rgb(0.92, 0.95, 0.99);
const OK = rgb(0.09, 0.47, 0.29);
const WHITE = rgb(1, 1, 1);

const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Deixa o texto dentro do que a fonte padrão consegue codificar. */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text.normalize('NFC')) {
    const code = char.codePointAt(0) || 0;
    if (char === '\t') out += ' ';
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRA.has(code)) out += char;
    else {
      const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && base.codePointAt(0)! <= 0xff ? base : '?';
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of toWinAnsi(text).split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Palavra maior que a linha (link, e-mail): quebra por caractere.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

const formatBytes = (size: number) =>
  size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface QuestionnairePdfOptions {
  /** Marca de SUAPE em PNG, para o cabeçalho. */
  logoPng?: Uint8Array;
  generatedAt?: Date;
}

/** Código de verificação: SHA-256 das respostas, incluindo o hash de cada arquivo. */
export async function verificationCode(state: QuestionnaireState): Promise<string> {
  const evidences = Object.fromEntries(
    Object.entries(state.evidences).map(([id, list]) => [
      id,
      list.map((item) => ({ kind: item.kind, label: item.label, rowIndex: item.rowIndex, sha256: item.file?.sha256 })),
    ]),
  );
  const hash = await sha256Hex(JSON.stringify({ ...state, evidences }));
  return hash.slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}

class Writer {
  page!: PDFPage;
  y = TOP;
  readonly ownPages: PDFPage[] = [];

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.ownPages.push(this.page);
    this.y = TOP;
  }

  ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage();
  }

  text(value: string, x: number, y: number, size: number, font = this.regular, color: RGB = INK) {
    this.page.drawText(toWinAnsi(value), { x, y, size, font, color });
  }

  /** Parágrafo com quebra de linha e de página. */
  paragraph(value: string, { size = 9, font = this.regular, color = INK, indent = 0, width = WIDTH, gap = 4 } = {}) {
    const lineHeight = size * 1.35;
    for (const line of wrap(value, font, size, width - indent)) {
      this.ensure(lineHeight);
      this.text(line, MARGIN_X + indent, this.y - size, size, font, color);
      this.y -= lineHeight;
    }
    this.y -= gap;
  }

  sectionTitle(title: string) {
    this.ensure(46);
    this.y -= 8;
    this.page.drawRectangle({ x: MARGIN_X, y: this.y - 20, width: WIDTH, height: 20, color: BRAND });
    this.text(title.toUpperCase(), MARGIN_X + 8, this.y - 14, 9.5, this.bold, WHITE);
    this.y -= 30;
  }

  /** Rótulo e valor lado a lado. */
  field(label: string, value: string) {
    const labelWidth = 160;
    const labelLines = wrap(label, this.bold, 8, labelWidth - 8);
    const valueLines = wrap(value || '—', this.regular, 9, WIDTH - labelWidth - 8);
    const height = Math.max(labelLines.length * 10.8, valueLines.length * 12.2) + 8;
    this.ensure(height);
    labelLines.forEach((line, i) => this.text(line, MARGIN_X, this.y - 9 - i * 10.8, 8, this.bold, MUTED));
    valueLines.forEach((line, i) => this.text(line, MARGIN_X + labelWidth, this.y - 9 - i * 12.2, 9, this.regular, value ? INK : MUTED));
    this.y -= height;
    this.page.drawLine({ start: { x: MARGIN_X, y: this.y + 3 }, end: { x: MARGIN_X + WIDTH, y: this.y + 3 }, thickness: 0.5, color: LINE });
  }

  /** Pergunta Sim/Não com a resposta em destaque à direita. */
  choice(ref: string, question: string, answer: string) {
    const pillWidth = 44;
    const lines = wrap(`${ref}  ${question}`, this.regular, 9, WIDTH - pillWidth - 12);
    const height = lines.length * 12.2 + 8;
    this.ensure(height);
    const top = this.y;
    lines.forEach((line, i) => {
      if (i === 0) {
        const refText = toWinAnsi(ref);
        this.text(refText, MARGIN_X, top - 9, 9, this.bold, NAVY);
        this.text(line.slice(refText.length), MARGIN_X + this.bold.widthOfTextAtSize(refText, 9), top - 9, 9);
      } else this.text(line, MARGIN_X, top - 9 - i * 12.2, 9);
    });
    const sim = answer === 'sim';
    this.page.drawRectangle({
      x: MARGIN_X + WIDTH - pillWidth,
      y: top - 15,
      width: pillWidth,
      height: 15,
      color: sim ? BRAND : SOFT,
      borderColor: sim ? BRAND : LINE,
      borderWidth: 0.6,
    });
    const label = sim ? 'SIM' : answer === 'nao' ? 'NÃO' : '—';
    const labelWidth = this.bold.widthOfTextAtSize(toWinAnsi(label), 8);
    this.text(label, MARGIN_X + WIDTH - pillWidth / 2 - labelWidth / 2, top - 11, 8, this.bold, sim ? WHITE : NAVY);
    this.y -= height;
  }

  table(columns: Array<{ label: string; width?: number }>, rows: string[][], indent = 0) {
    const total = columns.reduce((sum, column) => sum + (column.width || 1), 0);
    const tableWidth = WIDTH - indent;
    const widths = columns.map((column) => ((column.width || 1) / total) * tableWidth);
    const pad = 4;

    const drawRow = (cells: string[], header: boolean) => {
      const font = header ? this.bold : this.regular;
      const size = header ? 7.5 : 8;
      const lineHeight = size * 1.3;
      const wrapped = cells.map((cell, i) => wrap(cell || '—', font, size, widths[i] - pad * 2));
      const height = Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + pad * 2;
      this.ensure(height + (header ? 14 : 0));
      let x = MARGIN_X + indent;
      wrapped.forEach((lines, i) => {
        this.page.drawRectangle({
          x,
          y: this.y - height,
          width: widths[i],
          height,
          color: header ? SOFT : undefined,
          borderColor: LINE,
          borderWidth: 0.6,
        });
        lines.forEach((line, j) => this.text(line, x + pad, this.y - pad - size - j * lineHeight + 1, size, font, header ? NAVY : INK));
        x += widths[i];
      });
      this.y -= height;
      return height;
    };

    const header = columns.map((column) => column.label);
    drawRow(header, true);
    for (const row of rows) {
      const before = this.page;
      // Linha que não cabe vai para a página seguinte, com o cabeçalho repetido.
      const lineHeight = 8 * 1.3;
      const needed = Math.max(...row.map((cell, i) => wrap(cell || '—', this.regular, 8, widths[i] - pad * 2).length)) * lineHeight + pad * 2;
      this.ensure(needed);
      if (this.page !== before) drawRow(header, true);
      drawRow(row, false);
    }
    this.y -= 8;
  }
}

function tableRows(table: TableDef, state: QuestionnaireState): string[][] {
  return filledRows(state.tables[table.id]).map((row) => table.columns.map((column) => row[column.id] || ''));
}

function evidenceLine(evidence: Evidence, annex: number | undefined, rowLabel?: string): string {
  const prefix = rowLabel ? `${rowLabel}: ` : '';
  if (evidence.kind === 'file' && evidence.file) {
    return `${prefix}Anexo ${annex} — ${evidence.file.name} (${formatBytes(evidence.file.size)})`;
  }
  if (evidence.kind === 'link') return `${prefix}Link — ${evidence.label}`;
  return `${prefix}Trecho indicado — ${evidence.label}`;
}

export async function buildQuestionnairePdf(
  state: QuestionnaireState,
  { logoPng, generatedAt = new Date() }: QuestionnairePdfOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const razao = state.fields.razaoSocial || 'Empresa';
  doc.setTitle(toWinAnsi(`Questionário de Diligência de SUAPE — ${razao}`));
  doc.setAuthor(toWinAnsi(razao));
  doc.setSubject('Anexo A da Política de Contratação de Terceiros de SUAPE');
  doc.setCreator('SUAPE · Formulário eletrônico do Questionário de Diligência');
  doc.setCreationDate(generatedAt);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo: PDFImage | null = logoPng ? await doc.embedPng(logoPng) : null;
  const code = await verificationCode(state);
  const evidences = collectEvidences(state);
  const files = evidences.filter((item) => item.annex !== undefined);
  const w = new Writer(doc, regular, bold);

  // ---- Capa ----
  w.y -= 10;
  w.text('Questionário de Diligência', MARGIN_X, w.y - 22, 22, bold, NAVY);
  w.y -= 34;
  w.paragraph('Anexo A da Política de Contratação de Terceiros · Programa de Integridade de SUAPE', { size: 10, color: MUTED, gap: 14 });
  const summary: Array<[string, string]> = [
    ['Empresa', razao],
    ['CNPJ', state.fields.cnpj || ''],
    ['Representante', state.fields.representanteNome || ''],
    ['Serviço a ser prestado', state.fields.servicoPrestado || ''],
    ['Evidências', `${files.length} arquivo(s) anexado(s) a este documento · ${evidences.length - files.length} link(s) ou trecho(s) indicado(s)`],
    ['Gerado em', generatedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })],
    ['Código de verificação', code],
  ];
  for (const [label, value] of summary) w.field(label, value);
  w.y -= 6;
  w.paragraph('Documento gerado pelo formulário eletrônico do Questionário de Diligência de SUAPE. Antes de anexar ao SEI, o representante deve assiná-lo digitalmente (certificado ICP-Brasil ou assinatura gov.br).', { size: 8, color: MUTED, gap: 6 });

  // ---- Seções ----
  const registriesRequired = requiresRegistries(state);
  const textValue = (field: TextFieldDef) => state.fields[field.id] || '';
  const renderChild = (child: TextFieldDef | TableDef) => {
    if (child.kind === 'text') {
      w.paragraph(`${child.ref ? `${child.ref}. ` : ''}${child.label}`, { size: 8, font: bold, color: MUTED, indent: 12, gap: 2 });
      w.paragraph(textValue(child) || '—', { size: 9, indent: 12, gap: 8 });
    } else {
      w.paragraph(`${child.ref ? `${child.ref}. ` : ''}${child.label}`, { size: 8, font: bold, color: MUTED, indent: 12, gap: 3 });
      w.table(child.columns, tableRows(child, state), 12);
    }
  };
  const renderEvidence = (choice: ChoiceDef) => {
    const list = evidences.filter((item) => item.choice.id === choice.id);
    if (list.length === 0) return;
    const rowsOf = choice.evidence?.perRowOf;
    // Índice real da linha, como a evidência guarda.
    const rowNames = rowsOf ? (state.tables[rowsOf] || []).map((row, i) => Object.values(row).find((v) => v.trim()) || `Linha ${i + 1}`) : [];
    w.paragraph('Evidências apresentadas', { size: 8, font: bold, color: OK, indent: 12, gap: 1 });
    for (const item of list) {
      const rowLabel = item.evidence.rowIndex !== undefined ? rowNames[item.evidence.rowIndex] : undefined;
      w.paragraph(`• ${evidenceLine(item.evidence, item.annex, rowLabel)}`, { size: 8.5, indent: 16, gap: 1 });
    }
    w.y -= 6;
  };

  for (const section of QUESTIONNAIRE_SECTIONS) {
    w.sectionTitle(`${section.number}. ${section.title}`);
    for (const item of section.items) {
      if (item.kind === 'text') w.field(`${item.ref ? `${item.ref} ` : ''}${item.label}`, textValue(item));
      else if (item.kind === 'note') w.paragraph(item.text, { size: 8.5, font: bold, color: NAVY, gap: 6 });
      else if (item.kind === 'table') {
        w.paragraph(`${item.ref ? `${item.ref}. ` : ''}${item.label}`, { size: 8.5, gap: 4 });
        w.table(item.columns, tableRows(item, state));
      } else if (item.kind === 'choice') {
        const answer = state.choices[item.id] || '';
        w.choice(item.ref, item.text, answer);
        if (answer === 'sim') (item.whenYes || []).forEach(renderChild);
        renderEvidence(item);
        w.y -= 4;
      } else if (item.kind === 'registries') {
        w.paragraph(`${item.ref}  ${item.text}`, { size: 9, gap: 4 });
        if (!registriesRequired) {
          w.paragraph('Não aplicável: as respostas não enquadram a avaliação em risco Alto ou Muito Alto.', { size: 8.5, color: MUTED, indent: 12, gap: 8 });
          continue;
        }
        w.table(
          [{ label: 'Cadastro / Lista', width: 7 }, { label: 'Consta?', width: 1 }],
          REGISTRIES.map((registry) => [registry.text, state.registries[registry.key] ? 'X' : '']),
          12,
        );
        if (state.registriesNone) w.paragraph('A empresa declarou não constar em nenhum dos cadastros acima.', { size: 8.5, indent: 12, gap: 6 });
        if (REGISTRIES.some((registry) => state.registries[registry.key])) renderChild(item.detail);
      }
    }
  }

  // ---- Declaração ----
  w.sectionTitle('10. Declaração de ciência');
  DECLARATION_TEXT.forEach((paragraph) => w.paragraph(paragraph, { size: 9, gap: 6 }));
  w.paragraph(state.declarationAccepted ? '[X] O representante declarou estar de acordo com os termos acima.' : '[ ] Declaração não aceita.', { size: 9, font: bold, color: NAVY, gap: 8 });
  for (const field of DECLARATION_FIELDS) w.field(field.label, state.fields[field.id] || '');
  w.ensure(70);
  w.y -= 40;
  w.page.drawLine({ start: { x: MARGIN_X + WIDTH / 2 - 120, y: w.y }, end: { x: MARGIN_X + WIDTH / 2 + 120, y: w.y }, thickness: 0.8, color: INK });
  const signLabel = 'Assinatura digital do representante';
  w.text(signLabel, MARGIN_X + WIDTH / 2 - regular.widthOfTextAtSize(signLabel, 8) / 2, w.y - 11, 8, regular, MUTED);
  w.y -= 20;

  // ---- Índice e anexos ----
  const annexStamps: Array<{ page: PDFPage; label: string }> = [];
  if (evidences.length > 0) {
    w.newPage();
    w.sectionTitle('Anexos — Evidências apresentadas');
    w.paragraph('Arquivos incorporados a este documento, na ordem do questionário. O SHA-256 permite conferir que o arquivo anexado é o mesmo enviado no formulário.', { size: 8.5, color: MUTED, gap: 6 });
    w.table(
      [{ label: 'Anexo', width: 0.8 }, { label: 'Item', width: 0.7 }, { label: 'Evidência', width: 4 }, { label: 'SHA-256', width: 2.6 }],
      evidences.map((item) => [
        item.annex !== undefined ? String(item.annex) : '—',
        item.choice.ref,
        evidenceLine(item.evidence, item.annex).replace(/^Anexo \d+ — /, ''),
        item.evidence.file?.sha256 ? `${item.evidence.file.sha256.slice(0, 32)}…` : '—',
      ]),
    );

    for (const item of files) {
      const file = item.evidence.file!;
      const label = `Anexo ${item.annex} · Item ${item.choice.ref} · ${file.name}`;
      if (file.type === 'application/pdf') {
        const source = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(source, source.getPageIndices());
        pages.forEach((page, i) => {
          doc.addPage(page);
          annexStamps.push({ page, label: `${label} · p. ${i + 1}/${pages.length}` });
        });
      } else {
        w.newPage();
        w.paragraph(label, { size: 10, font: bold, color: NAVY, gap: 8 });
        const image = file.type === 'image/png' ? await doc.embedPng(file.bytes) : await doc.embedJpg(file.bytes);
        const maxHeight = w.y - BOTTOM - 8;
        const scale = Math.min(WIDTH / image.width, maxHeight / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        w.page.drawImage(image, { x: MARGIN_X + (WIDTH - width) / 2, y: w.y - height, width, height });
        w.page.drawRectangle({ x: MARGIN_X + (WIDTH - width) / 2, y: w.y - height, width, height, borderColor: LINE, borderWidth: 0.6 });
      }
    }
  }

  // ---- Cabeçalho, rodapé e numeração em todas as páginas ----
  const pages = doc.getPages();
  const own = new Set(w.ownPages);
  const footer = 'Complexo Industrial Portuário Governador Eraldo Gueiros · Rodovia Indonésia, s/nº, Distrito Industrial de Ipojuca · Ipojuca/PE · CEP 55598-000 · (81) 3527-5000';
  pages.forEach((page, index) => {
    const [pageWidth, pageHeight] = [page.getWidth(), page.getHeight()];
    const number = `Página ${index + 1} de ${pages.length}`;
    if (own.has(page)) {
      // Ícone de SUAPE com o nome ao lado, como na marca horizontal.
      let brandX = MARGIN_X;
      if (logo) {
        const logoHeight = 34;
        const logoWidth = (logo.width / logo.height) * logoHeight;
        page.drawImage(logo, { x: MARGIN_X - 3, y: pageHeight - 40 - logoHeight / 2, width: logoWidth, height: logoHeight });
        brandX = MARGIN_X - 3 + logoWidth + 4;
      }
      page.drawText('SUAPE', { x: brandX, y: pageHeight - 41, size: 16, font: bold, color: NAVY });
      page.drawText(toWinAnsi('Complexo Industrial Portuário'), { x: brandX, y: pageHeight - 51, size: 6.5, font: regular, color: MUTED });
      const titleA = 'QUESTIONÁRIO DE DILIGÊNCIA DE SUAPE';
      const titleB = toWinAnsi(razao.length > 60 ? `${razao.slice(0, 57)}…` : razao);
      page.drawText(toWinAnsi(titleA), { x: pageWidth - MARGIN_X - bold.widthOfTextAtSize(toWinAnsi(titleA), 8), y: pageHeight - 34, size: 8, font: bold, color: BRAND });
      page.drawText(titleB, { x: pageWidth - MARGIN_X - regular.widthOfTextAtSize(titleB, 7.5), y: pageHeight - 45, size: 7.5, font: regular, color: MUTED });
      page.drawLine({ start: { x: MARGIN_X, y: pageHeight - 62 }, end: { x: pageWidth - MARGIN_X, y: pageHeight - 62 }, thickness: 1.2, color: BRAND });

      page.drawLine({ start: { x: MARGIN_X, y: 46 }, end: { x: pageWidth - MARGIN_X, y: 46 }, thickness: 0.5, color: LINE });
      page.drawText(toWinAnsi(footer), { x: MARGIN_X, y: 34, size: 6.3, font: regular, color: MUTED });
      page.drawText(toWinAnsi(`Código de verificação ${code}`), { x: MARGIN_X, y: 24, size: 6.3, font: regular, color: MUTED });
      page.drawText(toWinAnsi(number), { x: pageWidth - MARGIN_X - regular.widthOfTextAtSize(toWinAnsi(number), 7.5), y: 24, size: 7.5, font: bold, color: NAVY });
    } else {
      // Página de anexo copiada: carimbo discreto sobre fundo branco, sem cobrir o conteúdo.
      const stamp = annexStamps.find((item) => item.page === page);
      const text = toWinAnsi(`${stamp ? `${stamp.label} · ` : ''}${number}`);
      const size = 6.5;
      const width = regular.widthOfTextAtSize(text, size) + 8;
      page.drawRectangle({ x: pageWidth - width - 8, y: pageHeight - 16, width, height: 11, color: WHITE, opacity: 0.9, borderColor: BRAND, borderWidth: 0.5 });
      page.drawText(text, { x: pageWidth - width - 4, y: pageHeight - 13, size, font: regular, color: NAVY });
    }
  });

  return doc.save();
}

/** Confere se um PDF enviado como evidência pode ser incorporado. */
export async function canEmbedPdf(bytes: Uint8Array): Promise<boolean> {
  try {
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    // Protegido por senha: copiar as páginas daria páginas em branco.
    if (source.isEncrypted) return false;
    const probe = await PDFDocument.create();
    await probe.copyPages(source, [0]);
    return source.getPageCount() > 0;
  } catch {
    return false;
  }
}

export { sha256Hex };
