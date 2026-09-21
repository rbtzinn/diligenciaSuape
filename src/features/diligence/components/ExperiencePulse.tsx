import React from 'react';
import type { DiligenceStepConfig } from '../types';
import { Icons } from '../../../components/ui/Icons';

interface ExperiencePulseProps {
  query: string;
  steps: DiligenceStepConfig[];
}

export const ExperiencePulse: React.FC<ExperiencePulseProps> = ({ query, steps }) => {
  const done = steps.filter((step) => step.status === 'done').length;
  const unavailable = steps.filter((step) => step.status === 'error').length;
  const active = steps.find((step) => step.status === 'loading') || steps.find((step) => step.status === 'pending');
  const progress = steps.length > 0 ? Math.round(((done + unavailable) / steps.length) * 100) : 0;

  return (
    <main className="harbor-progress">
      <div className="harbor-progress-inner">
        <div className="harbor-pulse" aria-hidden="true"><Icons.Network size={54} /></div>
        <span className="harbor-kicker"><span className="harbor-kicker-dot" /> Pesquisa em andamento</span>
        <h1>Conectando os sinais.</h1>
        <p className="font-mono">{query || 'Empresa informada'}</p>
        <div className="harbor-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`${progress}% da diligência concluída`}>
          <span style={{ width: `${Math.max(5, progress)}%` }} />
        </div>
        <div className="harbor-progress-status" aria-live="polite"><strong>{active?.label || 'Organizando os resultados encontrados…'}</strong><span>{progress}%</span></div>
        <details>
          <summary><span>Ver andamento das fontes</span><span>{done} de {steps.length} concluídas{unavailable > 0 ? ` · ${unavailable} indisponíveis` : ''}</span></summary>
          <ul>{steps.map((step) => <li key={step.id} data-status={step.status}><span aria-hidden="true">{step.status === 'done' ? '✓' : step.status === 'error' ? '!' : '○'}</span><span>{step.label}{step.detail ? ` · ${step.detail}` : ''}</span></li>)}</ul>
        </details>
      </div>
    </main>
  );
};
