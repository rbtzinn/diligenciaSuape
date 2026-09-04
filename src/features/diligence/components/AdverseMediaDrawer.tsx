// ==========================================================
// DILIGÊNCIA 360 — Drawer de Todas as Ocorrências de Mídia Web
// ==========================================================

import React, { useState } from 'react';
import { AdverseMediaSummary, AdverseMediaStatus } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { AdverseMediaCard } from './AdverseMediaCard';
import { Formatters } from '../../../lib/formatters';
import { formatMediaPlan, formatMediaProviders } from '../utils/mediaSources';

interface AdverseMediaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  adverseMedia?: AdverseMediaSummary;
  onStatusChange?: (id: string, newStatus: AdverseMediaStatus) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshNotice?: string | null;
}

export const AdverseMediaDrawer: React.FC<AdverseMediaDrawerProps> = ({
  isOpen,
  onClose,
  adverseMedia,
  onStatusChange,
  onRefresh,
  isRefreshing = false,
  refreshNotice,
}) => {
  const [filter, setFilter] = useState<'all' | 'person' | 'company' | 'adverse' | 'general' | 'high' | 'validated' | 'discarded'>('all');
  const [showQueries, setShowQueries] = useState(false);

  if (!adverseMedia) return null;

  const results = adverseMedia.results || [];
  const failedQueryCount = (adverseMedia.queriesExecuted || []).filter((item) => item.ok === false).length;
  const companyCount = adverseMedia.companyResultsCount ?? results.filter((item) => item.subjectType !== 'person').length;
  const personCount = adverseMedia.personResultsCount ?? results.filter((item) => item.subjectType === 'person').length;
  const filtered = results.filter((r) => {
    if (filter === 'person') return r.subjectType === 'person';
    if (filter === 'company') return r.subjectType !== 'person';
    if (filter === 'adverse') return r.riskRelevant !== false;
    if (filter === 'general') return r.riskRelevant === false;
    if (filter === 'high') return r.matchStrength === 'high';
    if (filter === 'validated') return r.status === 'validated';
    if (filter === 'discarded') return r.status === 'discarded';
    return true;
  });

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Publicações e Ocorrências: Empresa e Pessoas"
      subtitle={`${companyCount} da empresa • ${personCount} de pessoas • ${adverseMedia.peopleSearched || 0} integrante(s) pesquisado(s) • ${Formatters.dateTime(adverseMedia.consultadoEm)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Descarte por identidade. "5 resultados" e "5 de 60, com 55 descartados
            por não serem desta empresa" descrevem coberturas muito diferentes. */}
        {(adverseMedia.falsePositivesDiscarded || 0) > 0 ? (
          <div className="clean-state-block" role="status">
            <span>
              {adverseMedia.falsePositivesDiscarded} resultado(s) foram descartados por não sustentarem a
              identidade da empresa: citavam apenas uma palavra da razão social, sem CNPJ, nome completo
              ou qualquer outra âncora. Eles não constam da lista abaixo nem do cálculo de exposição.
            </span>
          </div>
        ) : null}

        {onRefresh ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-2xs)' }}>
                {formatMediaPlan(adverseMedia.queryPlanVersion)} · {formatMediaProviders(adverseMedia.providerSources, adverseMedia.provider)}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? 'Atualizando notícias…' : 'Atualizar notícias'}
              </button>
            </div>
            {refreshNotice ? (
              <div className={adverseMedia.consultaParcial ? 'warn-state-block' : 'clean-state-block'} role="status">
                <span>{refreshNotice}</span>
              </div>
            ) : null}
          </div>
        ) : null}

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
                {failedQueryCount > 0 ? (
                  <span style={{ color: 'var(--status-critical-text)', marginLeft: '0.4rem' }}>
                    · {failedQueryCount} sem resposta do provedor
                  </span>
                ) : null}
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
                    {/* Consulta bloqueada e consulta sem achado são opostos.
                        Mostrar "0 itens" nas duas esconde a falha do canal. */}
                    <span
                      style={{
                        color: q.ok === false ? 'var(--status-critical-text)' : 'var(--text-tertiary)',
                        fontWeight: q.ok === false ? 'var(--font-bold)' : undefined,
                        flexShrink: 0,
                      }}
                      title={q.ok === false ? q.erro || 'A consulta não foi respondida pelo provedor.' : undefined}
                    >
                      {q.ok === false
                        ? `falhou${q.status ? ` (HTTP ${q.status})` : ''}`
                        : `${q.count} itens`}
                    </span>
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
            className={'btn btn-sm ' + (filter === 'adverse' ? 'btn-secondary' : 'btn-ghost')}
            onClick={() => setFilter('adverse')}
          >
            Com termos de atenção ({adverseMedia.riskRelevantCount ?? results.filter((item) => item.riskRelevant !== false).length})
          </button>
          <button
            type="button"
            className={'btn btn-sm ' + (filter === 'general' ? 'btn-secondary' : 'btn-ghost')}
            onClick={() => setFilter('general')}
          >
            Menções gerais ({adverseMedia.generalMentionsCount ?? results.filter((item) => item.riskRelevant === false).length})
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
