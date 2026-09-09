// ==========================================================
// DILIGÊNCIA 360 — Gaveta
// ==========================================================
// O cabeçalho da gaveta pedia a fonte 'Bahnschrift SemiCondensed',
// que o projeto não carrega: na prática caía em Arial Narrow, e a
// gaveta era a única parte do app com outra família tipográfica.
// Junto com isso vinham 108px de altura mínima de cabeçalho, um
// degradê radial e um filete dourado de 4px — nada disso aparecia em
// nenhuma outra superfície.
//
// A gaveta agora é a mesma superfície do resto: fundo claro, título
// na tipografia da interface, e a faixa da marca reduzida a um
// detalhe. A largura é um `prop`, não uma classe de CSS externa.
// ==========================================================

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { Icons } from './Icons';
import { Button } from './Button';
import { Overlay, useFocusTrap, useScrollLock } from './Overlay';

export type DrawerWidth = 'md' | 'lg' | 'xl';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Ações no cabeçalho, à esquerda do botão de fechar. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: DrawerWidth;
  className?: string;
}

const WIDTH: Record<DrawerWidth, string> = {
  md: 'sm:max-w-[560px]',
  lg: 'sm:max-w-[720px]',
  xl: 'sm:max-w-[940px]',
};

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  eyebrow = 'Detalhes verificáveis',
  actions,
  children,
  footer,
  width = 'lg',
  className,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  // Mantém o painel montado durante a animação de saída.
  const [mounted, setMounted] = useState(isOpen);

  useScrollLock(isOpen);
  useFocusTrap(panelRef, { active: isOpen, onEscape: onClose });

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMounted(false), 240);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!mounted) return null;

  return (
    <Overlay
      placement="right"
      layer="drawer"
      onBackdropClick={onClose}
      className={cn('transition-opacity duration-200', isOpen ? 'opacity-100' : 'opacity-0')}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface text-ink shadow-overlay',
          'border-line sm:m-3 sm:h-[calc(100dvh-1.5rem)] sm:rounded-xl sm:border',
          WIDTH[width],
          'transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
      >
        <header className="flex min-w-0 items-start gap-3 border-b-2 border-gold bg-brand-deep px-4 py-3.5 text-white sm:px-5">
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <span className="block text-2xs font-bold uppercase tracking-wider text-[color:var(--brand-blue-border)]">
                {eyebrow}
              </span>
            ) : null}
            <h2 className="mt-0.5 text-lg font-bold leading-tight [overflow-wrap:anywhere]">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-xs leading-snug text-[color:var(--brand-blue-border)]">{subtitle}</p>
            ) : null}
          </div>

          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de detalhes"
            className="on-deep grid size-8 shrink-0 place-items-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Icons.Close size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto bg-canvas p-4 sm:p-5">{children}</div>

        <footer className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-surface px-4 py-3 sm:px-5">
          {footer || (
            <Button variant="secondary" size="sm" onClick={onClose}>
              Fechar
            </Button>
          )}
        </footer>
      </div>
    </Overlay>
  );
};
