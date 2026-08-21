// ==========================================================
// DILIGÊNCIA 360 — Componente Decision Banner
// ==========================================================

import React from 'react';
import { RiskAssessment } from '../types';

interface DecisionBannerProps {
  risco?: RiskAssessment;
}

export const DecisionBanner: React.FC<DecisionBannerProps> = ({ risco }) => {
  const bgMap: Record<string, string> = {
    low: 'var(--status-low-bg)',
    medium: 'var(--status-medium-bg)',
    high: 'var(--status-high-bg)',
    critical: 'var(--status-critical-bg)',
  };

  const safeRisco = risco || {
    score: 0,
    nivel: 'Atenção Baixa',
    cor: 'low' as const,
    decisao: 'Conforme',
    decisaoDesc: 'Sem pendências identificadas.',
    emoji: '🟢',
    fatores: [],
  };

  const cor = safeRisco.cor || 'low';

  return (
    <div className="decision-banner animate-fade-in-up">
      <div className="decision-left">
        <div
          className="decision-icon"
          style={{ backgroundColor: bgMap[cor] || 'var(--bg-surface-subtle)' }}
        >
          {safeRisco.emoji || 'ℹ️'}
        </div>
        <div>
          <div className="decision-title">Decisão Recomendada: {safeRisco.decisao}</div>
          <p className="decision-desc">{safeRisco.decisaoDesc}</p>
        </div>
      </div>
    </div>
  );
};
