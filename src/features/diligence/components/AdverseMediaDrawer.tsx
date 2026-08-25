// ==========================================================
// DILIGÊNCIA 360 — Drawer de Todas as Ocorrências de Mídia Web
// ==========================================================

import React, { useState } from 'react';
import { AdverseMediaSummary, AdverseMediaStatus } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { AdverseMediaCard } from './AdverseMediaCard';
import { Formatters } from '../../../lib/formatters';

interface AdverseMediaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  adverseMedia?: AdverseMediaSummary;
  onStatusChange?: (id: string, newStatus: AdverseMediaStatus) => void;
}

export const AdverseMediaDrawer: React.FC<AdverseMediaDrawerProps> = ({
  isOpen,
  onClose,
  adverseMedia,
  onStatusChange,
}) => {
  const [filter, setFilter] = useState<'all' | 'person' | 'company' | 'high' | 'validated' | 'discarded'>('all');
  const [showQueries, setShowQueries] = useState(false);

  if (!adverseMedia) return null;

  const results = adverseMedia.results || [];
  const companyCount = adverseMedia.companyResultsCount ?? results.filter((item) => item.subjectType !== 'person').length;
  const personCount = adverseMedia.personResultsCount ?? results.filter((item) => item.subjectType === 'person').length;
  const filtered = results.filter((r) => {
    if (filter === 'person') return r.subjectType === 'person';
    if (filter === 'company') return r.subjectType !== 'person';
    if (filter === 'high') return r.matchStrength === 'high';
    if (filter === 'validated') return r.status === 'validated';
    if (filter === 'discarded') return r.status === 'discarded';
    return true;
  });

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Ocorrências Públicas: Empresa e Pessoas"
      subtitle={`${companyCount} da empresa • ${personCount} de pessoas • ${adverseMedia.peopleSearched || 0} integrante(s) pesquisado(s) • ${Formatters.dateTime(adverseMedia.consultadoEm)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Painel de Consultas Executadas */}
        {adverseMedia.queriesExecuted && adverseMedia.queriesExecuted.length > 0 && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setShowQueries(!showQueries)}
            >
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
                Consultas Realizadas no Provedor ({adverseMedia.queriesExecuted.length})
              </span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.1rem 0.4rem' }}>
                {showQueries ? 'Ocultar' : 'Exibir'}
              </button>
            </div>

            {showQueries && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                {adverseMedia.queriesExecuted.map((q, idx) => (
                  <div key={idx} style={{ fontSize: 'var(--text-2xs)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', marginBottom: '0.15rem', color: q.subjectType === 'person' ? 'var(--status-medium-text)' : 'var(--brand-primary)', fontWeight: 'var(--font-bold)' }}>
                        {q.subjectType === 'person' ? 'PESSOA' : 'EMPRESA'} · {q.subjectName || 'Entidade pesquisada'}
                      </span>
                      <code className="font-mono" style={{ display: 'block', overflow: 'hidden', color: 'var(--text-secondary)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</code>
                    </div>
                    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{q.count} itens</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Abas de Filtro */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('all')}
          >
            Todos ({results.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'person' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('person')}
          >
            Pessoas ({personCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'company' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('company')}
          >
            Empresa ({companyCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'high' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('high')}
          >
            Maior correlação ({adverseMedia.strongMatches})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'validated' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('validated')}
          >
            Validados
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'discarded' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('discarded')}
          >
            Descartados
          </button>
        </div>

        {/* Lista de Resultados */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            Nenhum resultado para o filtro selecionado.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map((item) => (
              <AdverseMediaCard
                key={item.id}
                item={item}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        )}

        <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          * A busca pública apenas localiza conteúdo para leitura. Correspondência de nome não confirma identidade, fato, investigação, processo, crime ou condenação.
        </div>
      </div>
    </Drawer>
  );
};
