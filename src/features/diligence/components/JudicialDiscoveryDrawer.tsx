// ==========================================================
// DILIGÊNCIA 360 — Drawer de Dossiê de Processo Descoberto
// Proveniência de fontes, validação e metadados DataJud
// ==========================================================

import React, { useState } from 'react';
import { ProcessDiscovery, DiscoveryStatus } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

interface JudicialDiscoveryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  discovery: ProcessDiscovery | null;
  onStatusChange: (processNumber: string, status: DiscoveryStatus) => void;
  onEnrich: (discovery: ProcessDiscovery) => void;
  isEnriching?: boolean;
}

export const JudicialDiscoveryDrawer: React.FC<JudicialDiscoveryDrawerProps> = ({
  isOpen,
  onClose,
  discovery,
  onStatusChange,
  onEnrich,
  isEnriching = false,
}) => {
  const [showAllMovements, setShowAllMovements] = useState(false);

  if (!discovery) return null;

  const { dataJud, sources, status } = discovery;
  const movimentos = dataJud?.movimentos || [];
  const displayMovements = showAllMovements ? movimentos : movimentos.slice(0, 10);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={discovery.formattedProcessNumber}
      subtitle={`Tribunal ${discovery.tribunal} • Descoberto em ${Formatters.date(discovery.firstDiscoveredAt)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Barra de Ações de Validação de Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.875rem 1rem',
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Status:</span>
            <Badge variant={status === 'enriched' ? 'success' : status === 'validated' ? 'high' : status === 'candidate' ? 'medium' : 'neutral'}>
              {status.toUpperCase()}
            </Badge>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {status !== 'validated' && status !== 'enriched' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Icons.Check size={14} />}
                onClick={() => onStatusChange(discovery.processNumber, 'validated')}
              >
                Validar Processo
              </Button>
            )}

            {status !== 'discarded' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStatusChange(discovery.processNumber, 'discarded')}
              >
                Descartar
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              icon={isEnriching ? <Icons.Loader size={14} /> : <Icons.Database size={14} />}
              onClick={() => onEnrich(discovery)}
              disabled={isEnriching}
            >
              {dataJud ? 'Reconsultar DataJud' : 'Consultar DataJud'}
            </Button>
          </div>
        </div>

        {/* 1. Proveniência e Fontes de Descoberta */}
        <div>
          <span className="company-cell-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
            Fontes de Descoberta ({sources.length})
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {sources.map((s, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.75rem 0.875rem',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Icons.FileText size={14} style={{ color: 'var(--brand-blue)' }} />
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>{s.name}</strong>
                  </div>
                  <span className="font-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    {Formatters.dateTime(s.consultedAt)}
                  </span>
                </div>
                {s.excerpt && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'var(--bg-surface-subtle)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-xs)' }}>
                    "{s.excerpt}"
                  </p>
                )}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 'var(--text-2xs)', color: 'var(--brand-blue)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <span>Acessar documento/link original</span>
                    <Icons.ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 2. Metadados do DataJud (se enriquecido) */}
        {dataJud ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <span className="company-cell-label">Metadados Oficiais (DataJud / CNJ)</span>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                padding: '0.875rem',
                backgroundColor: 'var(--bg-surface-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div>
                <span className="company-cell-label">Classe TPU</span>
                <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                  {dataJud.classe.nome}
                </div>
              </div>

              <div>
                <span className="company-cell-label">Órgão Julgador</span>
                <div style={{ color: 'var(--text-primary)', marginTop: '0.15rem', fontSize: 'var(--text-sm)' }}>
                  {dataJud.orgaoJulgador.nome}
                </div>
              </div>

              <div>
                <span className="company-cell-label">Data de Ajuizamento</span>
                <div className="font-mono" style={{ color: 'var(--text-primary)', marginTop: '0.15rem', fontSize: 'var(--text-sm)' }}>
                  {Formatters.date(dataJud.dataAjuizamento)}
                </div>
              </div>

              <div>
                <span className="company-cell-label">Grau / Instância</span>
                <div style={{ color: 'var(--text-primary)', marginTop: '0.15rem', fontSize: 'var(--text-sm)' }}>
                  {dataJud.grau} • {dataJud.sistema}
                </div>
              </div>
            </div>

            {/* Timeline de Movimentações */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
                  Movimentações Oficiais ({dataJud.totalMovimentos})
                </span>
              </div>

              <div className="timeline-list">
                {displayMovements.map((m, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-dot info" />
                    <div className="timeline-content">
                      <div className="timeline-time font-mono">{Formatters.date(m.dataHora)}</div>
                      <div className="timeline-text" style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>
                        {m.nome}
                      </div>
                      {m.complementos && m.complementos.length > 0 && (
                        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                          {m.complementos.join(' • ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {movimentos.length > 10 && (
                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                  <Button variant="secondary" size="sm" onClick={() => setShowAllMovements(!showAllMovements)}>
                    {showAllMovements ? 'Recolher' : `Ver todas as ${movimentos.length} movimentações`}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '1rem', textAlign: 'center', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-default)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            Este processo ainda não foi consultado perante a API do DataJud. Clique em "Consultar DataJud" acima para recuperar a capa e movimentações oficiais.
          </div>
        )}
      </div>
    </Drawer>
  );
};
