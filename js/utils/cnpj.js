// ============================================
// DILIGÊNCIA 360 — CNPJ Utilities
// Suporte a CNPJ alfanumérico (novo formato)
// ============================================

const CNPJ = {
  /**
   * Remove formatação do CNPJ (pontos, barras, hífens)
   * Mantém letras para CNPJ alfanumérico
   */
  clean(cnpj) {
    return String(cnpj).replace(/[.\-\/\s]/g, '').toUpperCase();
  },

  /**
   * Formata CNPJ: XX.XXX.XXX/XXXX-XX
   * Funciona com numérico e alfanumérico
   */
  format(cnpj) {
    const cleaned = this.clean(cnpj);
    if (cleaned.length !== 14) return cnpj;
    return cleaned.replace(
      /^(.{2})(.{3})(.{3})(.{4})(.{2})$/,
      '$1.$2.$3/$4-$5'
    );
  },

  /**
   * Valida CNPJ numérico (algoritmo oficial)
   * Para alfanumérico: valida apenas formato (14 caracteres)
   */
  validate(cnpj) {
    const cleaned = this.clean(cnpj);
    if (cleaned.length !== 14) return false;

    // CNPJ alfanumérico: aceita se tem 14 caracteres alfanuméricos
    const isAlphanumeric = /[A-Z]/.test(cleaned);
    if (isAlphanumeric) {
      return /^[A-Z0-9]{14}$/.test(cleaned);
    }

    // CNPJ numérico: validação completa
    if (/^(\d)\1{13}$/.test(cleaned)) return false;

    const calcDigit = (base, weights) => {
      let sum = 0;
      for (let i = 0; i < weights.length; i++) {
        sum += parseInt(base[i]) * weights[i];
      }
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    const digit1 = calcDigit(cleaned, weights1);
    const digit2 = calcDigit(cleaned, weights2);

    return (
      parseInt(cleaned[12]) === digit1 &&
      parseInt(cleaned[13]) === digit2
    );
  },

  /**
   * Formata durante digitação (input mask)
   * Aceita alfanumérico
   */
  mask(value) {
    let cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 14);
    if (cleaned.length > 12) {
      cleaned = cleaned.replace(/^(.{2})(.{3})(.{3})(.{4})(.{0,2})/, '$1.$2.$3/$4-$5');
    } else if (cleaned.length > 8) {
      cleaned = cleaned.replace(/^(.{2})(.{3})(.{3})(.{0,4})/, '$1.$2.$3/$4');
    } else if (cleaned.length > 5) {
      cleaned = cleaned.replace(/^(.{2})(.{3})(.{0,3})/, '$1.$2.$3');
    } else if (cleaned.length > 2) {
      cleaned = cleaned.replace(/^(.{2})(.{0,3})/, '$1.$2');
    }
    return cleaned;
  },

  /**
   * Verifica se é alfanumérico
   */
  isAlphanumeric(cnpj) {
    return /[A-Za-z]/.test(cnpj);
  }
};

export default CNPJ;
