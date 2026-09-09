// ==========================================================
// DILIGÊNCIA 360 — Seção
// ==========================================================
// O cartão com cabeçalho é a unidade de leitura do app: aparece no
// dossiê, no histórico, nas fontes, nas gavetas e no painel do mapa.
// Antes cada tela redesenhava esse cartão — bordas de raio
// diferente, cabeçalho com fundo em uma tela e sem fundo na outra,
// respiro interno entre 12px e 24px. Agora existe um só, com o
// cabeçalho opcional e a variante recolhível embutida.
// ==========================================================

import React, { useId, useState } from 'react';
import { cn } from '../../lib/cn';

export type SectionTone = 'default' | 'deep';

interface SectionProps {
  /** Sigla do eixo, no quadradinho à esquerda do título. */
  mark?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Canto direito do cabeçalho: selo de situação, contagem, ação. */
  trailing?: React.ReactNode;
  /** Barra de rodapé, separada do corpo por um traço. */
  footer?: React.ReactNode;
  /** Quando definido, o cabeçalho vira botão de abrir e fechar. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  tone?: SectionTone;
  /** Tira o respiro interno do corpo — para tabela e lista que já
      têm o seu, e para o canvas do mapa. */
  flush?: boolean;
  /**
   * Sem casca de cartão: fio fino no lugar de moldura, fundo do papel
   * no lugar de superfície. É a forma que a seção assume dentro da
   * ficha, onde uma pilha de caixas iguais competiria com a hierarquia
   * que as próprias seções (A), (B), (C) já estabelecem.
   */
  plain?: boolean;
  id?: string;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  mark,
  title,
  subtitle,
  trailing,
  footer,
  collapsible = false,
  defaultOpen = true,
  tone = 'default',
  flush = false,
  plain = false,
  id,
  className,
  bodyClassName,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const deep = tone === 'deep';
  const hasHeader = Boolean(mark || title || trailing);
  const visible = collapsible ? open : true;

  const headerInner = (
    <>
      {mark ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-sm text-2xs font-bold',
            deep ? 'bg-deep-hover text-on-deep' : 'bg-brand-soft text-brand',
          )}
        >
          {mark}
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold leading-snug">{title}</span>
        {subtitle ? (
          <span className={cn('block truncate text-xs font-normal', deep ? 'text-on-deep-2' : 'text-ink-3')}>
            {subtitle}
          </span>
        ) : null}
      </span>

      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}

      {collapsible ? (
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('shrink-0 transition-transform', open ? 'rotate-180' : '', deep ? 'text-on-deep-3' : 'text-ink-3')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      ) : null}
    </>
  );

  const headerClasses = plain
    ? cn(
        'flex w-full min-w-0 items-center gap-2.5 py-2 text-left transition-colors',
        visible && 'border-b border-line-soft',
        'text-ink',
        collapsible && 'hover:text-brand',
      )
    : cn(
        'flex w-full min-w-0 items-center gap-2.5 px-4 py-3 text-left',
        visible && 'border-b',
        deep ? 'border-deep-line bg-deep-raised text-on-deep' : 'border-line-soft bg-surface-subtle text-ink',
        collapsible && (deep ? 'hover:bg-deep-hover' : 'hover:bg-surface-hover'),
        'transition-colors',
      );

  return (
    <section
      id={id}
      className={cn(
        'min-w-0',
        plain
          ? 'border-b border-line text-ink last:border-b-0'
          : cn(
              'overflow-hidden rounded-card border shadow-xs',
              deep ? 'border-deep-line bg-deep-raised text-on-deep' : 'border-line bg-surface text-ink',
            ),
        className,
      )}
    >
      {hasHeader ? (
        collapsible ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={bodyId} className={headerClasses}>
            {headerInner}
          </button>
        ) : (
          <div className={headerClasses}>{headerInner}</div>
        )
      ) : null}

      {visible ? (
        <div id={bodyId} className={cn('min-w-0', !flush && (plain ? 'py-3' : 'p-4'), bodyClassName)}>
          {children}
        </div>
      ) : null}

      {visible && footer ? (
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-2 border-t px-4 py-3',
            deep ? 'border-deep-line bg-deep/40' : 'border-line-soft bg-surface-subtle',
          )}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
};
