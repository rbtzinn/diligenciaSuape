// ==========================================================
// DILIGÊNCIA 360 — Componente HistoryEmptyState
// ==========================================================

import React from 'react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface HistoryEmptyStateProps {
  onNewDiligence: () => void;
}

export const HistoryEmptyState: React.FC<HistoryEmptyStateProps> = ({ onNewDiligence }) => {
  return (
    <EmptyState
      icon={<Icons.History size={36} />}
      title="Nenhuma diligência no histórico"
      description="As análises realizadas por CNPJ ficarão salvas aqui para consulta rápida e rastreabilidade."
      action={
        <Button variant="primary" size="md" icon={<Icons.Search size={16} />} onClick={onNewDiligence}>
          Iniciar Nova Diligência
        </Button>
      }
    />
  );
};
