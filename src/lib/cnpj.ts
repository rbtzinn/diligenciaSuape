// ==========================================================
// DILIGÊNCIA 360 — Utilitários de CNPJ
// Suporte completo a CNPJ Numérico e Alfanumérico (RFB 2026)
// ==========================================================

export const CNPJ = {
  /**
   * Remove formatação mantendo apenas caracteres alfanuméricos (A-Z, 0-9)
   */
  clean(cnpj: string | number): string {
    return String(cnpj).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  },

  /**
   * Formata CNPJ no padrão oficial: XX.XXX.XXX/XXXX-XX
   * Compatível com formato numérico tradicional e alfanumérico
   */
  format(cnpj: string | number): string {
    const cleaned = this.clean(cnpj);
    if (cleaned.length !== 14) return String(cnpj);
    return cleaned.replace(
      /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})([A-Z0-9]{2})$/,
      '$1.$2.$3/$4-$5'
    );
  },

  /**
   * Aplica máscara durante digitação preservando letras e números
   */
  mask(value: string): string {
    let cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 14);
    if (cleaned.length > 12) {
      cleaned = cleaned.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})([A-Z0-9]{0,2})/, '$1.$2.$3/$4-$5');
    } else if (cleaned.length > 8) {
      cleaned = cleaned.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{0,4})/, '$1.$2.$3/$4');
    } else if (cleaned.length > 5) {
      cleaned = cleaned.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{0,3})/, '$1.$2.$3');
    } else if (cleaned.length > 2) {
      cleaned = cleaned.replace(/^([A-Z0-9]{2})([A-Z0-9]{0,3})/, '$1.$2');
    }
    return cleaned;
  },

  /**
   * Validação oficial de CNPJ (Numérico e Alfanumérico RFB)
   * Para CNPJ alfanumérico: cada caractere 'c' vale (ASCII(c) - 48).
   */
  validate(cnpj: string): boolean {
    const cleaned = this.clean(cnpj);
    if (cleaned.length !== 14) return false;

    // Rejeita sequências com todos os caracteres iguais (ex: 00000000000000)
    if (/^([A-Z0-9])\1{13}$/.test(cleaned)) return false;

    const getCharValue = (char: string): number => {
      return char.charCodeAt(0) - 48;
    };

    const calcDigit = (base: string, weights: number[]): number => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) {
        sum += getCharValue(base[i]) * weights[i];
      }
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const digit1 = calcDigit(cleaned, weights1);
    const digit2 = calcDigit(cleaned, weights2);

    return (
      parseInt(cleaned[12], 10) === digit1 &&
      parseInt(cleaned[13], 10) === digit2
    );
  },

  isAlphanumeric(cnpj: string): boolean {
    return /[A-Z]/.test(this.clean(cnpj));
  }
};
