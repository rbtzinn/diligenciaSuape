import React, { useMemo } from 'react';
import { Icons } from '../../../../components/ui/Icons';
import { WorkflowControlBar } from '../../../workflow/components/WorkflowControlBar';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../../types';

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
}

type Tone = 'low' | 'medium' | 'high' | 'critical';

function riskTone(score: number): Tone {
  if (score >= 60) return 'critical';
  if (score >= 35) return 'high';
  if (score >= 15) return 'medium';
  return 'low';
}

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

  const decisionCopy = sanctions > 0
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
    { id: 'processes', label: 'Processos encontrados', count: discoveries.length, icon: <Icons.Scale size={16} />, action: onOpenProcesses },
    { id: 'questionnaire', label: 'Checagens da política', count: undefined, icon: <Icons.CheckCircle size={16} />, action: onOpenQuestionnaire },
    { id: 'audit', label: 'Fontes e auditoria', count: evidenceCount, icon: <Icons.Database size={16} />, action: onOpenAudit },
  ];

  return (
    <aside className="network-inspector investigation-overview-panel" aria-label="Resumo da diligência">
      <div className="investigation-overview-scroll">
        <header className="investigation-overview-head">
          <div>
            <span className="network-panel-kicker">Visão da diligência</span>
            <h3>{diligence.razaoSocial}</h3>
            <p translate="no">CNPJ {diligence.cnpjFmt}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Recolher painel de resumo" title="Recolher painel">
            <Icons.X size={16} aria-hidden="true" />
          </button>
        </header>

        <section className={`investigation-risk-card tone-${tone}`}>
          <div className="investigation-risk-score" aria-label={`Índice de atenção ${score} de 100`}>
            <strong>{score}</strong>
            <span>/100</span>
          </div>
          <div>
            <span>Índice de atenção</span>
            <strong>{diligence.risco?.nivel || 'Atenção baixa'}</strong>
            <p>{decisionCopy}</p>
          </div>
          <button
            type="button"
            onClick={onEditRisk}
            disabled={diligence.persisted === false}
            title={diligence.persisted === false ? 'Sincronize a diligência para ajustar o índice.' : 'Revisar índice'}
          >
            Revisar
          </button>
        </section>

        <div className="investigation-overview-metrics" aria-label="Tamanho do mapa">
          <span><strong>{entityCount}</strong> entidades</span>
          <span><strong>{relationshipCount}</strong> ligações</span>
          <span><strong>{reviewCount}</strong> em revisão</span>
        </div>

        <section className="investigation-next-step">
          <span className="network-panel-kicker">Comece por aqui</span>
          <strong>Selecione uma pessoa ou empresa no mapa</strong>
          <p>O painel mostrará por que ela aparece, quem está ligado a ela e quais fontes sustentam a conexão.</p>
        </section>

        {attentionItems.length > 0 ? (
          <section className="investigation-attention-list">
            <div className="investigation-panel-section-title">
              <span className="network-panel-kicker">O que merece atenção</span>
              <strong>{attentionItems.length}</strong>
            </div>
            {attentionItems.map((item) => (
              <article key={item.title}>
                <Icons.AlertTriangle size={15} aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.copy}</p>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="investigation-clear-state">
            <Icons.ShieldCheck size={18} aria-hidden="true" />
            <span>Nenhum ponto prioritário aberto nas verificações concluídas.</span>
          </div>
        )}

        <section className="investigation-quick-actions">
          <span className="network-panel-kicker">Abrir detalhes</span>
          <div>
            {quickActions.map((item) => (
              <button type="button" onClick={item.action} key={item.id}>
                <span aria-hidden="true">{item.icon}</span>
                <strong>{item.label}</strong>
                {typeof item.count === 'number' ? <small>{item.count}</small> : <Icons.ArrowRight size={13} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="investigation-download-report" onClick={onExportPdf} disabled={isExportingPdf}>
          {isExportingPdf ? <Icons.Loader size={16} aria-hidden="true" /> : <Icons.Download size={16} aria-hidden="true" />}
          <span>{isExportingPdf ? 'Gerando dossiê…' : 'Baixar dossiê completo'}</span>
        </button>

        <details className="investigation-workflow-details">
          <summary>
            <span>Revisão e aprovação</span>
            <Icons.ChevronDown size={14} aria-hidden="true" />
          </summary>
          <WorkflowControlBar
            diligence={{ ...diligence, status: workflowStatus }}
            onStatusChange={onWorkflowStatusChange}
            showPdf={false}
          />
        </details>
      </div>
    </aside>
  );
};
