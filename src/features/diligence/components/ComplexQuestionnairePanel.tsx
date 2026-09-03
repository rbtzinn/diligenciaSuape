// ==========================================================
// DILIGÊNCIA 360 — Questionário de diligência
// ==========================================================
// A distinção que o painel existe para mostrar continua intacta:
// resposta comprovada, triagem parcial e informação que ainda
// depende do fornecedor são três coisas diferentes, e a regra de
// leitura no rodapé — PEP é função pública, ocorrência nominal é
// pista, crime só existe com evidência oficial — é o que impede a
// tela de virar acusação.
//
// O desenho saiu de dossier-v3/questionnaire.css. O rodapé ainda
// tinha três cores em hexadecimal escritas em estilo em linha
// (#1d4ed8, #334155, #0f172a), fora da paleta.
// ==========================================================

import React, { useMemo, useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import { Button } from '../../../components/ui/Button';
import { Section } from '../../../components/ui/Section';
import { Chip, ChipTone } from '../../../components/ui/Chip';
import { Note } from '../../../components/ui/Note';
import { Fact, FactGrid } from '../../../components/ui/Facts';
import { cn } from '../../../lib/cn';
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

const STATUS_COPY: Record<QuestionnaireAnswerStatus, { label: string; helper: string; tone: ChipTone }> = {
  verified: { label: 'Respondida', helper: 'Fonte pesquisada', tone: 'ok' },
  review: { label: 'Revisar', helper: 'Há hipótese ou registro', tone: 'warn' },
  partial: { label: 'Parcial', helper: 'Ainda existem fontes pendentes', tone: 'neutral' },
  declaration: { label: 'Comprovar', helper: 'Exige documento ou declaração', tone: 'info' },
};

/** Traço à esquerda da resposta: repete o tom do selo. */
const STATUS_EDGE: Record<QuestionnaireAnswerStatus, string> = {
  verified: 'border-l-ok',
  review: 'border-l-warn',
  partial: 'border-l-line-strong',
  declaration: 'border-l-info',
};

export const ComplexQuestionnairePanel: React.FC<ComplexQuestionnairePanelProps> = ({
  diligence,
  adverseMedia,
  discoveries,
  onOpenEvidence,
}) => {
  const answers = useMemo(
    () => buildComplexQuestionnaireAnswers(diligence, adverseMedia, discoveries),
    [adverseMedia, diligence, discoveries],
  );
  const firstPriority = answers.find((item) => item.status === 'review')?.id || answers[0]?.id || null;
  const [expandedId, setExpandedId] = useState<string | null>(firstPriority);

  const reviewedCount = answers.filter((item) => item.status === 'review').length;
  const automatedCount = answers.filter((item) => item.status === 'verified' || item.status === 'partial').length;
  const documentaryCount = answers.filter((item) => item.status === 'declaration').length;

  return (
    <Section
      mark={<Icons.FileText size={12} />}
      title="As perguntas difíceis, respondidas primeiro"
      subtitle="Questionário de Diligência SUAPE · 2026.2"
      footer={
        <>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-2">
            <strong className="font-bold text-ink">Regra de leitura:</strong> PEP é função pública; ocorrência nominal
            é pista; crime ou condenação só existe quando a evidência oficial confirma.
          </p>

          <Button
            variant="primary"
            size="sm"
            onClick={onOpenEvidence}
            rightIcon={<Icons.ArrowRight size={14} aria-hidden="true" />}
          >
            Conferir evidências
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm leading-relaxed text-ink-2">
          O sistema separa resposta comprovada, triagem parcial e informação que ainda depende do fornecedor.
        </p>

        <FactGrid columns={3} aria-label="Resumo do preenchimento automático">
          <Fact label="Pré-preenchidas" value={automatedCount} tone="ok" />
          <Fact label="Para revisar" value={reviewedCount} tone={reviewedCount > 0 ? 'warn' : 'muted'} />
          <Fact label="Documentais" value={documentaryCount} />
        </FactGrid>

        <ul className="flex min-w-0 flex-col gap-2">
          {answers.map((item) => {
            const expanded = expandedId === item.id;
            const status = STATUS_COPY[item.status];
            const panelId = `questionnaire-answer-${item.id}`;

            return (
              <li
                key={item.id}
                className={cn(
                  'min-w-0 overflow-hidden rounded-lg border border-l-4 border-line bg-surface',
                  STATUS_EDGE[item.status],
                )}
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                  className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="shrink-0 rounded-sm bg-surface-active px-1.5 py-0.5 font-mono text-2xs font-bold text-ink-2">
                    {item.reference}
                  </span>

                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm font-bold leading-snug text-ink">{item.title}</strong>
                    <span className="block truncate text-2xs text-ink-3">
                      {expanded ? item.answer : status.helper}
                    </span>
                  </span>

                  <Chip tone={status.tone} size="sm" className="hidden shrink-0 sm:inline-flex">
                    {status.label}
                  </Chip>

                  <Icons.ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={cn('shrink-0 text-ink-3 transition-transform', expanded && 'rotate-180')}
                  />
                </button>

                {expanded ? (
                  <div id={panelId} className="flex min-w-0 flex-col gap-2.5 border-t border-line-soft p-3">
                    <div className="min-w-0">
                      <span className="block text-2xs font-semibold uppercase tracking-wide text-ink-3">
                        Resposta automática
                      </span>
                      <p className="mt-0.5 text-sm leading-relaxed text-ink">{item.answer}</p>
                    </div>

                    {item.relatedNames && item.relatedNames.length > 0 ? (
                      <div aria-label="Pessoas relacionadas à resposta" className="flex min-w-0 flex-wrap gap-1.5">
                        {item.relatedNames.slice(0, 4).map((name) => (
                          <Chip key={name} tone="muted" size="sm">
                            {name}
                          </Chip>
                        ))}
                        {item.relatedNames.length > 4 ? (
                          <Chip tone="muted" size="sm">
                            +{item.relatedNames.length - 4}
                          </Chip>
                        ) : null}
                      </div>
                    ) : null}

                    {/* O limite da resposta vem junto dela, não num
                        rodapé técnico que ninguém abre. */}
                    <Note tone="neutral" icon={<Icons.Info size={14} aria-hidden="true" />}>
                      {item.limitation}
                    </Note>

                    {item.evidenceLabels.length > 0 ? (
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {item.evidenceLabels.map((label) => (
                          <Chip key={label} tone="brand" size="sm">
                            {label}
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
};
