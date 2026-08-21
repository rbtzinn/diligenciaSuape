// ==========================================================
// DILIGÊNCIA 360 — Card de Processo Judicial Individual
// ==========================================================

import React from 'react';
import { JudicialProcessItem } from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface JudicialProcessCardProps {
  proc: JudicialProcessItem;
  onOpenDetails: (proc: JudicialProcessItem) => void;
  onRemove: (numLimpo: string) => void;
}

export const JudicialProcessCard: React.FC<JudicialProcessCardProps> = ({
  proc,
  onOpenDetails,
  onRemove,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.875rem 1.15rem',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '220px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="font-mono" style={{ fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
            {proc.numero}
          </span>
          <Badge variant="neutral">{proc.tribunal}</Badge>
          <Badge variant={proc.categoria.badgeVariant}>{proc.categoria.label}</Badge>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          <strong>Classe:</strong> {proc.classe.nome} | <strong>Assunto:</strong> {proc.assuntos[0]?.nome || 'Não informado'}
        </div>
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
          {proc.orgaoJulgador.nome} • {proc.totalMovimentos} movimentações registradas
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <Button variant="secondary" size="sm" onClick={() => onOpenDetails(proc)}>
          Ver detalhes
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(proc.numeroLimpo)}
          title="Desvincular processo"
        >
          <Icons.Trash size={14} />
        </Button>
      </div>
    </div>
  );
};
