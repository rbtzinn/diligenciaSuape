// ==========================================================
// DILIGÊNCIA 360 — Drawer de Detalhes do Processo Judicial (DataJud)
// ==========================================================

import React, { useState } from 'react';
import { JudicialProcessItem } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

interface JudicialProcessDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  processo: JudicialProcessItem | null;
}

export const JudicialProcessDrawer: React.FC<JudicialProcessDrawerProps> = ({
  isOpen,
  onClose,
  processo,
}) => {
  const [showAllMovements, setShowAllMovements] = useState(false);

  if (!processo) return null;

  const movimentos = processo.movimentos || [];
  const displayMovements = showAllMovements ? movimentos : movimentos.slice(0, 10);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={processo.numero}
      subtitle={`${processo.tribunal} • ${processo.tribunalNome}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Metadados Principais da Capa */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.875rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div>
            <span className="company-cell-label">Classe Processual (TPU)</span>
            <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)', marginTop: '0.2rem' }}>
              {processo.classe.nome}
              <span className="font-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                (Cód. {processo.classe.codigo})
              </span>
            </div>
          </div>

          <div>
            <span className="company-cell-label">Classificação Preliminar</span>
            <div style={{ marginTop: '0.2rem' }}>
              <Badge variant={processo.categoria.badgeVariant}>{processo.categoria.label}</Badge>
            </div>
          </div>

          <div>
            <span className="company-cell-label">Órgão Julgador</span>
            <div style={{ color: 'var(--text-primary)', marginTop: '0.2rem', fontSize: 'var(--text-sm)' }}>
              {processo.orgaoJulgador.nome}
            </div>
          </div>

          <div>
            <span className="company-cell-label">Data de Distribuição</span>
            <div className="font-mono" style={{ color: 'var(--text-primary)', marginTop: '0.2rem', fontSize: 'var(--text-sm)' }}>
              {Formatters.date(processo.dataAjuizamento)}
            </div>
          </div>

          <div>
            <span className="company-cell-label">Grau / Instância</span>
            <div style={{ color: 'var(--text-primary)', marginTop: '0.2rem', fontSize: 'var(--text-sm)' }}>
              {processo.grau === 'G1' ? '1º Grau (Vara/Comarca)' : processo.grau === 'G2' ? '2º Grau (Tribunal)' : processo.grau}
            </div>
          </div>

          <div>
            <span className="company-cell-label">Sistema / Sigilo</span>
            <div style={{ color: 'var(--text-primary)', marginTop: '0.2rem', fontSize: 'var(--text-sm)' }}>
              {processo.sistema} • {processo.nivelSigilo === 0 ? 'Público' : `Sigilo Nível ${processo.nivelSigilo}`}
            </div>
          </div>
        </div>

        {/* Assuntos TPU */}
        <div>
          <span className="company-cell-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
            Assuntos Processuais Registrados (TPU)
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {processo.assuntos.length === 0 ? (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Nenhum assunto específico listado</span>
            ) : (
              processo.assuntos.map((a, idx) => (
                <span
                  key={idx}
                  style={{
                    padding: '0.25rem 0.6rem',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {a.nome} <span className="font-mono" style={{ color: 'var(--text-muted)' }}>({a.codigo})</span>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Nota Institucional de Dados de Partes */}
        <div
          style={{
            padding: '0.625rem 0.875rem',
            backgroundColor: 'var(--brand-blue-subtle)',
            border: '1px solid var(--brand-blue-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--brand-blue-text)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <Icons.Info size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>Nota LGPD / CNJ:</strong> A API Pública do DataJud resguarda nomes de partes, polos e documentos processuais. Os metadados acima são oficiais e representam o andamento do processo perante o tribunal.
          </span>
        </div>

        {/* Timeline de Movimentações */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
              Movimentações Processuais ({processo.totalMovimentos})
            </span>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              Última atualização: {Formatters.date(processo.ultimaAtualizacao)}
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
                    <span className="font-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                      (Cód. {m.codigo})
                    </span>
                  </div>
                  {m.complementos && m.complementos.length > 0 && (
                    <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>
                      {m.complementos.join(' • ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {movimentos.length > 10 && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAllMovements(!showAllMovements)}
              >
                {showAllMovements ? 'Recolher movimentações' : `Ver todas as ${movimentos.length} movimentações`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};
