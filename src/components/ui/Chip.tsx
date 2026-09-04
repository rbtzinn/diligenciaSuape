// ==========================================================
// DILIGÊNCIA 360 — Selo
// ==========================================================
// O selo de situação existia em cinco formatos diferentes: `.badge`
// no CSS, `.status-semaphore` no index.css, `.clean-state-block`,
// mais dois desenhados à mão dentro do dossiê. Todos diziam a mesma
// coisa — verde é limpo, âmbar é atenção, vermelho é achado — mas
// com raio, respiro e peso distintos.
//
// Aqui existe um só, com as variantes nomeadas pelo que significam
// e não pela cor, para que trocar a paleta não obrigue a reescrever
// as chamadas.
// ==========================================================

import React from 'react';
import { cn } from '../../lib/cn';

export type ChipTone =
  | 'neutral'
  | 'brand'
  | 'ok'
  | 'warn'
  | 'high'
  | 'critical'
  | 'info'
  | 'muted';

export type ChipSize = 'sm' | 'md';

interface ChipProps {
  tone?: ChipTone;
  size?: ChipSize;
  /** Preenchido, para selo que precisa de peso (situação do eixo). */
  solid?: boolean;
  /** Ponto de cor antes do rótulo. */
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  children: React.ReactNode;
}

const SOFT: Record<ChipTone, string> = {
  neutral: 'bg-neutral-soft text-neutral-text border-neutral-line',
  brand: 'bg-brand-soft text-brand-text border-brand-line',
  ok: 'bg-ok-bg text-ok-text border-ok-line',
  warn: 'bg-warn-bg text-warn-text border-warn-line',
  high: 'bg-high-bg text-high-text border-high-line',
  critical: 'bg-bad-bg text-bad-text border-bad-line',
  info: 'bg-info-bg text-info-text border-info-line',
  muted: 'bg-surface-subtle text-ink-3 border-line',
};

const SOLID: Record<ChipTone, string> = {
  neutral: 'bg-neutral-text text-white border-transparent',
  brand: 'bg-brand text-white border-transparent',
  ok: 'bg-ok text-white border-transparent',
  warn: 'bg-warn text-white border-transparent',
  high: 'bg-high text-white border-transparent',
  critical: 'bg-bad text-white border-transparent',
  info: 'bg-info text-white border-transparent',
  muted: 'bg-line-strong text-ink border-transparent',
};

const DOT: Record<ChipTone, string> = {
  neutral: 'bg-neutral-text',
  brand: 'bg-brand',
  ok: 'bg-ok',
  warn: 'bg-warn',
  high: 'bg-high',
  critical: 'bg-bad',
  info: 'bg-info',
  muted: 'bg-ink-muted',
};

export const Chip: React.FC<ChipProps> = ({
  tone = 'neutral',
  size = 'md',
  solid = false,
  dot = false,
  icon,
  className,
  title,
  children,
}) => (
  <span
    title={title}
    className={cn(
      'inline-flex max-w-full items-center gap-1.5 rounded-chip border font-semibold leading-tight',
      size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
      solid ? SOLID[tone] : SOFT[tone],
      className,
    )}
  >
    {dot ? <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', solid ? 'bg-current' : DOT[tone])} /> : null}
    {icon ? <span aria-hidden="true" className="grid shrink-0 place-items-center">{icon}</span> : null}
    <span className="truncate">{children}</span>
  </span>
);
