// ==========================================================
// DILIGÊNCIA 360 — Fita de abas
// ==========================================================
// A fita de eixos do dossiê quebrava em duas e três fileiras no
// celular: cada quebra mudava a altura do cabeçalho, o traço da aba
// ativa sumia no meio da pilha e o conjunto parecia um bloco de
// links sem estilo.
//
// Aqui a fita nunca quebra. Ela rola na horizontal, a aba ativa é
// trazida para dentro da vista quando muda, e a lista é anunciada
// como `tablist` para quem navega por teclado ou leitor de tela.
// ==========================================================

import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  /** Sigla no quadradinho à esquerda do rótulo. */
  mark?: string;
  /** Contagem à direita do rótulo. */
  count?: number | string;
  /** Aba cujo dado não foi consultado: fica apagada, porque ausência
      de consulta não é o mesmo que ausência de ocorrência. */
  dim?: boolean;
  /** Ponto de alerta — fonte que não respondeu. */
  alert?: boolean;
  alertTitle?: string;
}

interface TabStripProps {
  items: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  label: string;
  tone?: 'default' | 'deep';
  className?: string;
}

export const TabStrip: React.FC<TabStripProps> = ({
  items,
  activeId,
  onSelect,
  label,
  tone = 'default',
  className,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const deep = tone === 'deep';

  // Trocar de aba pelo teclado ou por um atalho de outra parte da
  // tela não deve deixar a aba ativa fora da vista.
  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = items.findIndex((item) => item.id === activeId);
    if (index < 0) return;
    const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
    const target = items[(next + items.length) % items.length];
    if (target) {
      event.preventDefault();
      onSelect(target.id);
    }
  };

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={label}
      onKeyDown={moveFocus}
      className={cn('scroll-fita -mx-gutter px-gutter', className)}
    >
      <div className="flex w-max items-stretch gap-0.5">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(item.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-2 text-sm transition-colors',
                active
                  ? deep
                    ? 'border-on-deep font-bold text-on-deep'
                    : 'border-brand font-bold text-brand'
                  : cn(
                      'border-transparent font-medium',
                      item.dim
                        ? deep ? 'text-on-deep-3' : 'text-ink-muted'
                        : deep ? 'text-on-deep-2 hover:text-on-deep' : 'text-ink-2 hover:text-brand',
                    ),
              )}
            >
              {item.mark ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-4 place-items-center rounded-sm text-[10px] font-bold',
                    item.dim && !active
                      ? deep ? 'bg-deep-hover text-on-deep-3' : 'bg-surface-active text-ink-muted'
                      : deep ? 'bg-deep-hover text-on-deep' : 'bg-brand-soft text-brand',
                  )}
                >
                  {item.mark}
                </span>
              ) : null}

              {item.label}

              {item.count !== undefined && item.count !== '' ? (
                <span
                  className={cn(
                    'num rounded-chip px-1.5 text-2xs font-semibold',
                    deep ? 'bg-deep-hover text-on-deep-2' : 'bg-surface-active text-ink-2',
                  )}
                >
                  {item.count}
                </span>
              ) : null}

              {item.alert ? (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-high"
                  title={item.alertTitle || 'Fonte não respondeu'}
                  aria-label={item.alertTitle || 'Fonte não respondeu'}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};
