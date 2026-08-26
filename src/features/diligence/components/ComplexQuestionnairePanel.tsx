import React, { useMemo, useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import { Button } from '../../../components/ui/Button';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../types';
import {
  buildComplexQuestionnaireAnswers,
  type QuestionnaireAnswerStatus,
} from '../utils/questionnaireAutomation';

interface ComplexQuestionnairePanelProps {
  diligence: DiligenceItem;
  adverseMedia?: AdverseMediaSummary;
  discoveries: ProcessDiscovery[];
  onOpenEvidence: () => void;
}

const STATUS_COPY: Record<QuestionnaireAnswerStatus, { label: string; helper: string }> = {
  verified: { label: 'Respondida', helper: 'Fonte pesquisada' },
  review: { label: 'Revisar', helper: 'Há hipótese ou registro' },
  partial: { label: 'Parcial', helper: 'Ainda existem fontes pendentes' },
  declaration: { label: 'Comprovar', helper: 'Exige documento ou declaração' },
};

export const ComplexQuestionnairePanel: React.FC<ComplexQuestionnairePanelProps> = ({
  diligence,
  adverseMedia,
  discoveries,
  onOpenEvidence,
}) => {
  const answers = useMemo(
    () => buildComplexQuestionnaireAnswers(diligence, adverseMedia, discoveries),
    [adverseMedia, diligence, discoveries]
  );
  const firstPriority = answers.find((item) => item.status === 'review')?.id || answers[0]?.id || null;
  const [expandedId, setExpandedId] = useState<string | null>(firstPriority);
  const reviewedCount = answers.filter((item) => item.status === 'review').length;
  const automatedCount = answers.filter((item) => item.status === 'verified' || item.status === 'partial').length;
  const documentaryCount = answers.filter((item) => item.status === 'declaration').length;

  return (
    <section className="questionnaire-brief" aria-labelledby="questionnaire-brief-title">
      <header className="questionnaire-brief-header">
        <div className="questionnaire-brief-mark" aria-hidden="true">
          <Icons.FileText size={22} />
        </div>
        <div className="questionnaire-brief-title">
          <span>Questionário de Diligência SUAPE · 2026.2</span>
          <h3 id="questionnaire-brief-title">As perguntas difíceis, respondidas primeiro</h3>
          <p>O sistema separa resposta comprovada, triagem parcial e informação que ainda depende do fornecedor.</p>
        </div>
        <div className="questionnaire-brief-metrics" aria-label="Resumo do preenchimento automático">
          <span><strong>{automatedCount}</strong> pré-preenchidas</span>
          <span className={reviewedCount > 0 ? 'attention' : ''}><strong>{reviewedCount}</strong> para revisar</span>
          <span><strong>{documentaryCount}</strong> documentais</span>
        </div>
      </header>

      <div className="questionnaire-answer-list">
        {answers.map((item) => {
          const isExpanded = expandedId === item.id;
          const status = STATUS_COPY[item.status];
          const panelId = `questionnaire-answer-${item.id}`;
          return (
            <article className={`questionnaire-answer questionnaire-answer-${item.status} ${isExpanded ? 'expanded' : ''}`} key={item.id}>
              <button
                type="button"
                className="questionnaire-answer-toggle"
                aria-expanded={isExpanded}
                aria-controls={panelId}
                onClick={() => setExpandedId((current) => current === item.id ? null : item.id)}
              >
                <span className="questionnaire-answer-ref">{item.reference}</span>
                <span className="questionnaire-answer-copy">
                  <strong>{item.title}</strong>
                  <small>{isExpanded ? item.answer : status.helper}</small>
                </span>
                <span className={`questionnaire-answer-status status-${item.status}`}>{status.label}</span>
                <Icons.ChevronDown size={17} className="questionnaire-answer-chevron" aria-hidden="true" />
              </button>

              {isExpanded ? (
                <div className="questionnaire-answer-detail" id={panelId}>
                  <div className="questionnaire-answer-conclusion">
                    <span>Resposta automática</span>
                    <p>{item.answer}</p>
                  </div>
                  {item.relatedNames && item.relatedNames.length > 0 ? (
                    <div className="questionnaire-related-names" aria-label="Pessoas relacionadas à resposta">
                      {item.relatedNames.slice(0, 4).map((name) => <span key={name}>{name}</span>)}
                      {item.relatedNames.length > 4 ? <span>+{item.relatedNames.length - 4}</span> : null}
                    </div>
                  ) : null}
                  <div className="questionnaire-answer-boundary">
                    <Icons.Info size={15} aria-hidden="true" />
                    <p>{item.limitation}</p>
                  </div>
                  <div className="questionnaire-evidence-tags">
                    {item.evidenceLabels.map((label) => <span key={label}>{label}</span>)}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <footer className="questionnaire-brief-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'rgba(37, 99, 235, 0.12)',
              color: '#1d4ed8',
              flexShrink: 0,
            }}
          >
            <Icons.Info size={16} />
          </div>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: '#334155' }}>
            <strong style={{ color: '#0f172a', fontWeight: 700 }}>Regra de leitura:</strong> PEP é função pública; ocorrência nominal é pista; crime ou condenação só existe quando a evidência oficial confirma.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={onOpenEvidence}
          rightIcon={<Icons.ArrowRight size={14} aria-hidden="true" />}
        >
          Conferir evidências
        </Button>
      </footer>
    </section>
  );
};
