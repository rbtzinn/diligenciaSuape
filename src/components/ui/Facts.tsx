// ==========================================================
// DILIGÊNCIA 360 — Fato e destaque numérico
// ==========================================================
// `Fact` é o par rótulo/valor que aparece no cartão de identificação,
// nas gavetas e no painel do mapa. `Stat` é o número grande — score
// de risco, contagem de entidades.
//
// Duas correções de leitura moram aqui. O score estava em
// monoespaçado, o que o fazia parecer um código de sistema em vez de
// uma nota; agora usa a fonte da interface com dígito de largura
// fixa. E ele era sempre azul da marca, mesmo quando o nível era
// "Atenção Moderada" — o número dizia uma coisa e a cor dizia outra.
// Agora a cor vem do nível.
// ==========================================================

import React from 'react';
import { cn } from '../../lib/cn';

export type FactTone = 'default' | 'ok' | 'warn' | 'high' | 'critical' | 'muted';

const TEXT_TONE: Record<FactTone, string> = {
  default: 'text-ink',
  ok: 'text-ok-text',
  warn: 'text-warn-text',
  high: 'text-high-text',
  critical: 'text-bad-text',
  muted: 'text-ink-3',
};

interface FactProps {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: FactTone;
  /** Documento e identificador em monoespaçado. */
  mono?: boolean;
  hint?: React.ReactNode;
  className?: string;
}

export const Fact: React.FC<FactProps> = ({ label, value, tone = 'default', mono = false, hint, className }) => (
  <div className={cn('min-w-0', className)}>
    <dt className="text-2xs font-medium uppercase tracking-wide text-ink-3">{label}</dt>
    <dd className={cn('mt-0.5 text-base font-bold leading-snug', mono && 'font-mono', TEXT_TONE[tone])}>{value}</dd>
    {hint ? <p className="mt-0.5 text-2xs leading-snug text-ink-muted">{hint}</p> : null}
  </div>
);

interface FactGridProps {
  /** Número de colunas na largura máxima. Abaixo disso encolhe só. */
  columns?: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}

/**
 * Grade de fatos. Duas colunas no celular e o número pedido a partir
 * de `sm` — um fato por linha desperdiça altura, e quatro colunas em
 * 360px corta todo valor.
 */
export const FactGrid: React.FC<FactGridProps> = ({ columns = 3, className, children }) => (
  <dl
    className={cn(
      'grid min-w-0 grid-cols-2 gap-x-4 gap-y-3',
      columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
      className,
    )}
  >
    {children}
  </dl>
);

interface StatProps {
  value: React.ReactNode;
  /** Linha logo abaixo do número: "de 100 · Atenção Moderada". */
  caption?: React.ReactNode;
  /** Frase de decisão, com peso de leitura. */
  decision?: React.ReactNode;
  tone?: FactTone;
  className?: string;
}

const STAT_SURFACE: Record<FactTone, string> = {
  default: 'border-brand-line bg-brand-soft',
  ok: 'border-ok-line bg-ok-bg',
  warn: 'border-warn-line bg-warn-bg',
  high: 'border-high-line bg-high-bg',
  critical: 'border-bad-line bg-bad-bg',
  muted: 'border-line bg-surface-subtle',
};

const STAT_NUMBER: Record<FactTone, string> = {
  default: 'text-brand',
  ok: 'text-ok-text',
  warn: 'text-warn-text',
  high: 'text-high-text',
  critical: 'text-bad-text',
  muted: 'text-ink-2',
};

export const Stat: React.FC<StatProps> = ({ value, caption, decision, tone = 'default', className }) => (
  <div
    className={cn(
      'flex min-w-0 items-center gap-3 rounded-lg border p-3 sm:flex-col sm:items-center sm:text-center',
      STAT_SURFACE[tone],
      className,
    )}
  >
    <span className={cn('num text-3xl font-extrabold leading-none tracking-tight', STAT_NUMBER[tone])}>{value}</span>
    <span className="min-w-0">
      {caption ? <span className="block text-2xs font-medium text-ink-2">{caption}</span> : null}
      {decision ? <span className="mt-0.5 block text-sm font-bold leading-snug text-ink">{decision}</span> : null}
    </span>
  </div>
);
