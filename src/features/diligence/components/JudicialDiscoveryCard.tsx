// ==========================================================
// DILIGÊNCIA 360 — Card de Processo Descoberto
// ==========================================================

import React from 'react';
import { ProcessDiscovery } from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

interface JudicialDiscoveryCardProps {
  discovery: ProcessDiscovery;
  onOpenDetails: (discovery: ProcessDiscovery) => void;
  onEnrich: (discovery: ProcessDiscovery) => void;
  isEnriching?: boolean;
}

export const JudicialDiscoveryCard: React.FC<JudicialDiscoveryCardProps> = ({
  discovery,
  onOpenDetails,
  onEnrich,
  isEnriching = false,
}) => {
  const { dataJud, sources, status } = discovery;

  const statusMap: Record<string, { label: string; variant: 'neutral' | 'medium' | 'high' | 'success' | 'critical' }> = {
    candidate: { label: 'Candidato (Aguardando Revisão)', variant: 'medium' },
    validated: { label: 'Validado (Confirmado)', variant: 'high' },
    enriched: { label: 'Enriquecido (DataJud)', variant: 'success' },
    discarded: { label: 'Descartado', variant: 'neutral' },
  };

  const currentStatus = statusMap[status] || { label: status, variant: 'neutral' };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.875rem 1.15rem',
        backgroundColor: status === 'discarded' ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        gap: '1rem',
        flexWrap: 'wrap',
        opacity: status === 'discarded' ? 0.65 : 1,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '240px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="font-mono" style={{ fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
            {discovery.formattedProcessNumber}
          </span>
          <Badge variant="neutral">{discovery.tribunal}</Badge>
          <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>
        </div>

        {/* Informações Enriquecidas do DataJud */}
        {dataJud ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            <strong>Classe:</strong> {dataJud.classe.nome} | <strong>Assunto:</strong> {dataJud.assuntos[0]?.nome || 'Geral'} • {dataJud.totalMovimentos} movimentações
          </div>
        ) : (
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
            Descoberto em {Formatters.date(discovery.firstDiscoveredAt)} • Aguardando consulta oficial no DataJud
          </div>
        )}

        {/* Proveniência / Fontes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
            Fontes ({sources.length}):
          </span>
          {sources.map((s, idx) => (
            <span
              key={idx}
              style={{
                fontSize: 'var(--text-2xs)',
                padding: '0.1rem 0.4rem',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-xs)',
                color: 'var(--text-secondary)',
              }}
            >
              {s.name}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {status !== 'enriched' && status !== 'discarded' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onEnrich(discovery)}
            disabled={isEnriching}
          >
            {isEnriching ? <Icons.Loader size={14} /> : <Icons.Database size={14} />}
            <span>Enriquecer DataJud</span>
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => onOpenDetails(discovery)}>
          Ver dossiê
        </Button>
      </div>
    </div>
  );
};
