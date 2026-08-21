// ==========================================================
// DILIGÊNCIA 360 — Painel de Conclusão Preliminar
// ==========================================================

import React from 'react';
import { RiskAssessment } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Icons } from '../../../components/ui/Icons';

interface ConclusionPanelProps {
  risco?: RiskAssessment;
}

export const ConclusionPanel: React.FC<ConclusionPanelProps> = ({ risco }) => {
  const safeRisco: RiskAssessment = risco || {
    score: 0,
    nivel: 'Atenção Baixa',
    cor: 'low',
    decisao: 'Conforme',
    decisaoDesc: 'Sem pendências identificadas.',
    emoji: '🟢',
    detalhes: [],
  };

  const cor = safeRisco.cor || 'low';

  const scoreColor = safeRisco.score > 45 ? 'var(--status-high-text)' : safeRisco.score > 15 ? 'var(--status-medium-text)' : 'var(--status-low-text)';
  const scoreBg = safeRisco.score > 45 ? 'var(--status-high-bg)' : safeRisco.score > 15 ? 'var(--status-medium-bg)' : 'var(--status-low-bg)';
  const scoreBorder = safeRisco.score > 45 ? 'var(--status-high-border)' : safeRisco.score > 15 ? 'var(--status-medium-border)' : 'var(--status-low-border)';

  return (
    <Card
      title="Conclusão da Análise"
      icon={<Icons.ShieldCheck size={16} />}
      action={<Badge variant={cor}>{safeRisco.nivel}</Badge>}
      className="dash-full-width"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
              {safeRisco.decisao}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: '1.5' }}>
              {safeRisco.decisaoDesc}
            </p>
          </div>

          {/* Score visual proeminente */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '1rem 1.5rem',
              backgroundColor: scoreBg,
              border: `1px solid ${scoreBorder}`,
              borderRadius: 'var(--radius-lg)',
              minWidth: '120px',
            }}
          >
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'var(--font-semibold)', letterSpacing: '0.05em' }}>
              Nota de Risco
            </span>
            <span className="font-mono" style={{ fontSize: '2rem', fontWeight: 'var(--font-bold)', color: scoreColor, lineHeight: 1 }}>
              {safeRisco.score}
            </span>
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>de 100</span>

            {/* Mini barra de progresso */}
            <div style={{ width: '80px', height: '6px', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 'var(--radius-full)', overflow: 'hidden', marginTop: '0.25rem' }}>
              <div
                style={{
                  width: `${safeRisco.score}%`,
                  height: '100%',
                  backgroundColor: scoreColor,
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.8s ease',
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
          <Icons.Info size={14} />
          <span>Fatores que compõem esta nota: {safeRisco.detalhes?.length || 0}. Quanto maior a nota, maior a atenção necessária.</span>
        </div>
      </div>
    </Card>
  );
};
