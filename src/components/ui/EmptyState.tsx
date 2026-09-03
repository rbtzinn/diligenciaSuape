// ==========================================================
// DILIGÊNCIA 360 — Estado vazio
// ==========================================================
// Era um bloco de estilo em linha com respiro fixo de 3rem, que no
// celular ocupava mais altura do que a tela e empurrava a ação para
// fora da vista.
// ==========================================================

import React from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** `deep` para uso sobre a superfície escura do mapa. */
  tone?: 'default' | 'deep';
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  tone = 'default',
  className,
}) => {
  const deep = tone === 'deep';

  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-8 text-center sm:py-12', className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'mb-1 grid size-11 place-items-center rounded-full',
            deep ? 'bg-deep-hover text-on-deep-3' : 'bg-surface-subtle text-ink-muted',
          )}
        >
          {icon}
        </span>
      ) : null}

      <h3 className={cn('text-md font-bold', deep ? 'text-on-deep' : 'text-ink')}>{title}</h3>

      {description ? (
        <p className={cn('max-w-prose text-sm leading-relaxed', deep ? 'text-on-deep-2' : 'text-ink-3')}>
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
};
