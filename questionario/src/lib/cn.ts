// ==========================================================
// DILIGÊNCIA 360 — Junção de classes
// ==========================================================
// Os componentes montam classe a partir de variante, tamanho e
// estado, e boa parte dos ramos é condicional. Sem um lugar para
// isso, cada arquivo reinventava um `[...].filter(Boolean).join(' ')`
// e sobrava espaço duplicado na classe final.
// ==========================================================

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

/**
 * Concatena classes ignorando valor falso, achatando lista e
 * aceitando mapa `{ classe: condição }`. Não resolve conflito entre
 * utilitários — a ordem de escrita é que decide, como no CSS.
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];

  const walk = (value: ClassValue): void => {
    if (!value) return;

    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text) out.push(text);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    for (const [key, enabled] of Object.entries(value)) {
      if (enabled) out.push(key);
    }
  };

  values.forEach(walk);
  return out.join(' ');
}
