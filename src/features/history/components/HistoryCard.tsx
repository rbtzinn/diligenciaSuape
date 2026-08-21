// ==========================================================
// DILIGÊNCIA 360 — Componente HistoryCard com Workflow e Autoria
// ==========================================================

import React from 'react';
import { DiligenceItem } from '../../diligence/types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

interface HistoryCardProps {
  item: DiligenceItem;
  onOpen: (item: DiligenceItem) => void;
  onDelete: (id: string) => void;
}

export const HistoryCard: React.FC<HistoryCardProps> = ({ item, onOpen, onDelete }) => {
  const risco = item.risco || {
    score: 0,
    nivel: 'Atenção Baixa',
    cor: 'low' as const,
    decisao: 'Conforme',
    decisaoDesc: 'Sem pendências',
    emoji: '🟢',
    fatores: [],
  };

  const bgMap: Record<string, string> = {
    low: 'var(--status-low-bg)',
    medium: 'var(--status-medium-bg)',
    high: 'var(--status-high-bg)',
    critical: 'var(--status-critical-bg)',
  };

  const textMap: Record<string, string> = {
    low: 'var(--status-low-text)',
    medium: 'var(--status-medium-text)',
    high: 'var(--status-high-text)',
    critical: 'var(--status-critical-text)',
  };

  const statusLabelMap: Record<string, { label: string; variant: 'info' | 'primary' | 'medium' | 'success' }> = {
    in_progress: { label: 'Em Execução', variant: 'info' },
    pending_review: { label: 'Aguardando Revisão', variant: 'primary' },
    in_review: { label: 'Em Revisão', variant: 'primary' },
    returned_for_adjustments: { label: 'Devolvida', variant: 'medium' },
    completed: { label: 'Concluída', variant: 'success' },
  };

  const statusConfig = statusLabelMap[item.status || 'completed'] || { label: 'Concluída', variant: 'success' };
  const cor = risco.cor || 'low';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.875rem 1.25rem',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        gap: '1rem',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        boxShadow: 'var(--shadow-xs)',
      }}
      onClick={() => onOpen(item)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: bgMap[cor] || 'var(--bg-surface-subtle)',
            color: textMap[cor] || 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'var(--font-bold)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            flexShrink: 0,
            border: '1px solid var(--border-default)',
          }}
        >
          {risco.score ?? 0}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-bold)',
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.razaoSocial}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
            <span className="font-mono">{item.cnpjFmt}</span>
            <span>•</span>
            <span>{Formatters.dateTime(item.dataAnalise)}</span>
            <span>•</span>
            <span>Por: {item.createdBy?.name || 'Histórico'}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        {item.persisted === false && (
          <Badge variant="medium">Rascunho não persistido</Badge>
        )}
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        <Badge variant={cor}>
          <span>{risco.nivel || 'Atenção Baixa'}</span>
        </Badge>

        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          title="Excluir do Histórico"
        >
          <Icons.Trash size={14} />
        </Button>
      </div>
    </div>
  );
};
