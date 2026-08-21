import React, { useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import { EgosCoverageItem, EgosFinding, EgosSnapshot } from '../types';
import { EgosGraphExplorer } from './EgosGraphExplorer';
import { EgosReviewService } from '../services/egos-review.service';

interface EgosIntelligencePanelProps {
  egos?: EgosSnapshot;
  diligenceId: string;
}

const AXIS_LABELS: Record<string, string> = {
  CADASTRO: 'Cadastro empresarial',
  QSA: 'Quadro societário',
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
  return egos.evidences.find((item) => (
    (finding.relationshipId && item.relationshipId === finding.relationshipId)
    || (finding.entityId && item.entityId === finding.entityId)
  ));
}

export const EgosIntelligencePanel: React.FC<EgosIntelligencePanelProps> = ({ egos, diligenceId }) => {
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

  const allReviewFindings = egos.findings.filter((item) => item.status === 'REVIEW' || item.status === 'INCONCLUSIVE');
  const statusFor = (finding: EgosFinding) => localStatuses[finding.id] || finding.reviewStatus || 'pending';
  const reviewFindings = allReviewFindings.filter((item) => statusFor(item) === 'pending');
  const decidedFindings = allReviewFindings.filter((item) => statusFor(item) !== 'pending');
  const okFindings = egos.findings.filter((item) => item.status === 'OK');
  const consulted = egos.coverage.filter((item) => item.status === 'CONSULTED').length;
  const partialOrUnavailable = egos.coverage.filter((item) => (
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
        <div><strong>{egos.metrics.entities}</strong><span>entidades estruturadas</span></div>
        <div><strong>{egos.metrics.relationships}</strong><span>relações comprováveis</span></div>
        <div className={reviewFindings.length > 0 ? 'egos-metric-attention' : ''}>
          <strong>{reviewFindings.length}</strong><span>{reviewFindings.length === 1 ? 'item para revisar' : 'itens para revisar'}</span>
        </div>
        <div><strong>{partialOrUnavailable}</strong><span>lacunas de cobertura</span></div>
      </div>

      {egos.insights.length > 0 ? (
        <div className="egos-insight-strip">
          <Icons.Info size={17} />
          <div>{egos.insights.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
        </div>
      ) : null}

      <div className="egos-content-grid">
        <div className="egos-column">
          <div className="egos-section-title">
            <div><span>Cobertura real</span><h3>O que conseguimos pesquisar</h3></div>
            <span className="egos-count">{egos.coverage.length} eixos</span>
          </div>
          <div className="egos-coverage-list">
            {egos.coverage.map((item) => (
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
                const evidence = findEvidence(egos, finding);
                return (
                  <article className={`egos-finding egos-finding-${finding.status.toLowerCase()}`} key={finding.id}>
                    <div className="egos-finding-topline">
                      <span>{FINDING_LABELS[finding.status]}</span>
                      {finding.confidence != null ? <strong>{finding.confidence}% confiança</strong> : null}
                    </div>
                    <h4>{finding.title}</h4>
                    <p>{finding.explanation}</p>
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

      <EgosGraphExplorer egos={egos} />

      <details className="egos-relations-preview">
        <summary>
          <span><Icons.Users size={17} /> Ver relações estruturadas</span>
          <span>{egos.relationships.length} vínculos</span>
        </summary>
        <div className="egos-relation-list">
          {egos.relationships.slice(0, 12).map((relationship) => (
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
