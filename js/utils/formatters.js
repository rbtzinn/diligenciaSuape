// ==========================================================
// DILIGÊNCIA 360 — Formatters & Parsers
// Tratamento robusto para evitar qualquer "Invalid Date"
// ==========================================================

const Formatters = {
  /**
   * Formata data de forma segura.
   * Aceita ISO (YYYY-MM-DD), formato BR (DD/MM/YYYY) ou timestamps.
   * Se inválido ou ausente, retorna "Não informado".
   */
  date(val) {
    if (!val || typeof val !== 'string' && typeof val !== 'number') return 'Não informado';
    const s = String(val).trim();
    if (!s || s === '—' || s === 'null' || s === 'undefined' || s === 'Invalid Date') {
      return 'Não informado';
    }

    // Já está no formato brasileiro DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      return s;
    }

    // Formato ISO simples YYYY-MM-DD
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}/${m}/${y}`;
    }

    // Tentativa com Date parser nativo
    const d = new Date(s);
    if (isNaN(d.getTime())) {
      return 'Não informado';
    }

    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  },

  /**
   * Formata data e hora com precisão
   */
  dateTime(val) {
    if (!val) return 'Não informado';
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Não informado';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  /**
   * Formata hora (HH:MM:SS)
   */
  time(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  /**
   * Formata moeda BRL
   */
  currency(val) {
    const num = Number(val);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  },

  /**
   * Trunca texto com reticências
   */
  truncate(text, max = 60) {
    if (!text) return '—';
    const s = String(text).trim();
    return s.length > max ? s.substring(0, max) + '…' : s;
  }
};

window.Formatters = Formatters;
