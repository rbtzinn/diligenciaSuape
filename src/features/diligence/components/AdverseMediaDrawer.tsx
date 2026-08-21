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
  const [filter, setFilter] = useState<'all' | 'high' | 'validated' | 'discarded'>('all');
  const [showQueries, setShowQueries] = useState(false);

  if (!adverseMedia) return null;

  const results = adverseMedia.results || [];
  const filtered = results.filter((r) => {
    if (filter === 'high') return r.matchStrength === 'high';
    if (filter === 'validated') return r.status === 'validated';
    if (filter === 'discarded') return r.status === 'discarded';
    return true;
  });

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Mídia e Ocorrências Públicas na Web"
      subtitle={`${results.length} resultado(s) analisado(s) • Consultado em ${Formatters.dateTime(adverseMedia.consultadoEm)}`}
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
                  <div key={idx} style={{ fontSize: 'var(--text-2xs)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <code className="font-mono" style={{ color: 'var(--text-secondary)' }}>{q.query}</code>
                    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{q.count} itens</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Abas de Filtro */}
        <div style={{ display: 'flex', gap: '0.35rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('all')}
          >
            Todos ({results.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filter === 'high' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setFilter('high')}
          >
            Forte ({adverseMedia.strongMatches})
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
          * Os resultados da busca pública têm caráter investigativo preliminar. A correspondência e gravidade dos fatos requerem validação humana.
        </div>
      </div>
    </Drawer>
  );
};
