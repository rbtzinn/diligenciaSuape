// ==========================================================
// DILIGÊNCIA 360 — Componente Diligência Progress
// ==========================================================

import React from 'react';
import { DiligenceStepConfig } from '../types';
import { Icons } from '../../../components/ui/Icons';

interface DiligenceProgressProps {
  steps: DiligenceStepConfig[];
}

export const DiligenceProgress: React.FC<DiligenceProgressProps> = ({ steps }) => {
  return (
    <div className="progress-panel animate-fade-in-up">
      <div className="progress-header">
        <div className="progress-title">
          <Icons.Loader size={16} />
          <span>Consultando bases de dados oficiais...</span>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          Progresso em tempo real
        </span>
      </div>

      <div className="progress-list">
        {steps.map((step) => {
          const isPending = step.status === 'pending';
          const isLoading = step.status === 'loading';
          const isDone = step.status === 'done';
          const isError = step.status === 'error';

          return (
            <div key={step.id} className={`progress-item ${step.status}`}>
              <div className="progress-item-left">
                <div className="progress-icon-wrapper">
                  {isPending && <Icons.Clock size={12} />}
                  {isLoading && <Icons.Loader size={12} />}
                  {isDone && <Icons.Check size={12} />}
                  {isError && <Icons.Close size={12} />}
                </div>
                <span className="progress-item-label">{step.label}</span>
              </div>
              {step.detail && <span className="progress-item-detail font-mono">{step.detail}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
