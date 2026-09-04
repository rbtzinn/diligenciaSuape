// ==========================================================
// DILIGÊNCIA 360 — Aviso em bloco
// ==========================================================
// Substitui `.clean-state-block`, `.warn-state-block` e o alerta de
// erro que cada tela desenhava com estilo em linha. O tom diz o que
// a mensagem significa; a forma é sempre a mesma.
// ==========================================================

import React from 'react';
import { cn } from '../../lib/cn';

export type NoteTone = 'info' | 'ok' | 'warn' | 'high' | 'neutral';

interface NoteProps {
  tone?: NoteTone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** `alert` para erro que interrompe, `status` para confirmação. */
  role?: 'alert' | 'status';
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

const TONE: Record<NoteTone, string> = {
  info: 'border-info-line bg-info-bg text-info-text',
  ok: 'border-ok-line bg-ok-bg text-ok-text',
  warn: 'border-warn-line bg-warn-bg text-warn-text',
  high: 'border-high-line bg-high-bg text-high-text',
  neutral: 'border-line bg-surface-subtle text-ink-2',
};

export const Note: React.FC<NoteProps> = ({
  tone = 'info',
  icon,
  title,
  role,
  action,
  className,
  children,
}) => (
  <div
    role={role}
    aria-live={role ? 'polite' : undefined}
    className={cn('flex min-w-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm', TONE[tone], className)}
  >
    {icon ? <span aria-hidden="true" className="mt-px grid shrink-0 place-items-center">{icon}</span> : null}

    <div className="min-w-0 flex-1">
      {title ? <strong className="block font-bold leading-snug">{title}</strong> : null}
      {children ? <div className={cn('min-w-0 leading-relaxed', title && 'mt-0.5')}>{children}</div> : null}
    </div>

    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);
