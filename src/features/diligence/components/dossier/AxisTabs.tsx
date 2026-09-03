// ==========================================================
// DILIGÊNCIA 360 — Fita de eixos do dossiê
// Eixo não consultado aparece apagado, para que a ausência de
// dado nunca se pareça com "consultamos e nada existe".
// ==========================================================

import React from 'react';
import type { DossierAxis } from './dossierAxes';

interface AxisTabsProps {
  axes: DossierAxis[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const AxisTabs: React.FC<AxisTabsProps> = ({ axes, activeId, onSelect }) => (
  <nav className="flex flex-wrap gap-1" aria-label="Eixos do dossiê">
    {axes.map((axis) => {
      const vazio = axis.status === 'nao-consultada';
      const ativo = axis.id === activeId;
      return (
        <button
          key={axis.id}
          type="button"
          onClick={() => onSelect(axis.id)}
          aria-current={ativo ? 'true' : undefined}
          className={[
            'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] cursor-pointer bg-transparent',
            ativo ? 'border-brand text-brand font-bold' : 'border-transparent',
            !ativo && vazio ? 'text-ink-muted' : '',
            !ativo && !vazio ? 'text-ink-2 hover:text-brand' : '',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'grid size-4 place-items-center rounded text-[10px] font-bold',
              vazio ? 'bg-surface-subtle text-ink-muted' : 'bg-brand-soft text-brand',
            ].join(' ')}
          >
            {axis.mark}
          </span>
          {axis.label}
          {axis.status === 'falhou' ? (
            <span className="size-1.5 rounded-full bg-high" title="Fonte não respondeu" />
          ) : null}
        </button>
      );
    })}
  </nav>
);
