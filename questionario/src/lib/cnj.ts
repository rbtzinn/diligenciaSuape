// ==========================================================
// DILIGÊNCIA 360 — Utilitários de Processo CNJ
// Formatação, Validação (Módulo 97 Res. 65/2008) e Extração
// ==========================================================

export interface ExtractedCNJ {
  raw: string;
  normalized: string;
  formatted: string;
  tribunalKey: string;
}

export const CNJ = {
  clean(raw: string | number): string {
    return String(raw || '').replace(/\D/g, '');
  },

  format(raw: string | number): string {
    const digits = this.clean(raw);
    if (digits.length !== 20) return String(raw);
    return digits.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6');
  },

  mask(val: string): string {
    let clean = this.clean(val).substring(0, 20);
    if (clean.length > 16) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{0,4})/, '$1-$2.$3.$4.$5.$6');
    } else if (clean.length > 14) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{0,2})/, '$1-$2.$3.$4.$5');
    } else if (clean.length > 13) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{4})(\d{0,1})/, '$1-$2.$3.$4');
    } else if (clean.length > 9) {
      clean = clean.replace(/^(\d{7})(\d{2})(\d{0,4})/, '$1-$2.$3');
    } else if (clean.length > 7) {
      clean = clean.replace(/^(\d{7})(\d{0,2})/, '$1-$2');
    }
    return clean;
  },

  validate(raw: string | number): boolean {
    const digits = this.clean(raw);
    if (digits.length !== 20) return false;

    const n = digits.substring(0, 7);
    const d = digits.substring(7, 9);
    const a = digits.substring(9, 13);
    const j = digits.substring(13, 14);
    const tr = digits.substring(14, 16);
    const o = digits.substring(16, 20);

    const year = parseInt(a, 10);
    const jDigit = parseInt(j, 10);
    if (year < 1900 || year > 2100 || jDigit < 1 || jDigit > 9) {
      return false;
    }

    try {
      const numForCalc = BigInt(n + a + j + tr + o + '00');
      const remainder = Number(numForCalc % 97n);
      const expectedDV = 98 - remainder;
      const expectedDVStr = String(expectedDV).padStart(2, '0');
      return expectedDVStr === d;
    } catch {
      return false;
    }
  },

  extractFromText(text: string): ExtractedCNJ[] {
    if (!text || typeof text !== 'string') return [];

    const foundMap = new Map<string, ExtractedCNJ>();

    // 1. Padrão Formatado: NNNNNNN-DD.AAAA.J.TR.OOOO
    const punctuatedRegex = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/g;
    let match: RegExpExecArray | null;

    while ((match = punctuatedRegex.exec(text)) !== null) {
      const raw = match[1];
      const digits = this.clean(raw);
      if (this.validate(digits) && !foundMap.has(digits)) {
        foundMap.set(digits, {
          raw,
          normalized: digits,
          formatted: this.format(digits),
          tribunalKey: `${digits.substring(13, 14)}.${digits.substring(14, 16)}`,
        });
      }
    }

    // 2. Padrão Sem Pontuação: 20 dígitos contínuos
    const unpunctuatedRegex = /\b(\d{20})\b/g;
    while ((match = unpunctuatedRegex.exec(text)) !== null) {
      const raw = match[1];
      if (this.validate(raw) && !foundMap.has(raw)) {
        foundMap.set(raw, {
          raw,
          normalized: raw,
          formatted: this.format(raw),
          tribunalKey: `${raw.substring(13, 14)}.${raw.substring(14, 16)}`,
        });
      }
    }

    return Array.from(foundMap.values());
  },
};
