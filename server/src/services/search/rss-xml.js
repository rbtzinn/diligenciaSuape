// ==========================================================
// DILIGÊNCIA 360 — Leitura de RSS
//
// Duas fontes gratuitas de notícia entregam RSS: o Google News e o Bing
// News. O tratamento do XML é o mesmo nas duas — entidade, CDATA,
// marcação solta dentro do título — e estava escrito dentro do provedor
// do Google. O segundo provedor teria de copiar tudo, e a cópia
// envelhece sozinha.
//
// Aqui fica só a leitura do XML. Cada provedor continua responsável por
// montar a sua URL e por saber de onde tirar o domínio da publicação,
// que é onde os dois formatos de fato divergem.
// ==========================================================

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
});

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function decodeXmlEntities(value) {
  return String(value || '').replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, code) => {
      if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? entity;

      const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const numeric = Number.parseInt(digits, radix);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;

      try {
        return String.fromCodePoint(numeric);
      } catch {
        return entity;
      }
    },
  );
}

function unwrapCdata(value) {
  const trimmed = String(value || '').trim();
  const match = /^<!\[CDATA\[([\s\S]*?)\]\]>$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

function normalizeText(value) {
  const decoded = decodeXmlEntities(unwrapCdata(value));
  const withoutMarkup = decoded.replace(/<[^>]*>/g, ' ');
  return decodeXmlEntities(withoutMarkup).replace(/\s+/g, ' ').trim();
}

function normalizeRawValue(value) {
  return decodeXmlEntities(unwrapCdata(value)).trim();
}

function extractTag(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i').exec(xml);
  return match ? match[1] : '';
}

function extractOpeningTag(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>`, 'i').exec(xml);
  return match ? match[0] : '';
}

function extractAttribute(openingTag, attributeName) {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\s${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i').exec(openingTag);
  return match ? normalizeRawValue(match[2]) : '';
}

function findTagEnd(xml, startIndex) {
  let quote = '';
  for (let index = startIndex; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

function isWellFormedXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return false;

  const source = xml.replace(/^\uFEFF/, '');
  const stack = [];
  let root = '';
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start === -1) break;

    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      if (end === -1) return false;
      cursor = end + 3;
      continue;
    }

    if (source.startsWith('<![CDATA[', start)) {
      const end = source.indexOf(']]>', start + 9);
      if (end === -1) return false;
      cursor = end + 3;
      continue;
    }

    if (source.startsWith('<?', start)) {
      const end = source.indexOf('?>', start + 2);
      if (end === -1) return false;
      cursor = end + 2;
      continue;
    }

    if (/^<!DOCTYPE\b/i.test(source.slice(start))) {
      const end = findTagEnd(source, start + 2);
      if (end === -1) return false;
      cursor = end + 1;
      continue;
    }

    const end = findTagEnd(source, start + 1);
    if (end === -1) return false;
    const token = source.slice(start, end + 1);
    const closing = /^<\/\s*([A-Za-z_][\w:.-]*)\s*>$/.exec(token);

    if (closing) {
      const expected = stack.pop();
      if (!expected || expected !== closing[1]) return false;
      cursor = end + 1;
      continue;
    }

    const opening = /^<\s*([A-Za-z_][\w:.-]*)(?:\s[\s\S]*?)?\s*\/?>$/.exec(token);
    if (!opening) return false;
    if (stack.length === 0) {
      if (root) return false;
      root = opening[1].toLowerCase();
    }
    if (!/\/\s*>$/.test(token)) stack.push(opening[1]);
    cursor = end + 1;
  }

  return root === 'rss'
    && stack.length === 0
    && /<channel(?:\s[^>]*)?>/i.test(source)
    && /<\/channel\s*>/i.test(source);
}

module.exports = {
  clampInteger,
  decodeXmlEntities,
  unwrapCdata,
  normalizeText,
  normalizeRawValue,
  extractTag,
  extractOpeningTag,
  extractAttribute,
  isWellFormedXml,
};
