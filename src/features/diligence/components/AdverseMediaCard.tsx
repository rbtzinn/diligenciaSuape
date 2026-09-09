// ==========================================================
// DILIGÊNCIA 360 — Card de Notícia / Ocorrência de Mídia
// ==========================================================

import React from 'react';
import { AdverseMediaResult, AdverseMediaStatus } from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { safeNewsUrl, newsSubjects } from '../utils/newsResults';
import { formatMediaProviders } from '../utils/mediaSources';

interface AdverseMediaCardProps {
  item: AdverseMediaResult;
  onStatusChange?: (id: string, newStatus: AdverseMediaStatus) => void;
}

export const AdverseMediaCard: React.FC<AdverseMediaCardProps> = ({
  item,
  onStatusChange,
}) => {
  const isPerson = item.subjectType === 'person';
  const matchConfig: Record<string, { label: string; variant: 'critical' | 'medium' | 'neutral' }> = isPerson ? {
    high: { label: 'Nome + contexto', variant: 'medium' },
    medium: { label: item.personMatch?.fullName === false ? 'Nome parcial ou variante' : 'Nome completo', variant: 'medium' },
    low: { label: 'Associação fraca', variant: 'neutral' },
  } : {
    high: { label: 'Empresa identificada', variant: 'neutral' },
    medium: { label: 'Nome compatível', variant: 'neutral' },
    low: { label: 'Correlação baixa', variant: 'neutral' },
  };

  // Quando a camada de resolução de identidade respondeu, o selo passa a dizer
  // o nível dela: "CNPJ confirmado" é afirmação mais forte, e mais verificável,
  // do que "empresa identificada".
  const ENTITY_LEVEL_LABEL: Record<string, string> = {
    CONFIRMED: 'CNPJ confirmado',
    HIGH_CONFIDENCE: 'Empresa identificada',
    POSSIBLE: 'Identificação possível',
    FALSE_POSITIVE: 'Identificação não sustentada',
  };
  const entityLevel = !isPerson ? item.entityMatch?.level : undefined;
  const currentMatch = entityLevel
    ? {
      label: ENTITY_LEVEL_LABEL[entityLevel] || ENTITY_LEVEL_LABEL.POSSIBLE,
      variant: (entityLevel === 'CONFIRMED' ? 'medium' : 'neutral') as 'critical' | 'medium' | 'neutral',
    }
    : matchConfig[item.matchStrength] || matchConfig.low;

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
        <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-bold)', color: isPerson ? 'var(--status-medium-text)' : 'var(--brand-primary)' }}>
              {isPerson ? 'PESSOA PESQUISADA' : 'EMPRESA PESQUISADA'}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 'var(--font-semibold)' }}>
              {item.subjectName || 'Entidade da diligência'}
            </span>
            {item.subjectQualification ? (
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>· {item.subjectQualification}</span>
            ) : null}
          </div>
          <a
            href={safeNewsUrl(item.url)}
            target="_blank"
            rel="noopener noreferrer"
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
            <span style={{ overflowWrap: 'anywhere' }}>{item.title}</span>
            <Icons.ExternalLink size={12} style={{ color: 'var(--text-tertiary)' }} />
          </a>
          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
            {item.domain} {item.publishedAt ? `• ${new Date(item.publishedAt).toLocaleDateString('pt-BR')}` : '• Data não informada'}
          </div>
          {item.providerSources && item.providerSources.length > 0 ? (
            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginTop: '0.1rem' }}>
              Localizada por {formatMediaProviders(item.providerSources)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <Badge variant={item.riskRelevant === false ? 'neutral' : 'medium'}>
            {item.riskRelevant === false ? 'Menção geral' : 'Termo de atenção'}
          </Badge>
          <Badge variant={currentMatch.variant}>{currentMatch.label}</Badge>
          {item.status === 'validated' && <Badge variant="high">Associação revisada</Badge>}
          {item.status === 'discarded' && <Badge variant="neutral">Descartado</Badge>}
        </div>
      </div>

      {newsSubjects(item).length > 1 && <p className="text-xs text-ink-3">Também menciona: {newsSubjects(item).filter((name) => name !== item.subjectName).join(', ')}</p>}
      {item.personMatch?.maskedCpf && <p className="text-xs text-ink-3">CPF mascarado compatível no trecho; associação sujeita à revisão.</p>}
      {item.snippet && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
          {item.snippet}
        </p>
      )}

      {isPerson ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', lineHeight: '1.45' }}>
          <Icons.Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>O nome aparece no conteúdo, mas a identidade e o teor ainda precisam ser confirmados. Isto não é registro de crime nem de condenação.</span>
        </div>
      ) : item.entityMatch ? (
        // Por que este documento é da empresa. Sem esta linha, quem revisa teria
        // de confiar no selo sem poder conferir o que o sustenta.
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', padding: '0.55rem 0.65rem', color: 'var(--text-secondary)', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-2xs)', lineHeight: '1.45' }}>
          <Icons.Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>Identidade: {item.entityMatch.basis}.</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
            {item.matchedTerms.length > 0 ? 'Termos:' : 'Nenhum termo adverso no trecho retornado'}
          </span>
          {item.matchedTerms.slice(0, 4).map((term, idx) => (
            <span key={idx} className="inline-flex max-w-full items-center gap-1.5 rounded-chip border px-2 py-0.5 text-2xs font-semibold leading-tight border-neutral-line bg-neutral-soft text-neutral-text">
              {term}
            </span>
          ))}
          {item.processNumbers && item.processNumbers.length > 0 && (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-chip border px-2 py-0.5 text-2xs font-semibold leading-tight border-info-line bg-info-bg text-info-text">
              {item.processNumbers.length} Processo(s) CNJ
            </span>
          )}
          {item.questionnaireRefs?.map((reference) => (
            <span key={reference} className="inline-flex max-w-full items-center gap-1.5 rounded-chip border px-2 py-0.5 text-2xs font-semibold leading-tight border-info-line bg-info-bg text-info-text">
              Questão {reference}
            </span>
          ))}
        </div>

        {onStatusChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
            {item.status !== 'validated' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStatusChange(item.id, 'validated')}
              >
                Confirmar associação
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
