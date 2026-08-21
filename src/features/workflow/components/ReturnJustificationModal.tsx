// ==========================================================
// DILIGÊNCIA 360 — Modal de Justificativa de Devolução
// ==========================================================

import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';

interface ReturnJustificationModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (justification: string) => Promise<void>;
}

export const ReturnJustificationModal: React.FC<ReturnJustificationModalProps> = ({
  isOpen,
  isLoading,
  onClose,
  onSubmit,
}) => {
  const [justification, setJustification] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!justification.trim()) {
      alert('A justificativa de devolução é obrigatória.');
      return;
    }
    await onSubmit(justification.trim());
    setJustification('');
  };

  return (
    <div className="modal-backdrop animate-fade-in" style={{ zIndex: 1000 }}>
      <div className="modal-content animate-fade-in-up" style={{ maxWidth: '480px' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
          Devolver Diligência para Ajustes
        </h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
          Indique ao analista quais pendências requerem correção antes da aprovação final.
        </p>
        <textarea
          className="input-control"
          rows={4}
          placeholder="Descreva as pendências a serem ajustadas pelo analista..."
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          style={{ width: '100%', marginTop: '1rem' }}
          autoFocus
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" isLoading={isLoading} onClick={handleSubmit}>
            Confirmar Devolução
          </Button>
        </div>
      </div>
    </div>
  );
};
