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
  pepResults = [],
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
  const natureLabels = {
    confirmed: 'Registro confirmado',
    indicator: 'Indicador de exposição',
    uncertainty: 'Hipótese / incerteza',
    coverage: 'Lacuna de cobertura',
    manual_override: 'Decisão humana',
  } as const;
  const automaticScore = risco.manualOverride?.automaticScore ?? risco.automaticScore ?? risco.score ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
      {/* 1. O que influenciou a nota */}
      <Card
        title="O que influenciou a nota de risco"
        icon={<Icons.BarChart size={16} />}
        action={
          <span className="badge badge-neutral" style={{ fontSize: '11px', fontWeight: 700 }}>
            Final: {risco?.score || 0}/100
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="risk-visualizer-intro">
            <div>
              <span>Cálculo automático</span>
              <strong>{automaticScore}<small>/100</small></strong>
            </div>
            <Icons.ArrowRight size={16} aria-hidden="true" />
            <div className="risk-visualizer-final">
              <span>Classificação final</span>
              <strong>{risco.score}<small>/100</small></strong>
            </div>
            <p>Os fatores medem exposição e necessidade de análise. Hipóteses não equivalem a irregularidade confirmada.</p>
          </div>

          {!risco?.detalhes || risco.detalhes.length === 0 ? (
            <div className="clean-state-block">
              <Icons.Info size={16} />
              <span>Nenhum sinal foi pontuado nesta execução. Ainda existe risco residual conforme a cobertura e a atualidade das fontes.</span>
            </div>
          ) : (
            risco.detalhes.map((dt, idx) => (
              <div
                key={idx}
                className={`risk-factor-row risk-factor-${dt.natureza || 'indicator'}`}
              >
                <div className="risk-factor-heading">
                  <div>
                    <span className="risk-factor-nature">{natureLabels[dt.natureza || 'indicator']}</span>
                    <strong>{dt.criterio}</strong>
                  </div>
                  <span
                    className="font-mono"
                  >
                    {dt.pontos > 0 ? `+${dt.pontos}` : dt.pontos < 0 ? `${dt.pontos}` : '0'} pontos
                  </span>
                </div>

                {dt.pontos !== 0 && (
                  <div className="risk-factor-track">
                    <div
                      style={{
                        width: `${Math.min((Math.abs(dt.pontos) / 30) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}

                <p>{dt.info}</p>
                {dt.requerRevisao ? <span className="risk-factor-review"><Icons.AlertCircle size={13} />Requer validação humana</span> : null}
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
          <span className="badge badge-neutral" style={{ fontSize: '11px', fontWeight: 700 }}>
            {consultedCount}/7 consultadas
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div className="section-subtitle" style={{ fontSize: '12px', color: '#64748B' }}>
            Todas as bases de dados que foram verificadas nesta análise
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.45rem' }}>
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
                    gap: '0.5rem',
                    padding: '0.5rem 0.65rem',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                  <span className={`badge ${badgeClass}`} style={{ fontSize: '10.5px', fontWeight: 700, flexShrink: 0, padding: '2px 6px' }}>
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
