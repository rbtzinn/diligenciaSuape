// ==========================================================
// DILIGÊNCIA 360 — Visualizações Analíticas Executivas
// Composição do indicador, cobertura da análise e ocorrências
// ==========================================================

import React from 'react';
import { RiskAssessment, SanctionsResult, PepPartnerResult, AdverseMediaSummary, ProcessDiscovery } from '../types';
import { Card } from '../../../components/ui/Card';
import { Icons } from '../../../components/ui/Icons';

interface RiskVisualizerProps {
  risco: RiskAssessment;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  pepResults: PepPartnerResult[];
  adverseMedia?: AdverseMediaSummary;
  discoveries?: ProcessDiscovery[];
}

export const RiskVisualizer: React.FC<RiskVisualizerProps> = ({
  risco,
  ceis,
  cnep,
  pepResults,
  adverseMedia,
  discoveries = [],
}) => {
  const pepCount = pepResults.filter((p) => p.encontrado).length;
  const ceisVigentes = ceis?.vigentes ?? (ceis?.encontrado ? ceis.quantidade : 0);
  const cnepVigentes = cnep?.vigentes ?? (cnep?.encontrado ? cnep.quantidade : 0);
  const procsCount = discoveries.length;
  const pepUnavailable = pepResults.length > 0 && pepResults.some((p) => p.semChave || !p.ok);
  const ceisUnavailable = !ceis || ceis.semChave || !ceis.ok;
  const cnepUnavailable = !cnep || cnep.semChave || !cnep.ok;
  const mediaUnavailable = !adverseMedia || adverseMedia.semChave || !adverseMedia.ok;

  const coverageItems = [
    { label: 'Dados da Empresa', status: 'Concluído', variant: 'success' },
    { label: 'Sócios e Administradores', status: 'Concluído', variant: 'success' },
    { label: 'Cargos Políticos (PEP)', status: pepUnavailable ? 'Indisponível' : pepResults.length === 0 ? 'Não aplicável' : pepCount > 0 ? `${pepCount} a verificar` : 'Concluído', variant: pepUnavailable || pepResults.length === 0 ? 'neutral' : pepCount > 0 ? 'warning' : 'success' },
    { label: 'Empresas Impedidas (CEIS)', status: ceisUnavailable ? 'Indisponível' : ceisVigentes > 0 ? `${ceisVigentes} ativo(s)` : 'Concluído', variant: ceisUnavailable ? 'neutral' : ceisVigentes > 0 ? 'critical' : 'success' },
    { label: 'Punições por Corrupção (CNEP)', status: cnepUnavailable ? 'Indisponível' : cnepVigentes > 0 ? `${cnepVigentes} ativo(s)` : 'Concluído', variant: cnepUnavailable ? 'neutral' : cnepVigentes > 0 ? 'critical' : 'success' },
    { label: 'Notícias na Internet', status: mediaUnavailable ? 'Indisponível' : 'Concluído', variant: mediaUnavailable ? 'neutral' : 'success' },
    { label: 'Processos na Justiça', status: procsCount > 0 ? `${procsCount} candidato(s)` : 'Não consultado', variant: procsCount > 0 ? 'warning' : 'neutral' },
  ];
  const consultedCount = coverageItems.filter((item) => item.status === 'Concluído' || item.variant === 'warning' || item.variant === 'critical').length;

  return (
    <div className="risk-visualizer-grid dash-full-width">
      {/* 1. O que influenciou a nota */}
      <Card
        title="O que influenciou a nota de risco"
        icon={<Icons.BarChart size={16} />}
        action={
          <span className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
            Nota: {risco.score}/100
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="section-subtitle">
            Cada fator abaixo contribuiu para a nota final de risco
          </div>
          {risco.detalhes.length === 0 ? (
            <div className="clean-state-block">
              <Icons.Check size={16} />
              <span>Nenhum fator de risco identificado. Nota zero de atenção.</span>
            </div>
          ) : (
            risco.detalhes.map((dt, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--font-medium)' }}>{dt.criterio}</span>
                  <span className="font-mono" style={{ color: dt.pontos > 0 ? 'var(--status-high-text)' : 'var(--text-tertiary)', fontWeight: 'var(--font-bold)' }}>
                    {dt.pontos > 0 ? `+${dt.pontos} pontos` : '0 pontos'}
                  </span>
                </div>
                {dt.pontos > 0 && (
                  <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min((dt.pontos / 50) * 100, 100)}%`,
                        height: '100%',
                        backgroundColor: dt.pontos >= 30 ? 'var(--status-high)' : dt.pontos >= 15 ? 'var(--status-medium)' : 'var(--brand-blue)',
                        borderRadius: 'var(--radius-full)',
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                )}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{dt.info}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* 2. Fontes consultadas e status */}
      <Card
        title="Fontes consultadas e status"
        icon={<Icons.ShieldCheck size={16} />}
        action={
          <span className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
            {consultedCount}/7 consultadas
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className="section-subtitle">
            Todas as bases de dados que foram verificadas nesta análise
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {coverageItems.map((item, idx) => {
              const badgeClass =
                item.variant === 'critical'
                  ? 'badge-high'
                  : item.variant === 'warning'
                  ? 'badge-warning'
                  : item.variant === 'success'
                  ? 'badge-success'
                  : 'badge-neutral';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span className={`badge ${badgeClass}`} style={{ fontSize: 'var(--text-2xs)' }}>
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
};
