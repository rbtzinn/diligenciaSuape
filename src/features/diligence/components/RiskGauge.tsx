// ==========================================================
// DILIGÊNCIA 360 — Componente RiskGauge
// ==========================================================

import React from 'react';
import { StatusVariant } from '../../../types';

interface RiskGaugeProps {
  score: number;
  variant: StatusVariant;
  size?: number;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({ score, variant, size = 54 }) => {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const colorMap: Record<StatusVariant, string> = {
    low: 'var(--status-low)',
    medium: 'var(--status-medium)',
    high: 'var(--status-high)',
    critical: 'var(--status-critical)',
    info: 'var(--status-info)',
    neutral: 'var(--status-neutral)',
    success: 'var(--status-low)',
    primary: 'var(--color-primary-600)',
  };

  const strokeColor = colorMap[variant] || colorMap.neutral;

  return (
    <div
      className="risk-gauge-circle"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 54 54">
        <circle className="risk-gauge-bg" cx="27" cy="27" r={radius} />
        <circle
          className="risk-gauge-fill"
          cx="27"
          cy="27"
          r={radius}
          stroke={strokeColor}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="risk-gauge-value" style={{ color: strokeColor }}>
        {score}
      </div>
    </div>
  );
};
