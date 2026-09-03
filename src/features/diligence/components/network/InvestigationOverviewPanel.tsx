// ==========================================================
// DILIGÊNCIA 360 — Resumo da diligência no mapa
// ==========================================================
// O painel era desenhado por investigation-experience/summary.css
// para viver sobre fundo azul-escuro: texto branco, números em
// 'Cascadia Mono' (fonte que o projeto não carrega) e corpos de 9 e
// 10px. Depois que o grafo passou a ser claro, o painel ficou sendo
// a única superfície escura da tela.
//
// Agora ele usa as seções, os selos e os botões do projeto, com os
// mesmos corpos de texto do dossiê.
// ==========================================================

import React, { useMemo } from 'react';
import { Icons } from '../../../../components/ui/Icons';
import { WorkflowControlBar } from '../../../workflow/components/WorkflowControlBar';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../../types';
import { buildRiskNarrative, type NarrativeTone } from '../../utils/riskNarrative';
import { Section } from '../../../../components/ui/Section';
import { Button } from '../../../../components/ui/Button';
import { Chip } from '../../../../components/ui/Chip';
import { Note } from '../../../../components/ui/Note';
import { Stat, FactTone } from '../../../../components/ui/Facts';
import { cn } from '../../../../lib/cn';

interface InvestigationOverviewPanelProps {
  diligence: DiligenceItem;
  adverseMedia?: AdverseMediaSummary;
  discoveries: ProcessDiscovery[];
  entityCount: number;
  relationshipCount: number;
  evidenceCount: number;
  reviewCount: number;
  workflowStatus?: string;
  isExportingPdf: boolean;
  onWorkflowStatusChange: (status: string) => void;
  onClose: () => void;
  onExportPdf: () => void;
  onEditRisk: () => void;
  onOpenPeople: () => void;
  onOpenSanctions: () => void;
  onOpenMedia: () => void;
  onOpenProcesses: () => void;
  onOpenQuestionnaire: () => void;
  onOpenAudit: () => void;
  onOpenAiAnalysis: () => void;
  onOpenPncp: () => void;
}

/** Faixas do motor de risco, traduzidas para o tom visual. */
function riskTone(score: number): FactTone {
  if (score >= 60) return 'critical';
  if (score >= 35) return 'high';
  if (score >= 15) return 'warn';
  return 'ok';
}

/** Tom da narrativa → tom do aviso. Exaustivo sobre a união, de modo
    que um nível novo em riskNarrative quebre o build em vez de cair
    silenciosamente num padrão. */
const NARRATIVE_TONE: Record<NarrativeTone, 'ok' | 'warn' | 'high'> = {
  clear: 'ok',
  attention: 'warn',
  critical: 'high',
};

export const InvestigationOverviewPanel: React.FC<InvestigationOverviewPanelProps> = ({
  diligence,
  adverseMedia,
  discoveries,
  entityCount,
  relationshipCount,
  evidenceCount,
  reviewCount,
  workflowStatus,
  isExportingPdf,
  onWorkflowStatusChange,
  onClose,
  onExportPdf,
  onEditRisk,
  onOpenPeople,
  onOpenSanctions,
  onOpenMedia,
  onOpenProcesses,
  onOpenQuestionnaire,
  onOpenAudit,
  onOpenAiAnalysis,
  onOpenPncp,
}) => {
  const score = Math.max(0, Math.min(100, diligence.risco?.score || 0));
  const tone = riskTone(score);
  const sanctions = (diligence.ceis?.quantidade || 0) + (diligence.cnep?.quantidade || 0);
  const mediaResults = adverseMedia?.results?.filter((item) => item.status !== 'discarded').length || 0;

  const attentionItems = useMemo(() => {
    const riskDetails = Array.isArray(diligence.risco?.detalhes) ? diligence.risco.detalhes : [];
    const fromRisk = riskDetails
      .filter((item) => item.requerRevisao || item.pontos > 0)
      .sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos))
      .map((item) => ({ title: item.criterio, copy: item.info }));
    const fromAnalysis = (diligence.analise?.alertas || []).map((item) => ({
      title: item.titulo,
      copy: item.texto,
    }));
    return [...fromRisk, ...fromAnalysis]
      .filter((item, index, list) => list.findIndex((candidate) => candidate.title === item.title) === index)
      .slice(0, 3);
  }, [diligence.analise?.alertas, diligence.risco?.detalhes]);

  const narrative = useMemo(
    () => buildRiskNarrative(diligence, adverseMedia, discoveries),
    [adverseMedia, diligence, discoveries],
  );

  const decisionCopy =
    sanctions > 0
      ? 'Existe registro em base oficial que precisa ser examinado antes de qualquer decisão.'
      : score >= 60
        ? 'O conjunto de sinais atingiu atenção crítica e precisa de revisão antes da decisão.'
        : score >= 35
          ? 'O conjunto de sinais exige atenção elevada e leitura das evidências prioritárias.'
          : reviewCount > 0
            ? `${reviewCount} apontamento(s) dependem de confirmação ou descarte por uma pessoa.`
            : 'Nenhum impedimento oficial ativo foi identificado nas fontes que responderam.';

  const quickActions = [
    { id: 'people', label: 'Pessoas e sócios', count: diligence.socios?.length || 0, icon: <Icons.Users size={16} />, action: onOpenPeople },
    { id: 'sanctions', label: 'Sanções oficiais', count: sanctions, icon: <Icons.ShieldAlert size={16} />, action: onOpenSanctions },
    { id: 'media', label: 'Notícias e documentos', count: mediaResults, icon: <Icons.FileText size={16} />, action: onOpenMedia },
    {
      id: 'processes',
      label: 'Processos encontrados',
      count: discoveries.length + (diligence.tcePe?.resumo?.total || 0),
      icon: <Icons.Scale size={16} />,
      action: onOpenProcesses,
    },
    { id: 'questionnaire', label: 'Checagens da política', count: undefined, icon: <Icons.CheckCircle size={16} />, action: onOpenQuestionnaire },
    { id: 'audit', label: 'Fontes e auditoria', count: evidenceCount, icon: <Icons.Database size={16} />, action: onOpenAudit },
    {
      id: 'pncp',
      label: 'Contratos e recursos públicos',
      count: (diligence.pncp?.resumo?.confirmados || 0) + (diligence.federalExposure?.resumo?.contratosConfirmados || 0),
      icon: <Icons.Landmark size={16} />,
      action: onOpenPncp,
    },
    { id: 'ai', label: 'Leitura consolidada por IA', count: undefined, icon: <Icons.Sparkles size={16} />, action: onOpenAiAnalysis },
  ];

  return (
    <aside aria-label="Resumo da diligência" className="flex min-w-0 flex-col gap-3 p-3">
      <header className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="block text-2xs font-bold uppercase tracking-wider text-ink-3">Visão da diligência</span>
          <h3 className="text-md font-bold leading-snug text-ink">{diligence.razaoSocial}</h3>
          <p className="font-mono text-xs text-ink-3" translate="no">
            {diligence.cnpjFmt}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onClose}
          aria-label="Recolher painel de resumo"
          title="Recolher painel"
          icon={<Icons.X size={16} aria-hidden="true" />}
        />
      </header>

      {/* ---- Índice de atenção ---- */}
      <Section
        title="Índice de atenção"
        subtitle={diligence.risco?.nivel || 'Atenção baixa'}
        trailing={
          <Button
            variant="outline"
            size="sm"
            onClick={onEditRisk}
            disabled={diligence.persisted === false}
            title={
              diligence.persisted === false
                ? 'Sincronize a diligência para ajustar o índice.'
                : 'Revisar índice'
            }
          >
            Revisar
          </Button>
        }
      >
        <Stat value={score} caption="de 100" decision={decisionCopy} tone={tone} />
      </Section>

      {/* ---- Leitura simples ---- */}
      <Section mark={<Icons.FileText size={12} />} title="Em poucas palavras" subtitle={narrative.headline}>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm leading-relaxed text-ink-2">{narrative.verdict}</p>

          {narrative.supports.length > 0 ? (
            <Note tone={NARRATIVE_TONE[narrative.tone]} title="O que foi encontrado">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {narrative.supports.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Note>
          ) : null}

          {narrative.gaps.length > 0 ? (
            <Note tone="warn" title="O que ficou sem verificar">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {narrative.gaps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Note>
          ) : null}

          <p className="flex items-start gap-1.5 text-sm font-semibold leading-snug text-brand">
            <Icons.ArrowRight size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            {narrative.nextStep}
          </p>
        </div>
      </Section>

      {/* ---- Tamanho do mapa ---- */}
      <div aria-label="Tamanho do mapa" className="flex flex-wrap gap-1.5">
        <Chip tone="neutral" size="sm">
          {entityCount} entidades
        </Chip>
        <Chip tone="neutral" size="sm">
          {relationshipCount} ligações
        </Chip>
        <Chip tone={reviewCount > 0 ? 'warn' : 'ok'} size="sm" dot>
          {reviewCount} em revisão
        </Chip>
      </div>

      <Note tone="info" icon={<Icons.Compass size={16} aria-hidden="true" />} title="Comece por aqui">
        Selecione uma pessoa ou empresa no mapa. O painel mostrará por que ela aparece, quem está ligado a ela e quais
        fontes sustentam a conexão.
      </Note>

      {/* ---- Atenção ---- */}
      {attentionItems.length > 0 ? (
        <Section
          title="O que merece atenção"
          trailing={
            <Chip tone="warn" size="sm">
              {attentionItems.length}
            </Chip>
          }
          flush
        >
          <ul className="divide-y divide-line-soft">
            {attentionItems.map((item) => (
              <li key={item.title} className="flex min-w-0 items-start gap-2 px-4 py-2.5">
                <Icons.AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
                <div className="min-w-0">
                  <strong className="block text-sm font-bold leading-snug text-ink">{item.title}</strong>
                  <p className="text-xs leading-relaxed text-ink-2">{item.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Note tone="ok" icon={<Icons.ShieldCheck size={16} aria-hidden="true" />}>
          Nenhum ponto prioritário aberto nas verificações concluídas.
        </Note>
      )}

      {/* ---- Atalhos ---- */}
      <Section title="Abrir detalhes" flush>
        <ul className="divide-y divide-line-soft">
          {quickActions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.action}
                className="flex w-full min-w-0 items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
              >
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
                  {item.icon}
                </span>
                <strong className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{item.label}</strong>
                {typeof item.count === 'number' ? (
                  <span
                    className={cn(
                      'num shrink-0 rounded-chip px-2 py-0.5 text-2xs font-bold',
                      item.count > 0 ? 'bg-brand-soft text-brand' : 'bg-surface-active text-ink-3',
                    )}
                  >
                    {item.count}
                  </span>
                ) : (
                  <Icons.ArrowRight size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Button
        variant="primary"
        block
        onClick={onExportPdf}
        isLoading={isExportingPdf}
        loadingLabel="Gerando dossiê…"
        icon={<Icons.Download size={16} aria-hidden="true" />}
      >
        Baixar dossiê completo
      </Button>

      <details className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-hover">
          <span className="min-w-0 flex-1">Revisão e aprovação</span>
          <Icons.ChevronDown size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
        </summary>
        <div className="border-t border-line-soft p-3">
          <WorkflowControlBar
            diligence={{ ...diligence, status: workflowStatus }}
            onStatusChange={onWorkflowStatusChange}
            showPdf={false}
          />
        </div>
      </details>
    </aside>
  );
};
