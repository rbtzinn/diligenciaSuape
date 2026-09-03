// ==========================================================
// DILIGÊNCIA 360 — Cartão do histórico
// ==========================================================
// O cartão era um `<div>` com `onClick`: não recebia foco, não
// respondia a Enter nem a Espaço, e o botão de excluir vivia dentro
// da área clicável, dependendo de `stopPropagation`. Agora a linha é
// um botão de verdade e a exclusão fica fora dele — não há mais como
// abrir um dossiê tentando apagá-lo.
// ==========================================================

import React from 'react';
import { DiligenceItem } from '../../diligence/types';
import type { StatusVariant } from '../../../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';

interface HistoryCardProps {
  item: DiligenceItem;
  onOpen: (item: DiligenceItem) => void;
  onDelete: (id: string) => void;
}

const SCORE_TONE: Record<string, string> = {
  low: 'border-ok-line bg-ok-bg text-ok-text',
  medium: 'border-warn-line bg-warn-bg text-warn-text',
  high: 'border-high-line bg-high-bg text-high-text',
  critical: 'border-bad-line bg-bad-bg text-bad-text',
};

const STATUS: Record<string, { label: string; variant: StatusVariant }> = {
  in_progress: { label: 'Em execução', variant: 'info' },
  pending_review: { label: 'Aguardando revisão', variant: 'primary' },
  in_review: { label: 'Em revisão', variant: 'primary' },
  returned_for_adjustments: { label: 'Devolvida', variant: 'medium' },
  completed: { label: 'Concluída', variant: 'success' },
};

export const HistoryCard: React.FC<HistoryCardProps> = ({ item, onOpen, onDelete }) => {
  const risco = item.risco;
  const cor = risco?.cor || 'low';
  const status = STATUS[item.status || 'completed'] || STATUS.completed;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-card border border-line bg-surface pr-2 shadow-xs transition-colors hover:border-line-strong hover:bg-surface-hover">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-card p-3 text-left"
      >
        <span
          aria-hidden="true"
          className={cn(
            'num grid size-10 shrink-0 place-items-center rounded-md border text-sm font-bold',
            SCORE_TONE[cor] || 'border-line bg-surface-subtle text-ink',
          )}
        >
          {risco?.score ?? 0}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-ink">{item.razaoSocial}</span>

          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3">
            <span className="font-mono">{item.cnpjFmt}</span>
            <span aria-hidden="true">•</span>
            <span>{Formatters.dateTime(item.dataAnalise)}</span>
            <span aria-hidden="true" className="hidden sm:inline">
              •
            </span>
            <span className="hidden sm:inline">Por: {item.createdBy?.name || 'Histórico'}</span>
          </span>

          {/* Os selos acompanham a linha em tela estreita, onde a
              coluna da direita não caberia. */}
          <span className="mt-1.5 flex flex-wrap gap-1.5 md:hidden">
            {item.persisted === false ? <Badge variant="medium" size="sm">Rascunho</Badge> : null}
            <Badge variant={status.variant} size="sm">{status.label}</Badge>
            <Badge variant={cor} size="sm">{risco?.nivel || 'Atenção Baixa'}</Badge>
          </span>
        </span>
      </button>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {item.persisted === false ? <Badge variant="medium" size="sm">Rascunho não persistido</Badge> : null}
        <Badge variant={status.variant} size="sm">{status.label}</Badge>
        <Badge variant={cor} size="sm">{risco?.nivel || 'Atenção Baixa'}</Badge>
      </div>

      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={() => onDelete(item.id)}
        title="Remover do histórico"
        aria-label={`Remover ${item.razaoSocial} do histórico`}
        icon={<Icons.Trash size={15} aria-hidden="true" />}
        className="shrink-0 hover:bg-high-bg hover:text-high-text"
      />
    </div>
  );
};
