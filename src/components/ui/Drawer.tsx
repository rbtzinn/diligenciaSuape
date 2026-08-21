// ==========================================================
// DILIGÊNCIA 360 — Componente Drawer (Gaveta / Modal Lateral)
// ==========================================================

import React, { useEffect } from 'react';
import { Icons } from './Icons';
import { Button } from './Button';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      <div
        className={`drawer-backdrop ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={`drawer-panel ${isOpen ? 'active' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-header">
          <div>
            <h3 className="drawer-title">{title}</h3>
            {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} title="Fechar">
            <Icons.Close size={18} />
          </Button>
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
    </>
  );
};
