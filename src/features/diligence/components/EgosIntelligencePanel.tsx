import React, { useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import type { EgosCoverageItem, EgosEntity, EgosFinding, EgosResolution, EgosSnapshot } from '../types';
import { EgosGraphExplorer } from './EgosGraphExplorer';
import { EgosReviewService } from '../services/egos-review.service';

interface EgosIntelligencePanelProps {
  egos?: EgosSnapshot;
  diligenceId: string;
  showGraph?: boolean;
}

const AXIS_LABELS: Record<string, string> = {
  CADASTRO: 'Cadastro empresarial',
  QSA: 'Quadro societário',
  QSA_HISTORY: 'Histórico de diretores e sócios',
  CEIS: 'Sanções CEIS',
  CNEP: 'Sanções CNEP',
  PEP: 'Pessoas expostas politicamente',
  MEDIA: 'Mídia e ocorrências públicas',
  PROCESS_DISCOVERY: 'Descoberta processual',
  DATAJUD: 'Enriquecimento DataJud',
  DIARIOS_OFICIAIS: 'Diários oficiais',
  OFFSHORE: 'Relações offshore',
  INTERNAL_SUAPE: 'Vínculo institucional SUAPE',
  CORPORATE_EXPANSION: 'Expansão societária',
  FUND_RELATIONSHIPS: 'Gestor, administrador e prestadores do fundo',
  PUBLIC_CONTRACTS: 'Contratos públicos confirmados',
  PUBLIC_PAYMENTS: 'Pagamentos públicos confirmados',
  ENTITY_RESOLUTION: 'Resolução de identidade',
  RELATIONSHIPS: 'Rede de relacionamentos',
};

const STATUS_LABELS: Record<EgosCoverageItem['status'], string> = {
  CONSULTED: 'Consultado',
  PARTIAL: 'Consulta parcial',
  NOT_CONSULTED: 'Não consultado',
  UNAVAILABLE: 'Indisponível',
  NOT_APPLICABLE: 'Não aplicável',
};

const FINDING_LABELS: Record<EgosFinding['status'], string> = {
  OK: 'OK',
  REVIEW: 'Revisão',
  INCONCLUSIVE: 'Inconclusivo',
  UNAVAILABLE: 'Indisponível',
};

function findEvidence(egos: EgosSnapshot, finding: EgosFinding) {
  return (egos.evidences || []).find((item) => (
    (finding.relationshipId && item.relationshipId === finding.relationshipId)
    || (finding.entityId && item.entityId === finding.entityId)
  ));
}

function textProperty(entity: EgosEntity | undefined, key: string) {
  const value = entity?.properties?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function maskedCpf(entity: EgosEntity | undefined) {
  const property = textProperty(entity, 'maskedCpf');
  if (property) return property;
  const identifier = entity?.identifiers?.find((item) => (
    (item.identifierType || item.type || '').toUpperCase() === 'MASKED_CPF'
  ));
  return identifier?.value || null;
}

function employmentLabel(value: string | null) {
  const labels: Record<string, string> = {
    employee: 'Empregado(a)',
    commissioned: 'Comissionado(a)',
    seconded: 'Cedido(a)',
    board_administration: 'Conselho de Administração',
    board_fiscal: 'Conselho Fiscal',
    audit_committee: 'Comitê de Auditoria',
    institutional_member: 'Vínculo institucional',
  };
  return value ? labels[value] || value.replace(/_/g, ' ') : null;
}

interface FindingMatchContext {
  resolution: EgosResolution;
  source?: EgosEntity;
  candidate?: EgosEntity;
  office?: EgosEntity;
  isPep: boolean;
}

function matchContextForFinding(egos: EgosSnapshot, finding: EgosFinding): FindingMatchContext | null {
  if (!finding.relationshipId) return null;
  const relationships = Array.isArray(egos.relationships) ? egos.relationships : [];
  const resolutions = Array.isArray(egos.resolutions) ? egos.resolutions : [];
  const entities = Array.isArray(egos.entities) ? egos.entities : [];
  const relationship = relationships.find((item) => item.id === finding.relationshipId);
  if (!relationship || relationship.type !== 'POSSIBLE_IDENTITY_MATCH') return null;
  const resolution = resolutions.find((item) => (
    (item.sourceEntityId === relationship.sourceEntityId && item.candidateEntityId === relationship.targetEntityId)
    || (item.sourceEntityId === relationship.targetEntityId && item.candidateEntityId === relationship.sourceEntityId)
  ));
  if (!resolution) return null;

  const source = entities.find((item) => item.id === resolution.sourceEntityId);
  const candidate = entities.find((item) => item.id === resolution.candidateEntityId);
  const officeRelationship = relationships.find((item) => (
    item.type === 'HOLDS_PUBLIC_OFFICE'
    && (item.sourceEntityId === candidate?.id || item.targetEntityId === candidate?.id)
  ));
  const officeId = officeRelationship
    ? (officeRelationship.sourceEntityId === candidate?.id ? officeRelationship.targetEntityId : officeRelationship.sourceEntityId)
    : null;
  const office = officeId ? entities.find((item) => item.id === officeId) : undefined;
  const isPep = candidate?.role === 'pep_candidate'
    || textProperty(candidate, 'source') === 'CGU_PEP'
    || Boolean(office);

  return { resolution, source, candidate, office, isPep };
}

const IdentityMatchDetail: React.FC<{ context: FindingMatchContext }> = ({ context }) => {
  const { resolution, source, candidate, office, isPep } = context;
  const role = textProperty(candidate, 'publicRole') || textProperty(office, 'role');
  const organization = textProperty(candidate, 'publicOrganization') || textProperty(office, 'organization');
  const startsAt = textProperty(candidate, 'publicServiceStart') || textProperty(office, 'startsAt');
  const endsAt = textProperty(candidate, 'publicServiceEnd') || textProperty(office, 'endsAt');
  const employmentType = employmentLabel(textProperty(candidate, 'employmentType'));
  const referencePeriod = textProperty(candidate, 'referencePeriod');
  const sourceSheet = textProperty(candidate, 'sourceSheet');
  const signals = Array.isArray(resolution.signals) ? resolution.signals : [];

  return (
    <div className="egos-match-detail">
      <div className="egos-match-detail-head">
        <div>
          <span>{isPep ? 'Candidato exato retornado pela CGU' : 'Registro funcional comparado'}</span>
          <strong>{candidate?.name || resolution.candidateName || 'Candidato sem nome informado'}</strong>
        </div>
        <b>{resolution.score}<small>/100</small></b>
      </div>

      <div className="egos-match-identity-pair">
        <div><small>Nome pesquisado</small><strong>{source?.name || resolution.sourceName || 'Não informado'}</strong></div>
        <Icons.ArrowRight size={14} aria-hidden="true" />
        <div><small>Registro encontrado</small><strong>{candidate?.name || resolution.candidateName || 'Não informado'}</strong></div>
      </div>

      <dl className="egos-match-facts">
        {maskedCpf(candidate) ? <div><dt>CPF mascarado</dt><dd>{maskedCpf(candidate)}</dd></div> : null}
        {role ? <div><dt>Função pública</dt><dd>{role}</dd></div> : null}
        {organization ? <div><dt>Órgão</dt><dd>{organization}</dd></div> : null}
        {startsAt || endsAt ? <div><dt>Período</dt><dd>{startsAt || 'não informado'} a {endsAt || 'não informado'}</dd></div> : null}
        {employmentType ? <div><dt>Tipo de vínculo</dt><dd>{employmentType}</dd></div> : null}
        {referencePeriod ? <div><dt>Competência</dt><dd>{referencePeriod}</dd></div> : null}
        {sourceSheet ? <div><dt>Origem interna</dt><dd>{sourceSheet}</dd></div> : null}
      </dl>

      <div className="egos-match-signals" aria-label="Campos usados na comparação">
        <span>Como o índice foi calculado</span>
        {signals.map((signal) => (
          <div className={signal.matched ? 'matched' : 'not-matched'} key={`${signal.code}-${signal.detail}`}>
            {signal.matched ? <Icons.CheckCircle size={14} aria-hidden="true" /> : <Icons.Info size={14} aria-hidden="true" />}
            <p><strong>{signal.label}</strong><small>{signal.detail}{signal.weight > 0 ? ` · +${signal.weight} pontos` : ''}</small></p>
          </div>
        ))}
      </div>

      <p className="egos-match-disclaimer">
        <Icons.AlertTriangle size={14} aria-hidden="true" />
        O índice mede compatibilidade entre campos; não é probabilidade e não confirma que as duas pessoas são a mesma.
      </p>
    </div>
  );
};

export const EgosIntelligencePanel: React.FC<EgosIntelligencePanelProps> = ({ egos, diligenceId, showGraph = true }) => {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});
  if (!egos) {
    return (
      <section className="egos-shell egos-shell-empty" aria-label="Inteligência EGOS indisponível">
        <div className="egos-empty-icon"><Icons.Database size={22} /></div>
        <div>
          <strong>EGOS não executado nesta diligência</strong>
          <p>Este dossiê foi criado antes da camada de entidades e evidências. Atualize a consulta para gerar a rede rastreável.</p>
        </div>
      </section>
    );
  }

  const findings = Array.isArray(egos.findings) ? egos.findings : [];
  const coverage = Array.isArray(egos.coverage) ? egos.coverage : [];
  const insights = Array.isArray(egos.insights) ? egos.insights : [];
  const relationships = Array.isArray(egos.relationships) ? egos.relationships : [];
  const metrics = egos.metrics || {
    entities: Array.isArray(egos.entities) ? egos.entities.length : 0,
    relationships: relationships.length,
    evidences: Array.isArray(egos.evidences) ? egos.evidences.length : 0,
    findings: findings.length,
    resolutions: Array.isArray(egos.resolutions) ? egos.resolutions.length : 0,
    coverage: {},
    statuses: {},
  };
  const normalizedEgos: EgosSnapshot = {
    ...egos,
    metrics,
    insights,
    coverage,
    entities: Array.isArray(egos.entities) ? egos.entities : [],
    relationships,
    evidences: Array.isArray(egos.evidences) ? egos.evidences : [],
    findings,
    resolutions: Array.isArray(egos.resolutions) ? egos.resolutions : [],
  };
  const allReviewFindings = findings.filter((item) => item.status === 'REVIEW' || item.status === 'INCONCLUSIVE');
  const statusFor = (finding: EgosFinding) => localStatuses[finding.id] || finding.reviewStatus || 'pending';
  const reviewFindings = allReviewFindings.filter((item) => statusFor(item) === 'pending');
  const decidedFindings = allReviewFindings.filter((item) => statusFor(item) !== 'pending');
  const okFindings = findings.filter((item) => item.status === 'OK');
  const consulted = coverage.filter((item) => (
    item.status === 'CONSULTED' || item.status === 'PARTIAL'
  )).length;
  const partialOrUnavailable = coverage.filter((item) => (
    item.status === 'PARTIAL' || item.status === 'UNAVAILABLE' || item.status === 'NOT_CONSULTED'
  )).length;
  const reviewFinding = async (finding: EgosFinding, newStatus: 'confirmed' | 'discarded') => {
    const cleanJustification = justification.trim();
    if (cleanJustification.length < 5) {
      setReviewError('Escreva uma justificativa curta para registrar a decisão.');
      return;
    }
    setSavingId(finding.id);
    setReviewError(null);
    try {
      await EgosReviewService.reviewFinding(diligenceId, finding.id, statusFor(finding), newStatus, cleanJustification);
      setLocalStatuses((current) => ({ ...current, [finding.id]: newStatus }));
      setReviewingId(null);
      setJustification('');
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Não foi possível registrar a revisão.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="egos-shell" aria-labelledby="egos-title">
      <header className="egos-header">
        <div className="egos-heading">
          <div className="egos-mark" aria-hidden="true"><Icons.Database size={22} /></div>
          <div>
            <span className="egos-kicker">EGOS · inteligência com proveniência</span>
            <h2 id="egos-title">Mapa verificável da diligência</h2>
            <p>Entidades e vínculos só aparecem quando existe uma fonte associada. Coincidências continuam sinalizadas como hipóteses.</p>
          </div>
        </div>
        <div className="egos-trace" aria-label="Fluxo da informação">
          <span>Entidade</span><i>→</i><span>Relação</span><i>→</i><span>Evidência</span><i>→</i><span>Decisão</span>
        </div>
      </header>

      <div className="egos-metrics" aria-label="Resumo do EGOS">
        <div><strong>{consulted}</strong><span>fontes consultadas</span></div>
        <div><strong>{metrics.entities || normalizedEgos.entities.length}</strong><span>entidades estruturadas</span></div>
        <div><strong>{metrics.relationships || relationships.length}</strong><span>relações comprováveis</span></div>
        <div className={reviewFindings.length > 0 ? 'egos-metric-attention' : ''}>
          <strong>{reviewFindings.length}</strong><span>{reviewFindings.length === 1 ? 'item para revisar' : 'itens para revisar'}</span>
        </div>
        <div><strong>{partialOrUnavailable}</strong><span>lacunas de cobertura</span></div>
      </div>

      {insights.length > 0 ? (
        <div className="egos-insight-strip">
          <Icons.Info size={17} />
          <div>{insights.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
        </div>
      ) : null}

      <div className="egos-content-grid">
        <div className="egos-column">
          <div className="egos-section-title">
            <div><span>Cobertura real</span><h3>O que conseguimos pesquisar</h3></div>
            <span className="egos-count">{coverage.length} eixos</span>
          </div>
          <div className="egos-coverage-list">
            {coverage.map((item) => (
              <details className={`egos-coverage-item egos-coverage-${item.status.toLowerCase().replace('_', '-')}`} key={`${item.axis}-${item.provider}`}>
                <summary>
                  <span className="egos-status-symbol" aria-hidden="true">
                    {item.status === 'CONSULTED' ? '✓' : item.status === 'PARTIAL' ? '?' : '—'}
                  </span>
                  <span className="egos-coverage-name">{AXIS_LABELS[item.axis] || item.axis}</span>
                  <span className="egos-coverage-status">{STATUS_LABELS[item.status]}</span>
                </summary>
                <div className="egos-coverage-detail">
                  <p>{item.message}</p>
                  <span>Provider: {item.provider} · {item.resultCount} {item.resultCount === 1 ? 'resultado' : 'resultados'}</span>
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className="egos-column">
          <div className="egos-section-title">
            <div><span>Decisão humana</span><h3>O que exige sua atenção</h3></div>
            <span className="egos-count">{reviewFindings.length} {reviewFindings.length === 1 ? 'item' : 'itens'}</span>
          </div>
          {reviewFindings.length > 0 ? (
            <div className="egos-findings-list">
              {reviewFindings.slice(0, 5).map((finding) => {
                const evidence = findEvidence(normalizedEgos, finding);
                const matchContext = matchContextForFinding(normalizedEgos, finding);
                return (
                  <article className={`egos-finding egos-finding-${finding.status.toLowerCase()}`} key={finding.id}>
                    <div className="egos-finding-topline">
                      <span>{FINDING_LABELS[finding.status]}</span>
                      {finding.confidence != null ? <strong>Índice {finding.confidence}/100</strong> : null}
                    </div>
                    <h4>{finding.title}</h4>
                    <p>{finding.explanation}</p>
                    {matchContext ? <IdentityMatchDetail context={matchContext} /> : null}
                    {evidence ? (
                      <details className="egos-evidence-inline">
                        <summary><Icons.FileText size={14} /> Ver evidência</summary>
                        <div>
                          <strong>{evidence.sourceName}</strong>
                          {evidence.excerpt ? <p>{evidence.excerpt}</p> : null}
                          <span>Consulta: {evidence.query || evidence.identifier || 'não informada'}</span>
                          {evidence.sourceUrl ? (
                            <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte <Icons.ExternalLink size={12} /></a>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                    <div className="egos-review-actions">
                      <button type="button" onClick={() => { setReviewingId(reviewingId === finding.id ? null : finding.id); setJustification(''); setReviewError(null); }}>
                        {reviewingId === finding.id ? 'Cancelar revisão' : 'Revisar hipótese'}
                      </button>
                    </div>
                    {reviewingId === finding.id ? (
                      <div className="egos-review-form">
                        <label htmlFor={`review-${finding.id}`}>Justificativa da decisão</label>
                        <textarea id={`review-${finding.id}`} value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Ex.: CPF mascarado e órgão conferidos na documentação..." rows={3} />
                        {reviewError ? <p role="alert">{reviewError}</p> : null}
                        <div>
                          <button type="button" disabled={savingId === finding.id} className="egos-review-confirm" onClick={() => void reviewFinding(finding, 'confirmed')}>Confirmar correspondência</button>
                          <button type="button" disabled={savingId === finding.id} className="egos-review-discard" onClick={() => void reviewFinding(finding, 'discarded')}>Descartar hipótese</button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="egos-clean-state">
              <Icons.CheckCircle size={21} />
              <div><strong>Nenhum item prioritário nesta execução</strong><p>{okFindings.length} verificação(ões) foram classificadas como OK dentro da cobertura disponível.</p></div>
            </div>
          )}
          {decidedFindings.length > 0 ? (
            <details className="egos-reviewed-items">
              <summary>{decidedFindings.length} decisão(ões) já registrada(s)</summary>
              <div>{decidedFindings.map((finding) => <p key={finding.id}><strong>{statusFor(finding) === 'confirmed' ? 'Confirmado' : 'Descartado'}</strong> — {finding.title}</p>)}</div>
            </details>
          ) : null}
        </div>
      </div>

      {showGraph ? <EgosGraphExplorer egos={normalizedEgos} /> : null}

      <details className="egos-relations-preview">
        <summary>
          <span><Icons.Users size={17} /> Ver relações estruturadas</span>
          <span>{relationships.length} vínculos</span>
        </summary>
        <div className="egos-relation-list">
          {relationships.slice(0, 12).map((relationship) => (
            <div key={relationship.id}>
              <strong>{relationship.sourceName || 'Entidade'}</strong>
              <span>{relationship.label}</span>
              <strong>{relationship.targetName || 'Entidade relacionada'}</strong>
              <small>{relationship.confidence}% · {relationship.status}</small>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
};
