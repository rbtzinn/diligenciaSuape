// ==========================================================
// DILIGÊNCIA 360 — Card de Notícia / Ocorrência de Mídia
// ==========================================================

import React from 'react';
import { AdverseMediaResult, AdverseMediaStatus } from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface AdverseMediaCardProps {
  item: AdverseMediaResult;
  onStatusChange?: (id: string, newStatus: AdverseMediaStatus) => void;
}

export const AdverseMediaCard: React.FC<AdverseMediaCardProps> = ({
  item,
  onStatusChange,
}) => {
  const matchConfig: Record<string, { label: string; variant: 'critical' | 'medium' | 'neutral' }> = {
    high: { label: 'Correspondência Forte', variant: 'critical' },
    medium: { label: 'Correspondência Média', variant: 'medium' },
    low: { label: 'Possível Homônimo', variant: 'neutral' },
  };

  const currentMatch = matchConfig[item.matchStrength] || matchConfig.low;

  return (
    <div
      style={{
        padding: '0.875rem 1rem',
        backgroundColor: item.status === 'discarded' ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        opacity: item.status === 'discarded' ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-bold)',
              color: 'var(--text-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              textDecoration: 'none',
            }}
            className="hover-underline"
          >
            <span>{item.title}</span>
            <Icons.ExternalLink size={12} style={{ color: 'var(--text-tertiary)' }} />
          </a>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {item.domain} {item.publishedAt ? `• ${item.publishedAt}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <Badge variant={currentMatch.variant}>{currentMatch.label}</Badge>
          {item.status === 'validated' && <Badge variant="high">Validado</Badge>}
          {item.status === 'discarded' && <Badge variant="neutral">Descartado</Badge>}
        </div>
      </div>

      {item.snippet && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
          {item.snippet}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>Termos:</span>
          {item.matchedTerms.slice(0, 4).map((term, idx) => (
            <span key={idx} className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
              {term}
            </span>
          ))}
          {item.processNumbers && item.processNumbers.length > 0 && (
            <span className="badge badge-info" style={{ fontSize: 'var(--text-2xs)' }}>
              {item.processNumbers.length} Processo(s) CNJ
            </span>
          )}
        </div>

        {onStatusChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {item.status !== 'validated' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStatusChange(item.id, 'validated')}
              >
                Validar
              </Button>
            )}
            {item.status !== 'discarded' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStatusChange(item.id, 'discarded')}
              >
                Descartar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
