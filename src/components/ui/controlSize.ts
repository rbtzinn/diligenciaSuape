// ==========================================================
// DILIGÊNCIA 360 — Escala de tamanho dos controles
// Um único eixo small · medium · large para botões, badges e
// cards. Os apelidos por extenso existem porque já eram aceitos
// pelo Button; manter os dois evita quebrar chamadas existentes.
// ==========================================================

export type ControlSize = 'sm' | 'md' | 'lg' | 'small' | 'medium' | 'large';

/** Forma canônica usada nas classes CSS. */
export type ResolvedControlSize = 'sm' | 'md' | 'lg';

const ALIASES: Record<ControlSize, ResolvedControlSize> = {
  sm: 'sm',
  small: 'sm',
  md: 'md',
  medium: 'md',
  lg: 'lg',
  large: 'lg',
};

export function resolveControlSize(size: ControlSize = 'md'): ResolvedControlSize {
  return ALIASES[size] ?? 'md';
}
