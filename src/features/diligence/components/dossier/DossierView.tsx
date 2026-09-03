// ==========================================================
// DILIGÊNCIA 360 — Dossiê
// ==========================================================
// Ordem de leitura: identificação e decisão, depois o que pesa
// contra, depois os eixos, e a rede no fim com acesso ao mapa.
//
// O cabeçalho era o pior ponto do app no celular. As três ações
// ("Fontes e auditoria", "Mapa de vínculos", "Exportar PDF") eram
// botões de texto que quebravam em duas linhas, e a fita de eixos
// quebrava em outras duas ou três. O resultado eram quatro fileiras
// de links sem forma de botão, com o título perdido no meio.
//
// Agora as ações são botões de verdade que rolam numa fita, e a fita
// de eixos nunca quebra. O cabeçalho tem uma altura só, em qualquer
// largura de tela.
// ==========================================================

import React, { useMemo, useState } from 'react';
import type { DiligenceItem } from '../../types';
import { AxisSection } from './AxisSection';
import { IdentityCard } from './IdentityCard';
import { deriveDossierAxes } from './dossierAxes';
import { deriveSourceCoverage } from './sourceCoverage';
import { deriveDossierFindings } from './dossierFindings';
import { Page, PageBody, PageHeader } from '../../../../components/layout/Page';
import { TabStrip, TabItem } from '../../../../components/ui/TabStrip';
import { Section } from '../../../../components/ui/Section';
import { Button } from '../../../../components/ui/Button';
import { Chip } from '../../../../components/ui/Chip';
import { Icons } from '../../../../components/ui/Icons';

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

  return (
    <Page>
      <PageHeader
        onBack={onBack}
        backLabel="Voltar para a busca"
        eyebrow="Dossiê de integridade"
        title={<span className="font-mono">{diligence.cnpjFmt}</span>}
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

      <PageBody>
        <IdentityCard diligence={diligence} coverage={coverage} />

        {relevantes.length > 0 || semResposta.length > 0 ? (
          <Section title="O que pesa contra" mark="!" flush>
            <ul className="divide-y divide-line-soft">
              {relevantes.map((finding) => (
                <li key={finding.id} className="flex min-w-0 items-start gap-2.5 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      finding.severity === 'moderado' ? 'bg-warn' : 'bg-high'
                    }`}
                  />
                  <div className="min-w-0">
                    <strong className="block text-sm font-bold leading-snug text-ink">{finding.title}</strong>
                    <span className="block text-xs leading-relaxed text-ink-2">{finding.description}</span>
                  </div>
                </li>
              ))}

              {/* Cobertura incompleta entra na decisão, não no rodapé
                  técnico: zero achado numa fonte muda quando a fonte
                  não respondeu. */}
              {semResposta.length > 0 ? (
                <li className="flex min-w-0 items-start gap-2.5 px-4 py-3">
                  <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-warn" />
                  <div className="min-w-0">
                    <strong className="block text-sm font-bold leading-snug text-ink">
                      {semResposta.length === 1
                        ? `${semResposta[0].label} não respondeu`
                        : `${semResposta.length} fontes não responderam`}
                    </strong>
                    <span className="block text-xs leading-relaxed text-ink-2">
                      A cobertura desta consulta está incompleta. Ausência de achado nessas fontes não pode ser lida
                      como ausência de ocorrência.
                    </span>
                  </div>
                </li>
              ) : null}
            </ul>
          </Section>
        ) : null}

        {axes.map((axis) => (
          <AxisSection key={axis.id} axis={axis} defaultOpen={axis.rows.length > 0} />
        ))}

        <Section
          mark="R"
          title="Estrutura societária e vínculos"
          trailing={
            <Chip tone="brand" size="sm" solid>
              {entidades > 0 ? `${entidades} entidades` : 'Mapa local'}
            </Chip>
          }
          footer={
            <Button variant="outline" size="sm" onClick={onOpenNetwork} rightIcon={<Icons.ArrowRight size={15} aria-hidden="true" />}>
              Abrir mapa em tela cheia
            </Button>
          }
        >
          <p className="text-sm leading-relaxed text-ink-2">
            Mapa de relações entre a empresa, o quadro societário, órgãos contratantes e ocorrências.
          </p>
        </Section>
      </PageBody>
    </Page>
  );
};
