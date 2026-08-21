// ==========================================================
// DILIGÊNCIA 360 — Formatadores e Sanitizadores de Relatório
// ==========================================================

function formatCNPJ(cnpj) {
  const clean = String(cnpj || '').replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return cnpj || 'Não informado';
}

function formatDate(isoString) {
  if (!isoString) return 'Não informado';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return isoString;
  }
}

function formatDateTime(isoString) {
  if (!isoString) return 'Não informado';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function sanitizeFileName(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

function generateReportNumber(diligenceId, year = new Date().getFullYear()) {
  const hashPart = Math.abs(
    String(diligenceId)
      .split('')
      .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  )
    .toString()
    .padStart(6, '0')
    .slice(-6);
  return `DIL-${year}-${hashPart}`;
}

module.exports = {
  formatCNPJ,
  formatDate,
  formatDateTime,
  sanitizeFileName,
  generateReportNumber,
};
