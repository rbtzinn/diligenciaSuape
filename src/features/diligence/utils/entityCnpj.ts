// ==========================================================
// DILIGÊNCIA 360 — CNPJ de entidades do grafo
// Permite abrir uma nova diligência a partir de uma empresa
// que apareceu como sócia, controladora ou vínculo no mapa.
// ==========================================================

import type { EgosEntity, Shareholder } from '../types';

const CNPJ_KEYS = ['cnpj', 'cnpjLimpo', 'cnpjBasico', 'documento', 'document', 'taxId', 'identifier'];

function digitsOf(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function isCnpj(value: unknown): boolean {
  return digitsOf(value).length === 14;
}

export function formatCnpj(value: string): string {
  const digits = digitsOf(value);
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Procura um CNPJ completo na entidade: primeiro nos identificadores
 * declarados pela fonte, depois nas propriedades livres do grafo.
 * CNPJ mascarado ou básico (8 dígitos) não serve para abrir diligência.
 */
export function extractEntityCnpj(entity?: EgosEntity | null): string | null {
  if (!entity) return null;

  for (const identifier of entity.identifiers || []) {
    const kind = String(identifier.identifierType || identifier.type || '').toUpperCase();
    if (kind.includes('CNPJ') && isCnpj(identifier.value)) return digitsOf(identifier.value);
  }

  const properties = entity.properties || {};
  for (const key of CNPJ_KEYS) {
    if (isCnpj(properties[key])) return digitsOf(properties[key]);
  }

  return null;
}

/** Sócio pessoa jurídica traz o CNPJ completo no próprio campo de documento. */
export function extractShareholderCnpj(shareholder?: Shareholder | null): string | null {
  if (!shareholder) return null;
  const raw = shareholder.cnpj_cpf_do_socio;
  if (String(raw ?? '').includes('*')) return null;
  return isCnpj(raw) ? digitsOf(raw) : null;
}

/**
 * A empresa investigada não deve oferecer o atalho para si mesma.
 */
export function isDrillableCompany(
  entity: EgosEntity | null | undefined,
  currentCnpj?: string,
): boolean {
  if (!entity || entity.type !== 'Company') return false;
  const cnpj = extractEntityCnpj(entity);
  if (!cnpj) return false;
  return cnpj !== digitsOf(currentCnpj);
}
