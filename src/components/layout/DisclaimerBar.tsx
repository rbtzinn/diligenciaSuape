// ==========================================================
// DILIGÊNCIA 360 — Disclaimer Bar Institucional (Dispensável)
// ==========================================================

import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';

export const DisclaimerBar: React.FC = () => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const isDismissed = localStorage.getItem('dil360_disclaimer_dismissed');
    if (isDismissed === 'true') {
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('dil360_disclaimer_dismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div
      className="disclaimer-bar animate-fade-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.4rem 1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Icons.Info size={14} style={{ color: 'var(--brand-blue)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-xs)' }}>
          <strong>Diligência de Integridade:</strong> Análise automatizada baseada em regras e fontes públicas oficiais. Não substitui o parecer técnico do Compliance.
        </span>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        title="Ocultar aviso"
        aria-label="Ocultar aviso"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          padding: '0.2rem',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-xs)',
        }}
      >
        <Icons.X size={14} />
      </button>
    </div>
  );
};
