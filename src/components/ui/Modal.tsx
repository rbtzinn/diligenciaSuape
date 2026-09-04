// ==========================================================
// DILIGÊNCIA 360 — Modal
// ==========================================================
// Era ~230 linhas de estilo em linha, incluindo dois manipuladores
// de mouse para simular `:hover` no botão de fechar. Agora é a casca
// sobre `Overlay`, com o laço de foco que faltava.
// ==========================================================

import React, { useRef } from 'react';
import { cn } from '../../lib/cn';
import { Icons } from './Icons';
import { Overlay, useFocusTrap, useScrollLock } from './Overlay';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'small' | 'medium' | 'large';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  closeOnBackdropClick?: boolean;
  showCloseButton?: boolean;
  /** `alertdialog` para confirmação destrutiva. */
  role?: 'dialog' | 'alertdialog';
  /** Elemento que recebe o foco de volta ao fechar. Sem ele o laço
      de foco devolve para quem estava ativo na abertura. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /** Bloqueia Escape enquanto uma ação está em curso. */
  disableEscape?: boolean;
}

const SIZE: Record<string, string> = {
  sm: 'max-w-[420px]',
  small: 'max-w-[420px]',
  md: 'max-w-[540px]',
  medium: 'max-w-[540px]',
  lg: 'max-w-[680px]',
  large: 'max-w-[680px]',
  xl: 'max-w-[840px]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  children,
  footer,
  className,
  closeOnBackdropClick = true,
  showCloseButton = true,
  role = 'dialog',
  returnFocusTo,
  disableEscape = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useScrollLock(isOpen);
  useFocusTrap(panelRef, { active: isOpen, onEscape: onClose, returnFocusTo, disableEscape });

  if (!isOpen) return null;

  return (
    <Overlay placement="center" layer="modal" onBackdropClick={closeOnBackdropClick ? onClose : undefined}>
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-overlay',
          SIZE[size] || SIZE.md,
          className,
        )}
      >
        {title || showCloseButton ? (
          <header className="flex min-w-0 items-start gap-3 border-b border-line-soft px-4 py-3.5 sm:px-5">
            {icon ? (
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
                {icon}
              </span>
            ) : null}

            <div className="min-w-0 flex-1">
              {title ? <h2 className="text-md font-bold leading-snug text-ink">{title}</h2> : null}
              {subtitle ? <p className="mt-0.5 text-xs leading-snug text-ink-3">{subtitle}</p> : null}
            </div>

            {showCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink"
              >
                <Icons.X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </header>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">{children}</div>

        {footer ? (
          <footer className="flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-surface-subtle px-4 py-3 sm:px-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </Overlay>
  );
};
