// ==========================================================
// DILIGÊNCIA 360 — Cabeçalho do workspace
// ==========================================================
// O botão de menu era três `<span>` estilizados como hambúrguer no
// CSS, sem rótulo visível e sem estado de foco próprio. Passa a ser
// um ícone de verdade, com a mesma área de toque dos outros
// controles, e só aparece onde o menu lateral é gaveta.
// ==========================================================

import React from 'react';
import type { ViewType } from '../../types';
import { Icons } from '../ui/Icons';

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
    <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-gutter py-2.5">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menu principal"
        aria-controls="app-sidebar-navigation"
        className="grid size-9 shrink-0 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-hover hover:text-ink lg:hidden"
      >
        <Icons.Menu size={18} aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold leading-tight text-ink">{copy.title}</h1>
        <p className="truncate text-xs text-ink-3">{copy.description}</p>
      </div>

      <span
        title="Ambiente interno do Compliance"
        className="hidden shrink-0 items-center gap-1.5 rounded-chip border border-ok-line bg-ok-bg px-2.5 py-1 text-2xs font-semibold text-ok-text sm:inline-flex"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ok" />
        Ambiente interno
      </span>
    </header>
  );
};
