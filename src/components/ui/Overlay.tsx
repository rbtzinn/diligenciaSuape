// ==========================================================
// DILIGÊNCIA 360 — Camada sobre a tela
// ==========================================================
// Modal, gaveta, confirmação de saída e tutorial tinham cada um a
// sua própria versão do mesmo trabalho: portal, trava de rolagem do
// corpo, laço de foco no Tab, fechar no Escape e devolver o foco ao
// botão de origem. Quatro implementações, três delas incompletas —
// o modal não travava o foco, o tutorial não devolvia o foco, e dois
// deles escreviam `document.body.style.overflow` sem guardar o valor
// anterior, o que deixava a página travada quando dois se abriam em
// sequência.
//
// Este arquivo é a implementação única. Quem quiser uma camada nova
// usa `Overlay`; quem quiser só o comportamento usa os ganchos.
// ==========================================================

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Trava a rolagem do documento enquanto `active` for verdadeiro.
 * Conta as travas ativas: com duas camadas abertas, fechar a de cima
 * não pode destravar a página por baixo.
 */
let scrollLocks = 0;
let restoreOverflow = '';

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;

    if (scrollLocks === 0) {
      restoreOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    scrollLocks += 1;

    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) {
        document.body.style.overflow = restoreOverflow;
      }
    };
  }, [active]);
}

interface FocusTrapOptions {
  active: boolean;
  onEscape?: () => void;
  /** Elemento que recebe o foco de volta ao fechar. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /** Bloqueia Escape enquanto uma ação está em curso. */
  disableEscape?: boolean;
}

/**
 * Mantém o foco dentro do painel, move o foco para o primeiro
 * controle ao abrir e devolve para a origem ao fechar.
 */
export function useFocusTrap<T extends HTMLElement>(
  panelRef: React.RefObject<T | null>,
  { active, onEscape, returnFocusTo, disableEscape = false }: FocusTrapOptions,
): void {
  const escapeRef = useRef(onEscape);
  const blockedRef = useRef(disableEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
    blockedRef.current = disableEscape;
  }, [onEscape, disableEscape]);

  useEffect(() => {
    if (!active) return undefined;

    const origin =
      returnFocusTo?.current || (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first || panel).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (blockedRef.current) return;
        event.preventDefault();
        escapeRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      origin?.focus();
    };
    // `returnFocusTo` e `panelRef` são refs estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

interface OverlayProps {
  /** Onde o painel se apoia na tela. */
  placement?: 'center' | 'right' | 'bottom';
  /** Ordem de empilhamento. Gaveta abaixo, modal acima. */
  layer?: 'drawer' | 'modal';
  onBackdropClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Fundo escurecido e posicionamento do painel. Não decide o desenho
 * do painel — só onde ele fica e o que há atrás dele.
 */
export const Overlay: React.FC<OverlayProps> = ({
  placement = 'center',
  layer = 'modal',
  onBackdropClick,
  className,
  children,
}) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex bg-[rgb(10_31_53/0.55)] backdrop-blur-sm',
        layer === 'modal' ? 'z-modal' : 'z-drawer',
        placement === 'center' && 'items-center justify-center p-4',
        placement === 'right' && 'items-stretch justify-end',
        placement === 'bottom' && 'items-end justify-center',
        className,
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onBackdropClick?.();
      }}
    >
      {children}
    </div>,
    document.body,
  );
};
