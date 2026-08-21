// ==========================================================
// DILIGÊNCIA 360 — Stream de Progresso da Diligência no Chat
// ==========================================================

import React from 'react';
import { DiligenceStepConfig } from '../../diligence/types';
import { Icons } from '../../../components/ui/Icons';

interface ChatProgressStreamProps {
  steps: DiligenceStepConfig[];
}

export const ChatProgressStream: React.FC<ChatProgressStreamProps> = ({ steps }) => {
  return (
    <div className="chat-progress-box animate-fade-in-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
          Auditoria de Fontes em Andamento:
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {steps.map((step) => {
          const statusStr = String(step.status);
          const isDone = statusStr === 'done' || statusStr === 'completed';
          const isLoading = statusStr === 'loading' || statusStr === 'in-progress' || statusStr === 'running';
          const isPending = statusStr === 'pending';

          return (
            <div
              key={step.id}
              className={`chat-progress-item ${isDone ? 'completed' : ''} ${isLoading ? 'in-progress' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isDone && (
                  <Icons.CheckCircle size={15} style={{ color: 'var(--color-success-600)', flexShrink: 0 }} />
                )}
                {isLoading && (
                  <span
                    style={{
                      width: '13px',
                      height: '13px',
                      border: '2px solid var(--brand-blue)',
                      borderRightColor: 'transparent',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: 'spin 0.75s linear infinite',
                      flexShrink: 0,
                    }}
                  />
                )}
                {isPending && (
                  <span
                    style={{
                      width: '13px',
                      height: '13px',
                      borderRadius: '50%',
                      border: '1px dashed var(--text-tertiary)',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{step.label}</span>
              </div>

              {step.detail && (
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    color: isDone ? 'var(--text-tertiary)' : 'var(--brand-blue)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {step.detail}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
