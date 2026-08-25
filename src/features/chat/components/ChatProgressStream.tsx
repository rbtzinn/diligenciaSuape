// ==========================================================
// DILIGÊNCIA 360 — Stream de Raciocínio & Progresso da IA no Chat
// Estilo Pensamento da IA (Reasoning Accordion com Setinha)
// 100% Vanilla CSS & Design Corporativo Premium
// ==========================================================

import React, { useState } from 'react';
import { DiligenceStepConfig } from '../../diligence/types';
import { Icons } from '../../../components/ui/Icons';

interface ChatProgressStreamProps {
  steps: DiligenceStepConfig[];
}

export const ChatProgressStream: React.FC<ChatProgressStreamProps> = ({ steps }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Estatísticas do progresso
  const totalSteps = steps.length;
  const completedSteps = steps.filter(
    (s) => String(s.status) === 'done' || String(s.status) === 'completed'
  ).length;
  const activeStep = steps.find(
    (s) => String(s.status) === 'loading' || String(s.status) === 'in-progress' || String(s.status) === 'running'
  ) || steps.find((s) => String(s.status) === 'pending');

  const isAllDone = completedSteps === totalSteps && totalSteps > 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="ai-thinking-card animate-fade-in-up">
      {/* Header Compacto com Botão de Setinha */}
      <div
        className="ai-thinking-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        title={isExpanded ? 'Ocultar etapas detalhadas' : 'Ver todas as etapas'}
      >
        <div className="ai-thinking-title-box">
          <div className={`ai-thinking-indicator ${isAllDone ? 'done' : 'pulsing'}`}>
            {isAllDone ? (
              <Icons.CheckCircle size={15} style={{ color: '#059669' }} />
            ) : (
              <Icons.Sparkles size={15} className="ai-sparkle-icon" />
            )}
          </div>

          <div className="ai-thinking-status-text">
            {isAllDone ? (
              <span className="ai-status-main" style={{ fontWeight: 700, color: '#0F172A' }}>
                Auditoria 360 concluída com sucesso
              </span>
            ) : (
              <span className="ai-status-main">
                <span className="ai-status-label" style={{ color: '#64748B' }}>Auditando:</span>{' '}
                <strong style={{ color: '#0F172A' }}>{activeStep?.label || 'Consultando bases oficiais...'}</strong>
              </span>
            )}

            <span className="ai-status-badge">
              {completedSteps}/{totalSteps} etapas
            </span>
          </div>
        </div>

        {/* Botão de Toggle da Setinha */}
        <button
          type="button"
          className="ai-thinking-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          aria-label={isExpanded ? 'Recolher etapas' : 'Expandir etapas'}
        >
          <span>{isExpanded ? 'Ocultar' : 'Ver etapas'}</span>
          <div className={`ai-chevron-icon ${isExpanded ? 'rotated' : ''}`}>
            <Icons.ChevronDown size={13} />
          </div>
        </button>
      </div>

      {/* Mini barra de progresso suave */}
      {!isAllDone && (
        <div className="ai-mini-progress-track">
          <div
            className="ai-mini-progress-fill"
            style={{ width: `${Math.max(progressPercent, 10)}%` }}
          />
        </div>
      )}

      {/* Lista de Etapas Detalhadas (Exibida ao clicar na setinha) */}
      {isExpanded && (
        <div className="ai-thinking-details animate-fade-in">
          <div className="ai-steps-list">
            {steps.map((step, idx) => {
              const statusStr = String(step.status);
              const isDone = statusStr === 'done' || statusStr === 'completed';
              const isLoading = statusStr === 'loading' || statusStr === 'in-progress' || statusStr === 'running';
              const isPending = statusStr === 'pending';

              return (
                <div
                  key={step.id || idx}
                  className={`ai-step-item ${isDone ? 'completed' : ''} ${isLoading ? 'in-progress' : ''}`}
                >
                  <div className="ai-step-left">
                    {isDone && (
                      <div className="ai-step-icon done">
                        <Icons.Check size={11} style={{ color: '#059669', strokeWidth: 3 }} />
                      </div>
                    )}
                    {isLoading && (
                      <div className="ai-step-icon loading">
                        <span className="ai-step-spinner" />
                      </div>
                    )}
                    {isPending && (
                      <div className="ai-step-icon pending">
                        <span className="ai-step-dot" />
                      </div>
                    )}

                    <span className="ai-step-label">{step.label}</span>
                  </div>

                  {step.detail && (
                    <span className="ai-step-detail">
                      {step.detail}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
