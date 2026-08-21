// ==========================================================
// DILIGÊNCIA 360 — Componente Detalhes do Indicador de Atenção
// ==========================================================

import React from 'react';
import { RiskAssessment } from '../types';
import { Card } from '../../../components/ui/Card';
import { Icons } from '../../../components/ui/Icons';

interface RiskBreakdownProps {
  risco: RiskAssessment;
}

export const RiskBreakdown: React.FC<RiskBreakdownProps> = ({ risco }) => {
  return (
    <Card
      title="Composição do Indicador Preliminar de Atenção"
      icon={<Icons.Scale size={16} />}
      action={
        <span className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
          Auditável
        </span>
      }
    >
      {risco.detalhes.length === 0 ? (
        <p style={{ color: 'var(--status-low-text)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Icons.Check size={14} /> Nenhum critério de atenção ou penalidade foi identificado nesta consulta.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Critério de Avaliação</th>
                  <th>Impacto</th>
                  <th>Detalhe / Justificativa</th>
                </tr>
              </thead>
              <tbody>
                {risco.detalhes.map((dt, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>
                      {dt.criterio}
                    </td>
                    <td
                      style={{
                        color: dt.pontos > 0 ? 'var(--status-high-text)' : 'var(--text-tertiary)',
                        fontWeight: 'var(--font-bold)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dt.pontos > 0 ? `+${dt.pontos} pts` : '0 pts (Informativo)'}
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)' }}>{dt.info}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            * Breakdown metodológico transparente: homônimos PEP e sanções expiradas não adicionam pontos de penalidade.
          </p>
        </div>
      )}
    </Card>
  );
};
