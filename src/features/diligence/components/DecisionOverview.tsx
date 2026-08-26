import React, { useMemo } from 'react';
import { Icons } from '../../../components/ui/Icons';
import { Button } from '../../../components/ui/Button';
import { WorkflowControlBar } from '../../workflow/components/WorkflowControlBar';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../types';
import { ComplexQuestionnairePanel } from './ComplexQuestionnairePanel';

interface DecisionOverviewProps {
  diligence: DiligenceItem;
  adverseMedia?: AdverseMediaSummary;
  discoveries: ProcessDiscovery[];
  workflowStatus?: string;
  onWorkflowStatusChange: (status: string) => void;
  onOpenNetwork: () => void;
  onOpenEvidence: () => void;
}

type Tone = 'positive' | 'attention' | 'critical' | 'neutral';

function plural(value: number, singular: string, pluralForm: string) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export const DecisionOverview: React.FC<DecisionOverviewProps> = ({
  diligence,
  adverseMedia,
  discoveries,
  workflowStatus,
  onWorkflowStatusChange,
  onOpenNetwork,
  onOpenEvidence,
}) => {
  const { empresa, ceis, cnep, pepResults, risco, egos } = diligence;
  const safePepResults = Array.isArray(pepResults) ? pepResults : [];
  const safeFindings = Array.isArray(egos?.findings) ? egos.findings : [];
  const safeCoverage = Array.isArray(egos?.coverage) ? egos.coverage : [];
  const safeEntities = Array.isArray(egos?.entities) ? egos.entities : [];
  const safeRelationships = Array.isArray(egos?.relationships) ? egos.relationships : [];
  const safeResolutions = Array.isArray(egos?.resolutions) ? egos.resolutions : [];
  const situacao = (empresa?.descricao_situacao_cadastral || 'NÃO INFORMADA').toUpperCase();
  const isActive = situacao === 'ATIVA';
  const activeCeis = ceis?.vigentes ?? (ceis?.encontrado ? ceis.quantidade : 0);
  const activeCnep = cnep?.vigentes ?? (cnep?.encontrado ? cnep.quantidade : 0);
  const activeSanctions = activeCeis + activeCnep;
  const reviewFindings = safeFindings.filter((finding) => {
    if (finding.status !== 'REVIEW' && finding.status !== 'INCONCLUSIVE') return false;
    if (finding.axis !== 'MEDIA') return true;
    const relationship = finding.relationshipId
      ? safeRelationships.find((item) => item.id === finding.relationshipId)
      : undefined;
    const evidenceEntity = relationship
      ? safeEntities.find((entity) => (
          entity.id === relationship.sourceEntityId || entity.id === relationship.targetEntityId
        ) && entity.type === 'Document')
      : undefined;
    const categories = Array.isArray(evidenceEntity?.properties?.categories)
      ? evidenceEntity.properties.categories
      : [];
    return categories.length > 0;
  });
  const legacyPepReviews = safePepResults.filter((item) => item.encontrado).length;
  const riskDetails = Array.isArray(risco?.detalhes) ? risco.detalhes : [];
  const riskReviewDetails = riskDetails.filter((detail) =>
    detail.natureza !== 'manual_override' && detail.requerRevisao
  );
  const reviewCount = Math.max(reviewFindings.length || legacyPepReviews, riskReviewDetails.length);
  const riskScore = risco?.score ?? 0;
  const isCriticalRisk = riskScore >= 60 || risco?.nivel === 'Atenção Crítica';
  const isElevatedRisk = riskScore >= 35 || risco?.nivel === 'Atenção Elevada';
  const coverage = safeCoverage;
  const applicableCoverage = coverage.filter((item) => item.status !== 'NOT_APPLICABLE');
  const consultedCoverage = applicableCoverage.filter((item) =>
    item.status === 'CONSULTED' || item.status === 'PARTIAL'
  ).length;
  const unavailableCoverage = applicableCoverage.filter((item) =>
    item.status === 'UNAVAILABLE' || item.status === 'NOT_CONSULTED'
  );
  const entityCount = safeEntities.length;
  const relationshipCount = safeRelationships.length;

  const decision = useMemo(() => {
    if (!isActive) {
      return {
        tone: 'critical' as Tone,
        eyebrow: 'Decisão interrompida',
        title: 'Regularize o cadastro antes de avançar',
        copy: `A Receita Federal informa a situação “${situacao}”. O processo não deve avançar até a regularização cadastral.`,
        action: 'Ver evidências cadastrais',
      };
    }
    if (activeSanctions > 0) {
      return {
        tone: 'critical' as Tone,
        eyebrow: 'Bloqueio identificado',
        title: 'Não avance com a contratação',
        copy: `${plural(activeSanctions, 'impedimento ativo foi localizado', 'impedimentos ativos foram localizados')} em bases oficiais.`,
        action: 'Examinar impedimentos',
      };
    }
    if (isCriticalRisk) {
      return {
        tone: 'critical' as Tone,
        eyebrow: 'Exposição crítica',
        title: 'Submeta a decisão ao comitê de riscos',
        copy: 'A soma de sinais, vínculos, hipóteses e lacunas atingiu nível crítico. Isso não prova irregularidade, mas exige mitigação formal antes de avançar.',
        action: 'Examinar sinais de risco',
      };
    }
    if (isElevatedRisk) {
      return {
        tone: 'attention' as Tone,
        eyebrow: 'Exposição elevada',
        title: 'Aprofunde a diligência antes de decidir',
        copy: 'A combinação dos sinais encontrados representa exposição relevante para o Compliance, ainda que parte deles dependa de confirmação humana.',
        action: 'Revisar fatores de risco',
      };
    }
    if (reviewCount > 0) {
      const reviewCopy = reviewCount === 1
        ? '1 hipótese precisa ser confirmada ou descartada.'
        : `${reviewCount} hipóteses precisam ser confirmadas ou descartadas.`;
      return {
        tone: 'attention' as Tone,
        eyebrow: 'Decisão condicionada',
        title: 'Avance somente após a revisão humana',
        copy: `${reviewCopy} Nenhum impedimento oficial ativo foi encontrado.`,
        action: 'Revisar hipóteses',
      };
    }
    if (unavailableCoverage.length > 0) {
      return {
        tone: 'attention' as Tone,
        eyebrow: 'Cobertura parcial',
        title: 'A decisão ainda tem uma lacuna',
        copy: `${plural(unavailableCoverage.length, 'eixo não pôde', 'eixos não puderam')} ser consultado. O parecer permanece condicionado à cobertura disponível.`,
        action: 'Ver cobertura',
      };
    }
    return {
      tone: 'positive' as Tone,
      eyebrow: 'Parecer executivo',
      title: 'Pode avançar para a próxima etapa',
      copy: 'Não foram encontrados impedimentos nas bases consultadas. Preserve as evidências e siga o fluxo de aprovação.',
      action: 'Abrir evidências',
    };
  }, [activeSanctions, isActive, isCriticalRisk, isElevatedRisk, reviewCount, situacao, unavailableCoverage.length]);

  const egosAttentionItems = reviewFindings.map((finding) => {
        const relationship = finding.relationshipId
          ? safeRelationships.find((item) => item.id === finding.relationshipId)
          : undefined;
        const resolution = relationship ? safeResolutions.find((item) => (
          (item.sourceEntityId === relationship.sourceEntityId && item.candidateEntityId === relationship.targetEntityId)
          || (item.sourceEntityId === relationship.targetEntityId && item.candidateEntityId === relationship.sourceEntityId)
        )) : undefined;
        const candidate = resolution
          ? safeEntities.find((entity) => entity.id === resolution.candidateEntityId)
          : undefined;
        const matchedSignals = resolution?.signals?.filter((signal) => signal.matched) || [];
        return {
          title: finding.title,
          copy: finding.explanation,
          confidence: finding.confidence,
          candidateName: candidate?.name || resolution?.candidateName,
          tag: finding.status === 'INCONCLUSIVE' ? 'Hipótese inconclusiva' : 'Revisão necessária',
          matchBasis: matchedSignals.length > 0
            ? matchedSignals.map((signal) => `${signal.label}${signal.weight > 0 ? ` (+${signal.weight})` : ''}`).join(' · ')
            : undefined,
        };
      });
  const riskAttentionItems = riskDetails
    .filter((detail) => detail.natureza !== 'manual_override' && (detail.pontos > 0 || detail.requerRevisao))
    .sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos))
    .map((detail) => ({
      title: detail.criterio,
      copy: detail.info,
      confidence: undefined,
      candidateName: undefined,
      tag: detail.natureza === 'confirmed'
        ? 'Registro confirmado'
        : detail.natureza === 'coverage'
          ? 'Lacuna de cobertura'
          : detail.natureza === 'uncertainty'
            ? 'Hipótese de risco'
            : 'Indicador de exposição',
      matchBasis: undefined,
    }));
  const fallbackAttentionItems = (diligence.analise?.alertas || []).map((alert) => ({
        title: alert.titulo,
        copy: alert.texto,
        confidence: undefined,
        candidateName: undefined,
        tag: 'Alerta da análise',
        matchBasis: undefined,
      }));
  const attentionItems = [...riskAttentionItems, ...egosAttentionItems, ...fallbackAttentionItems]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.title === item.title) === index)
    .slice(0, 4);

  const statusItems: Array<{ label: string; value: string; detail: string; tone: Tone }> = [
    {
      label: 'Cadastro',
      value: isActive ? 'Regular' : situacao,
      detail: 'Situação na Receita Federal',
      tone: isActive ? 'positive' : 'critical',
    },
    {
      label: 'Integridade',
      value: activeSanctions > 0 ? plural(activeSanctions, 'bloqueio', 'bloqueios') : 'Sem bloqueio',
      detail: 'CEIS e CNEP',
      tone: activeSanctions > 0 ? 'critical' : 'positive',
    },
    {
      label: 'Cobertura técnica',
      value: coverage.length > 0 ? `${consultedCoverage}/${applicableCoverage.length} eixos` : 'Em atualização',
      detail: unavailableCoverage.length > 0
        ? plural(unavailableCoverage.length, 'lacuna declarada', 'lacunas declaradas')
        : 'Veja os limites por pergunta',
      tone: unavailableCoverage.length > 0 ? 'attention' : 'neutral',
    },
  ];

  return (
    <div className="decision-room" aria-label="Resumo executivo da diligência">
      <section className={`decision-command decision-command-${decision.tone}`}>
        <div className="decision-command-mark" aria-hidden="true">
          {decision.tone === 'critical' ? <Icons.ShieldAlert size={28} /> : decision.tone === 'positive' ? <Icons.ShieldCheck size={28} /> : <Icons.Compass size={28} />}
        </div>
        <div className="decision-command-copy">
          <span className="decision-command-eyebrow">{decision.eyebrow}</span>
          <h2>{decision.title}</h2>
          <p>{decision.copy}</p>
        </div>
        <div className="decision-command-actions" aria-label="Próximos passos">
          <button
            type="button"
            className="decision-cta-btn decision-cta-primary"
            onClick={onOpenEvidence}
          >
            <span className="decision-cta-text">{decision.action}</span>
            <span className="decision-cta-icon-wrapper" aria-hidden="true">
              <Icons.ArrowRight size={15} />
            </span>
          </button>
          <button
            type="button"
            className="decision-cta-btn decision-cta-secondary"
            onClick={onOpenNetwork}
          >
            <span className="decision-cta-text">Entender os vínculos</span>
            <span className="decision-cta-icon-wrapper" aria-hidden="true">
              <Icons.Network size={15} />
            </span>
          </button>
        </div>
      </section>

      <section className="decision-signal-strip" aria-label="Sinais principais">
        {statusItems.map((item) => (
          <div className={`decision-signal decision-signal-${item.tone}`} key={item.label}>
            <span className="decision-signal-label">{item.label}</span>
            <strong>{item.value}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </section>

      <div className="decision-priority-grid">
        <section className="decision-story-main">
          <div className="decision-section-heading">
            <div>
              <span className="decision-section-kicker">O que merece seu olhar</span>
              <h3>{attentionItems.length > 0 ? 'Pontos que mudam a decisão' : 'Nenhum ponto crítico aberto'}</h3>
            </div>
            {attentionItems.length > 0 ? <span className="decision-count">{attentionItems.length}</span> : null}
          </div>

          {attentionItems.length > 0 ? (
            <div className="decision-attention-list">
              {attentionItems.map((item, index) => (
                <article className="decision-attention-row" key={`${item.title}-${index}`}>
                  <span className="decision-attention-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    {item.tag ? <span className="decision-attention-tag">{item.tag}</span> : null}
                    <h4>{item.title}</h4>
                    <p>{item.copy}</p>
                    {item.candidateName ? (
                      <div className="decision-match-explain">
                        <span>Candidato encontrado</span>
                        <strong>{item.candidateName}</strong>
                        {item.matchBasis ? <small>Índice formado por: {item.matchBasis}.</small> : null}
                      </div>
                    ) : null}
                  </div>
                  {typeof item.confidence === 'number' ? (
                    <span className="decision-confidence">Índice {Math.round(item.confidence * (item.confidence <= 1 ? 100 : 1))}/100</span>
                  ) : null}
                </article>
              ))}
              <button type="button" className="decision-text-action" onClick={onOpenEvidence}>
                Conferir evidências e registrar decisão
                <Icons.ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="decision-clean-state">
              <Icons.CheckCircle size={22} aria-hidden="true" />
              <div>
                <strong>As verificações concluídas não apontaram bloqueios.</strong>
                <span>Use a aba Evidências para conferir a origem de cada informação.</span>
              </div>
            </div>
          )}

        </section>

        <section className={`decision-coverage-card ${unavailableCoverage.length > 0 ? 'has-gaps' : 'is-complete'}`}>
          <div className="decision-section-heading">
            <div>
              <span className="decision-section-kicker">Limites da análise</span>
              <h3>{unavailableCoverage.length > 0 ? 'Lacunas de cobertura' : 'Cobertura declarada'}</h3>
            </div>
            <span className="decision-coverage-ratio">{consultedCoverage}/{applicableCoverage.length || '—'}</span>
          </div>

          {unavailableCoverage.length > 0 ? (
            <div className="decision-coverage-list">
              {unavailableCoverage.slice(0, 4).map((item) => (
                <article key={item.id || `${item.axis}-${item.provider}`}>
                  <Icons.AlertTriangle size={16} aria-hidden="true" />
                  <div>
                    <strong>{item.axis}</strong>
                    <span>{item.message}</span>
                  </div>
                </article>
              ))}
              <Button variant="secondary" size="sm" onClick={onOpenEvidence}>
                Resolver nas evidências
                <Icons.ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <div className="decision-coverage-complete">
              <Icons.CheckCircle size={20} aria-hidden="true" />
              <div>
                <strong>{coverage.length > 0 ? `${consultedCoverage} fontes aplicáveis consultadas` : 'Cobertura em atualização'}</strong>
                <span>{coverage.length - applicableCoverage.length > 0
                  ? `${coverage.length - applicableCoverage.length} fonte(s) marcada(s) como não aplicável.`
                  : 'Os limites e a proveniência estão registrados na aba Evidências.'}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <ComplexQuestionnairePanel
        diligence={diligence}
        adverseMedia={adverseMedia}
        discoveries={discoveries}
        onOpenEvidence={onOpenEvidence}
      />

      <section className="decision-workflow-band" aria-label="Fluxo de aprovação">
        <WorkflowControlBar
          diligence={{ ...diligence, status: workflowStatus }}
          onStatusChange={onWorkflowStatusChange}
          showPdf={false}
        />
      </section>

      <section className="decision-network-entry">
        <div className="decision-network-visual" aria-hidden="true">
          <span className="network-preview-node network-preview-root" />
          <span className="network-preview-node network-preview-a" />
          <span className="network-preview-node network-preview-b" />
          <span className="network-preview-node network-preview-c" />
          <i className="network-preview-line network-preview-line-a" />
          <i className="network-preview-line network-preview-line-b" />
          <i className="network-preview-line network-preview-line-c" />
        </div>
        <div className="decision-network-copy">
          <span className="decision-network-kicker">Campo investigativo</span>
          <h3>Entre na rede, não em outra tabela</h3>
          <p>Explore pessoas, empresas, órgãos e documentos em um mapa interativo com vínculos confirmados e hipóteses visualmente separados.</p>
          <div className="decision-network-metrics">
            <span><strong>{entityCount}</strong> entidades</span>
            <span><strong>{relationshipCount}</strong> relações</span>
            <span><strong>{discoveries.length}</strong> processos descobertos</span>
            <span><strong>{adverseMedia?.totalFound || 0}</strong> ocorrências de mídia</span>
          </div>
        </div>
        <Button variant="primary" onClick={onOpenNetwork}>
          Explorar Rede 360
          <Icons.Maximize size={15} aria-hidden="true" />
        </Button>
      </section>
    </div>
  );
};
