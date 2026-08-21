// ==========================================================
// DILIGÊNCIA 360 — Formatadores Seguros
// ==========================================================

export const Formatters = {
  /**
   * Formata data de forma segura no padrão brasileiro (DD/MM/AAAA)
   * Retorna "Não informado" em caso de valores nulos, vazios ou inválidos.
   */
  date(val: unknown): string {
    if (!val || (typeof val !== 'string' && typeof val !== 'number')) {
      return 'Não informado';
    }

    const s = String(val).trim();
    if (!s || s === '—' || s === 'null' || s === 'undefined' || s === 'Invalid Date') {
      return 'Não informado';
    }

    // Já formatado em DD/MM/AAAA
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      return s;
    }

    // Formato ISO YYYY-MM-DD
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}/${m}/${y}`;
    }

    // Parser nativo
    const d = new Date(s);
    if (isNaN(d.getTime())) {
      return 'Não informado';
    }

    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  },

  /**
   * Formata data e hora (DD/MM/AAAA HH:mm)
   */
  dateTime(val: unknown): string {
    if (!val) return 'Não informado';
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return 'Não informado';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  /**
   * Formata hora (HH:mm:ss)
   */
  time(val: unknown): string {
    if (!val) return '—';
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  },

  /**
   * Formata valor numérico para Moeda BRL
   */
  currency(val: unknown): string {
    const num = Number(val);
    if (isNaN(num)) return 'R$ 0,00';
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  },

  /**
   * Trunca texto longo adicionando reticências
   */
  truncate(text: unknown, max = 60): string {
    if (!text) return '—';
    const s = String(text).trim();
    return s.length > max ? `${s.substring(0, max)}…` : s;
  },
};
