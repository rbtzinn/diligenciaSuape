// ==========================================================
// DILIGÊNCIA 360 — Relatório em prosa
//
// A mesma diligência que a aba Dossiê mostra em cartões, dita em
// frases. Serve ao momento em que o resultado sai do sistema: e-mail,
// reunião, processo. Nada aqui é gerado por IA — o texto vem de
// `buildNarrativeReport`, que é função pura sobre o dossiê coletado.
// ==========================================================

import React, { useMemo, useState } from 'react';
import type { DiligenceItem } from '../types';
import { Button } from '../../../components/ui/Button';
import { Note } from '../../../components/ui/Note';
import { Icons } from '../../../components/ui/Icons';
import { buildNarrativeReport } from '../utils/narrativeReport';
import type { SuapeIntegrityEvaluationResult } from '../utils/suapeRiskMapRowGenerator';

interface NarrativeReportViewProps {
  diligence: DiligenceItem;
  evaluation?: SuapeIntegrityEvaluationResult | null;
}

export const NarrativeReportView: React.FC<NarrativeReportViewProps> = ({ diligence, evaluation }) => {
  const report = useMemo(() => buildNarrativeReport(diligence, evaluation), [diligence, evaluation]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.plainText);
      setCopied(true);
      setCopyError(null);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopyError('Não foi possível acessar a área de transferência.');
      setTimeout(() => setCopyError(null), 5000);
    }
  };

  return (
    <section
      className="mx-auto w-full max-w-prose min-w-0 space-y-6 overflow-y-auto px-gutter py-6"
      aria-label="Relatório em prosa"
    >
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Relatório de diligência</p>
        <h1 className="text-2xl font-bold leading-tight text-ink">{report.title}</h1>
        <p className="break-words text-sm text-ink-2">{report.subtitle}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={copied ? 'success' : 'primary'}
            icon={copied ? <Icons.Check size={15} /> : <Icons.Copy size={15} />}
            onClick={handleCopy}
          >
            {copied ? 'Relatório copiado' : 'Copiar relatório'}
          </Button>
        </div>

        {copyError ? <Note tone="high" role="alert">{copyError}</Note> : null}
      </header>

      <article className="space-y-6">
        {report.sections.map((section) => (
          <section key={section.id} className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-2">{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p
                key={`${section.id}-${index}`}
                // `whitespace-pre-line` porque as listas de destaque e de
                // lacunas chegam com quebra de linha dentro do parágrafo.
                className="whitespace-pre-line break-words text-sm leading-relaxed text-ink"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>

      <Note>
        Texto gerado a partir das fontes consultadas nesta diligência, sem uso de inteligência
        artificial: a mesma diligência produz sempre o mesmo relatório. Os títulos de publicações são
        citados como foram coletados; a leitura do conteúdo é do analista, pelos links do dossiê.
      </Note>
    </section>
  );
};
