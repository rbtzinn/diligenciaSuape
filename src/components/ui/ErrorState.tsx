// ==========================================================
// DILIGÊNCIA 360 — Componente ErrorState
// ==========================================================

import React from 'react';
import { Icons } from './Icons';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Ocorreu um erro',
  message,
  onRetry,
}) => {
  return (
    <div
      style={{
        padding: '1.5rem',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--status-high-bg)',
        border: '1px solid var(--status-high-border)',
        color: 'var(--status-high-text)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'var(--font-bold)' }}>
        <Icons.AlertTriangle size={20} />
        <span>{title}</span>
      </div>
      <p style={{ fontSize: 'var(--text-sm)' }}>{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
};
