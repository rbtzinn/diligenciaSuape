import React from 'react';
import type { ViewType } from '../../types';

interface WorkspaceHeaderProps {
  currentView: ViewType;
  onOpenMenu: () => void;
}

const VIEW_COPY: Record<ViewType, { title: string; description: string }> = {
  chat: {
    title: 'Nova diligência',
    description: 'Consulte um CNPJ e acompanhe a análise',
  },
  dashboard: {
    title: 'Dossiê de integridade',
    description: 'Decisão, vínculos e evidências em um só lugar',
  },
  history: {
    title: 'Histórico',
    description: 'Retome análises já realizadas',
  },
  sources: {
    title: 'Fontes oficiais',
    description: 'Cobertura, disponibilidade e rastreabilidade',
  },
};

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({ currentView, onOpenMenu }) => {
  const copy = VIEW_COPY[currentView];

  return (
    <header className="workspace-header">
      <button
        type="button"
        className="workspace-menu-button"
        onClick={onOpenMenu}
        aria-label="Abrir menu principal"
        aria-controls="app-sidebar-navigation"
      >
        <span />
        <span />
        <span />
      </button>

      <div className="workspace-header-copy">
        <strong>{copy.title}</strong>
        <span>{copy.description}</span>
      </div>

      <div className="workspace-header-status" title="Ambiente interno do Compliance">
        <span />
        Ambiente interno
      </div>
    </header>
  );
};
