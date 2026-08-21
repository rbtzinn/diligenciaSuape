const crypto = require('crypto');

const CORPORATE_SUFFIXES = new Set(['LTDA', 'S A', 'SA', 'EIRELI', 'ME', 'EPP']);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeName(value, { removeCorporateSuffix = false } = {}) {
  const normalized = normalizeText(value);
  if (!removeCorporateSuffix) return normalized;
  return normalized
    .split(' ')
    .filter((token) => !CORPORATE_SUFFIXES.has(token))
    .join(' ')
    .trim();
}

function normalizeIdentifier(value) {
  return String(value || '').replace(/[^A-Za-z0-9*]/g, '').toUpperCase();
}

function stableHash(...parts) {
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => String(part || '')).join('|'))
    .digest('hex')
    .slice(0, 24);
}

function safeDate(value, fallback = new Date()) {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

module.exports = {
  normalizeText,
  normalizeName,
  normalizeIdentifier,
  stableHash,
  safeDate,
};
