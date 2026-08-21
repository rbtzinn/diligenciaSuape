// ==========================================================
// DILIGÊNCIA 360 — Componente Resumo Executivo & Análise
// ==========================================================

import React from 'react';
import { AutomatedAnalysis } from '../types';
import { Card } from '../../../components/ui/Card';
import { Icons } from '../../../components/ui/Icons';

interface ExecutiveSummaryProps {
  analise?: AutomatedAnalysis;
}

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({ analise }) => {
  if (!analise) return null;

  return (
    <Card
      title="Análise e Resumo Executivo"
      icon={<Icons.FileText size={16} />}
      action={
        <span className="badge badge-info" style={{ fontSize: 'var(--text-2xs)' }}>
          Motor de Regras
        </span>
      }
      className="dash-full-width"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {analise.alertas.length > 0 && (
          <div>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Apontamentos de Atenção ({analise.totalAlertas})
            </span>
            <div className="dash-alert-list" style={{ marginTop: '0.5rem' }}>
              {analise.alertas.map((alerta, idx) => (
                <div key={idx} className={`dash-alert-card ${alerta.tipo}`}>
                  <div style={{ flex: 1 }}>
                    <div className="dash-alert-title">{alerta.titulo}</div>
                    <div className="dash-alert-text">{alerta.texto}</div>
                    {alerta.acao && (
                      <div className="dash-alert-action">
                        <strong>Recomendação:</strong> {alerta.acao}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {analise.observacoes.length > 0 && (
          <div>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Observações Gerais
            </span>
            <ul style={{ marginTop: '0.35rem', paddingLeft: '1.25rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {analise.observacoes.map((obs, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>
                  {obs}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
};
