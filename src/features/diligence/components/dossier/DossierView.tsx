// ==========================================================
// DILIGÊNCIA 360 — Dossiê
// ==========================================================
// Ordem de leitura: identificação e decisão, depois os eixos.
// A fita superior leva ao eixo; a rede fica no fim, com acesso ao
// mapa em tela cheia.
// ==========================================================

import React, { useMemo, useState } from 'react';
import type { DiligenceItem } from '../../types';
import { AxisTabs } from './AxisTabs';
import { AxisSection } from './AxisSection';
import { IdentityCard } from './IdentityCard';
import { deriveDossierAxes } from './dossierAxes';
import { deriveSourceCoverage } from './sourceCoverage';
import { deriveDossierFindings } from './dossierFindings';

interface DossierViewProps {
  diligence: DiligenceItem;
  isExportingPdf: boolean;
  onBack: () => void;
  onExportPdf: () => void;
  onOpenNetwork: () => void;
  onOpenAudit: () => void;
}

export const DossierView: React.FC<DossierViewProps> = ({
  diligence,
  isExportingPdf,
  onBack,
  onExportPdf,
  onOpenNetwork,
  onOpenAudit,
}) => {
  const axes = useMemo(() => deriveDossierAxes(diligence), [diligence]);
  const coverage = useMemo(() => deriveSourceCoverage(diligence), [diligence]);
  const findings = useMemo(() => deriveDossierFindings(diligence), [diligence]);
  const [activeAxis, setActiveAxis] = useState(axes[0]?.id || '');

  const relevantes = findings
    .filter((finding) => ['critico', 'alto', 'moderado'].includes(finding.severity))
    .slice(0, 3);
  const semResposta = coverage.filter((item) => item.status === 'falhou');
  const entidades = diligence.egos?.metrics?.entities || 0;

  const irParaEixo = (id: string) => {
    setActiveAxis(id);
    document.getElementById(`eixo-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-[1200px] px-4">
          <div className="flex flex-wrap items-center gap-3 py-3.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar"
              className="cursor-pointer border-none bg-transparent px-0.5 text-[18px] text-ink-3 hover:text-brand"
            >
              ←
            </button>
            <span className="text-[17px] font-bold text-ink">
              Dossiê <span className="font-mono">{diligence.cnpjFmt}</span>
            </span>

            <div className="ml-auto flex flex-wrap gap-4">
              <button
                type="button"
                onClick={onOpenAudit}
                className="cursor-pointer border-none bg-transparent text-[13px] font-semibold text-ink-2 hover:text-brand"
              >
                Fontes e auditoria
              </button>
              <button
                type="button"
                onClick={onOpenNetwork}
                className="cursor-pointer border-none bg-transparent text-[13px] font-semibold text-ink-2 hover:text-brand"
              >
                Mapa de vínculos
              </button>
              <button
                type="button"
                onClick={onExportPdf}
                disabled={isExportingPdf}
                className="cursor-pointer border-none bg-transparent text-[13px] font-semibold text-ink-2 hover:text-brand disabled:opacity-50"
              >
                {isExportingPdf ? 'Gerando dossiê…' : 'Exportar PDF'}
              </button>
            </div>
          </div>

          <AxisTabs axes={axes} activeId={activeAxis} onSelect={irParaEixo} />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1200px] px-4 pb-12">
        <IdentityCard diligence={diligence} coverage={coverage} />

        {relevantes.length > 0 || semResposta.length > 0 ? (
          <section className="mt-3 rounded-card border border-line bg-surface p-4">
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-3">O que pesa contra</span>
            <div className="mt-2 flex flex-col">
              {relevantes.map((finding) => (
                <div key={finding.id} className="grid grid-cols-[8px_1fr] items-start gap-2.5 border-b border-line-soft py-2.5 last:border-b-0">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-2 rounded-full ${finding.severity === 'moderado' ? 'bg-warn' : 'bg-high'}`}
                  />
                  <div>
                    <strong className="block text-[13px] leading-snug text-ink">{finding.title}</strong>
                    <span className="text-[12px] leading-relaxed text-ink-3">{finding.description}</span>
                  </div>
                </div>
              ))}

              {/* Cobertura incompleta entra na decisão, não no rodapé técnico. */}
              {semResposta.length > 0 ? (
                <div className="grid grid-cols-[8px_1fr] items-start gap-2.5 py-2.5">
                  <span aria-hidden="true" className="mt-1.5 size-2 rounded-full bg-warn" />
                  <div>
                    <strong className="block text-[13px] leading-snug text-ink">
                      {semResposta.length === 1
                        ? `${semResposta[0].label} não respondeu`
                        : `${semResposta.length} fontes não responderam`}
                    </strong>
                    <span className="text-[12px] leading-relaxed text-ink-3">
                      A cobertura desta consulta está incompleta. Ausência de achado nessas fontes não pode ser lida
                      como ausência de ocorrência.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {axes.map((axis) => (
          <AxisSection key={axis.id} axis={axis} defaultOpen={axis.rows.length > 0} />
        ))}

        <section className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line-soft bg-surface-subtle px-4 py-3">
            <span aria-hidden="true" className="grid size-5 place-items-center rounded bg-brand-soft text-[11px] font-bold text-brand">
              R
            </span>
            <h3 className="m-0 text-[14px] font-bold text-ink">Estrutura societária e vínculos</h3>
            <span className="ml-auto rounded-chip bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">
              {entidades > 0 ? `${entidades} entidades` : 'Mapa local'}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <span className="text-[13px] text-ink-2">
              Mapa de relações entre a empresa, o quadro societário, órgãos contratantes e ocorrências.
            </span>
            <button
              type="button"
              onClick={onOpenNetwork}
              className="cursor-pointer rounded-chip border border-line bg-surface-subtle px-3.5 py-2 text-[13px] text-brand hover:bg-surface-hover"
            >
              Abrir mapa em tela cheia →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
