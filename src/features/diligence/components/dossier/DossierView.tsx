// ==========================================================
// DILIGÊNCIA 360 — Dossiê
// ==========================================================
// A tela é uma ficha, não um painel: fundo de papel, coluna única de
// leitura, seções numeradas de (A) a (E) e fio fino no lugar da
// moldura de cartão.
//
// A ordem é a da decisão, e é o que o formato passou a sustentar:
// quem é a empresa, quanto de atenção ela exige, o que pesa contra, o
// que cada eixo apurou, e a rede no fim. Antes tudo isso vinha em
// cartões do mesmo peso, empilhados — e uma pilha de caixas iguais não
// diz o que ler primeiro.
// ==========================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DiligenceItem } from '../../types';
import { AxisSection } from './AxisSection';
import { IdentityCard } from './IdentityCard';
import { ScorePanel } from './ScorePanel';
import { deriveDossierAxes } from './dossierAxes';
import { deriveSourceCoverage } from './sourceCoverage';
import { deriveDossierFindings } from './dossierFindings';
import { Page, PageBody, PageHeader } from '../../../../components/layout/Page';
import { TabStrip, TabItem } from '../../../../components/ui/TabStrip';
import { SheetSection } from '../../../../components/ui/Sheet';
import { Button } from '../../../../components/ui/Button';
import { Icons } from '../../../../components/ui/Icons';
import { Formatters } from '../../../../lib/formatters';

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
  const pageRef = useRef<HTMLDivElement>(null);

  const relevantes = findings
    .filter((finding) => ['critico', 'alto', 'moderado'].includes(finding.severity))
    .slice(0, 4);
  const semResposta = coverage.filter((item) => item.status === 'falhou');
  const entidades = diligence.egos?.metrics?.entities || 0;
  const ligacoes = diligence.egos?.metrics?.relationships || 0;
  const consultadoEm = Formatters.date(diligence.companyConsultedAt || diligence.dataAnalise);

  const tabs: TabItem[] = axes.map((axis) => ({
    id: axis.id,
    label: axis.label,
    mark: axis.mark,
    dim: axis.status === 'nao-consultada',
    alert: axis.status === 'falhou',
    alertTitle: 'Fonte não respondeu',
  }));

  const irParaEixo = (id: string) => {
    setActiveAxis(id);
    document.getElementById(`eixo-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // A fita acompanha a leitura: ao atravessar uma seção, a aba ativa
  // muda e é trazida horizontalmente para a área visível.
  useEffect(() => {
    const scroller = pageRef.current;
    if (!scroller || axes.length === 0) return undefined;

    let frame = 0;
    const updateActiveAxis = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const header = scroller.querySelector<HTMLElement>(':scope > header');
        const threshold = scroller.getBoundingClientRect().top + (header?.offsetHeight || 0) + 16;
        let current = axes[0]?.id || '';

        axes.forEach((axis) => {
          const section = document.getElementById(`eixo-${axis.id}`);
          if (section && section.getBoundingClientRect().top <= threshold) current = axis.id;
        });

        setActiveAxis((previous) => previous === current ? previous : current);
      });
    };

    updateActiveAxis();
    scroller.addEventListener('scroll', updateActiveAxis, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', updateActiveAxis);
    };
  }, [axes]);

  return (
    <Page scrollRef={pageRef}>
      <PageHeader
        width="sheet"
        onBack={onBack}
        backLabel="Voltar para a busca"
        eyebrow="Dossiê de integridade"
        title={<span className="num font-mono">{diligence.cnpjFmt}</span>}
        subtitle={diligence.razaoSocial}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onOpenAudit} icon={<Icons.Database size={15} aria-hidden="true" />}>
              Fontes e auditoria
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenNetwork} icon={<Icons.Network size={15} aria-hidden="true" />}>
              Mapa de vínculos
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onExportPdf}
              isLoading={isExportingPdf}
              loadingLabel="Gerando dossiê…"
              icon={<Icons.Download size={15} aria-hidden="true" />}
            >
              Exportar PDF
            </Button>
          </>
        }
        compactActions={
          <>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={onOpenAudit}
              aria-label="Fontes e auditoria"
              title="Fontes e auditoria"
              icon={<Icons.Database size={16} aria-hidden="true" />}
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={onOpenNetwork}
              aria-label="Mapa de vínculos"
              title="Mapa de vínculos"
              icon={<Icons.Network size={16} aria-hidden="true" />}
            />
            <Button
              variant="secondary"
              size="sm"
              iconOnly
              onClick={onExportPdf}
              isLoading={isExportingPdf}
              aria-label="Exportar PDF"
              title="Exportar PDF"
              icon={<Icons.Download size={16} aria-hidden="true" />}
            />
          </>
        }
        tabs={<TabStrip items={tabs} activeId={activeAxis} onSelect={irParaEixo} label="Eixos do dossiê" />}
      />

      {/* Coluna única e estreita: a ficha é para ser lida de cima a
          baixo, e uma linha de texto de mil pixels não é legível. */}
      <PageBody width="sheet" gap="lg">
        <SheetSection mark="A" title="Cabeçalho" meta={`Consultado ${consultadoEm}`}>
          <IdentityCard diligence={diligence} />
        </SheetSection>

        <SheetSection
          mark="B"
          title="Índice de atenção"
          meta={`${findings.length} achados`}
          flush
        >
          <ScorePanel
            diligence={diligence}
            unansweredSources={semResposta.map((item) => item.label)}
            className="mt-3"
          />
        </SheetSection>

        {relevantes.length > 0 || semResposta.length > 0 ? (
          <SheetSection mark="C" title="O que pesa contra" meta={`${relevantes.length + semResposta.length} pontos`} flush>
            <ul className="mt-1">
              {relevantes.map((finding) => (
                <li key={finding.id} className="flex min-w-0 items-start gap-2.5 border-b border-line-soft py-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-1.5 shrink-0 ${
                      finding.severity === 'moderado' ? 'bg-warn' : 'bg-high'
                    }`}
                  />
                  <div className="min-w-0">
                    <strong className="block text-sm font-bold leading-snug text-ink">{finding.title}</strong>
                    <span className="block text-xs leading-relaxed text-ink-2">{finding.description}</span>
                  </div>
                </li>
              ))}

              {/* Uma linha por fonte, com o motivo que o servidor
                  registrou. Sem ele, "não respondeu" e "nada consta"
                  ficavam iguais na tela e significam o oposto. */}
              {semResposta.map((item) => (
                <li key={item.id} className="flex min-w-0 items-start gap-2.5 border-b border-line-soft py-2.5">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 bg-warn" />
                  <div className="min-w-0">
                    <strong className="block text-sm font-bold leading-snug text-ink">
                      {item.label} não respondeu
                    </strong>
                    {item.detail ? (
                      <span className="block text-xs leading-relaxed text-ink-2">{item.detail}</span>
                    ) : null}
                  </div>
                </li>
              ))}

              {semResposta.length > 0 ? (
                <li className="py-2.5">
                  <span className="block font-mono text-2xs leading-relaxed text-ink-3">
                    A cobertura desta consulta está incompleta. Ausência de achado nessas fontes não pode ser lida
                    como ausência de ocorrência.
                  </span>
                </li>
              ) : null}
            </ul>
          </SheetSection>
        ) : null}

        <SheetSection mark="D" title="Eixos apurados" meta={`${axes.length} eixos`} flush>
          <div className="mt-1">
            {axes.map((axis) => (
              <AxisSection key={axis.id} axis={axis} defaultOpen={axis.rows.length > 0} />
            ))}
          </div>
        </SheetSection>

        <SheetSection
          mark="E"
          title="Estrutura societária e vínculos"
          meta={entidades > 0 ? `${entidades} entidades · ${ligacoes} ligações` : 'mapa local'}
          footer={
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenNetwork}
              rightIcon={<Icons.ArrowRight size={15} aria-hidden="true" />}
            >
              Abrir mapa de vínculos
            </Button>
          }
        >
          <p className="text-sm leading-relaxed text-ink-2">
            Relações entre a empresa, o quadro societário, as empresas ligadas, os órgãos contratantes e as
            ocorrências apuradas. O mapa abre por ramos: cada nó pode ser aberto para ver com quem ele se liga.
          </p>
        </SheetSection>
      </PageBody>
    </Page>
  );
};
