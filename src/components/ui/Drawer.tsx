// ==========================================================
// DILIGÊNCIA 360 — Componente Drawer (Gaveta / Modal Lateral)
// ==========================================================

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';
import { Button } from './Button';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  panelClassName = '',
}) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      return undefined;
    }
    const exitTimer = window.setTimeout(() => setIsRendered(false), 260);
    return () => window.clearTimeout(exitTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (firstFocusable || panelRef.current)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
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
      document.body.style.overflow = previousOverflow;
      previousActive?.focus();
    };
  }, [isOpen]);

  if (!isRendered) return null;

  return createPortal(
    <>
      <div
        className={`drawer-backdrop ${isOpen ? 'active' : ''}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={`drawer-panel ${panelClassName} ${isOpen ? 'active' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div>
            <span className="drawer-eyebrow">Detalhes verificáveis</span>
            <h2 id={titleId} className="drawer-title">{title}</h2>
            {subtitle ? <p id={subtitleId} className="drawer-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="drawer-close-button" onClick={onClose} aria-label="Fechar painel de detalhes">
            <Icons.Close size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        <div className="drawer-footer">
          {footer ? (
            footer
          ) : (
            <Button variant="secondary" size="sm" onClick={onClose}>
              Fechar
            </Button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
};
