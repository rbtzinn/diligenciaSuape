// ==========================================================
// DILIGÊNCIA 360 — Painel EGOS (inteligência com proveniência)
// ==========================================================
// Entidade e vínculo só aparecem quando há fonte associada, e
// coincidência continua marcada como hipótese. Essa é a regra que o
// painel existe para tornar visível, e ela fica preservada.
//
// O que mudou é a pele. O painel tinha em dashboard.css a sua
// própria família de cor — um verde-petróleo (#0d6b78, #eaf6f7,
// #075c69) que não aparece em nenhuma outra tela — e seis corpos de
// texto fora da escala (0.64rem, 0.65rem, 0.67rem, 0.68rem,
// 0.72rem). Num painel que abre dentro de uma gaveta do dossiê, isso
// parecia outro produto. Agora ele usa as seções, os fatos e os
// avisos do projeto.
// ==========================================================

import React, { useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import type { EgosCoverageItem, EgosEntity, EgosFinding, EgosResolution, EgosSnapshot } from '../types';
import { EgosGraphExplorer } from './EgosGraphExplorer';
import { EgosReviewService } from '../services/egos-review.service';
import { Section } from '../../../components/ui/Section';
import { Chip, ChipTone } from '../../../components/ui/Chip';
import { Note } from '../../../components/ui/Note';
import { Button } from '../../../components/ui/Button';
import { TextArea } from '../../../components/ui/Field';
import { Fact, FactGrid } from '../../../components/ui/Facts';
import { EmptyState } from '../../../components/ui/EmptyState';
import { cn } from '../../../lib/cn';

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
  EXTERNAL_CONTROL: 'Controle externo — TCE-PE',
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

/** Tom por situação de cobertura. Lacuna nunca é verde. */
const STATUS_TONE: Record<EgosCoverageItem['status'], ChipTone> = {
  CONSULTED: 'ok',
  PARTIAL: 'warn',
  NOT_CONSULTED: 'warn',
  UNAVAILABLE: 'high',
  NOT_APPLICABLE: 'muted',
};

const FINDING_LABELS: Record<EgosFinding['status'], string> = {
  OK: 'OK',
  REVIEW: 'Revisão',
  INCONCLUSIVE: 'Inconclusivo',
  UNAVAILABLE: 'Indisponível',
};

const FINDING_TONE: Record<EgosFinding['status'], ChipTone> = {
  OK: 'ok',
  REVIEW: 'warn',
  INCONCLUSIVE: 'neutral',
  UNAVAILABLE: 'high',
};

function findEvidence(egos: EgosSnapshot, finding: EgosFinding) {
  return (egos.evidences || []).find(
    (item) =>
      (finding.relationshipId && item.relationshipId === finding.relationshipId)
      || (finding.entityId && item.entityId === finding.entityId),
  );
}

function textProperty(entity: EgosEntity | undefined, key: string) {
  const value = entity?.properties?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function maskedCpf(entity: EgosEntity | undefined) {
  const property = textProperty(entity, 'maskedCpf');
  if (property) return property;
  const identifier = entity?.identifiers?.find(
    (item) => (item.identifierType || item.type || '').toUpperCase() === 'MASKED_CPF',
  );
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
  const resolution = resolutions.find(
    (item) =>
      (item.sourceEntityId === relationship.sourceEntityId && item.candidateEntityId === relationship.targetEntityId)
      || (item.sourceEntityId === relationship.targetEntityId && item.candidateEntityId === relationship.sourceEntityId),
  );
  if (!resolution) return null;

  const source = entities.find((item) => item.id === resolution.sourceEntityId);
  const candidate = entities.find((item) => item.id === resolution.candidateEntityId);
  const officeRelationship = relationships.find(
    (item) =>
      item.type === 'HOLDS_PUBLIC_OFFICE'
      && (item.sourceEntityId === candidate?.id || item.targetEntityId === candidate?.id),
  );
  const officeId = officeRelationship
    ? officeRelationship.sourceEntityId === candidate?.id
      ? officeRelationship.targetEntityId
      : officeRelationship.sourceEntityId
    : null;
  const office = officeId ? entities.find((item) => item.id === officeId) : undefined;
  const isPep =
    candidate?.role === 'pep_candidate' || textProperty(candidate, 'source') === 'CGU_PEP' || Boolean(office);

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
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-surface-subtle p-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-semibold uppercase tracking-wide text-ink-3">
            {isPep ? 'Candidato exato retornado pela CGU' : 'Registro funcional comparado'}
          </span>
          <strong className="block text-sm font-bold leading-snug text-ink">
            {candidate?.name || resolution.candidateName || 'Candidato sem nome informado'}
          </strong>
        </span>

        <Chip tone={resolution.score >= 90 ? 'high' : 'warn'} size="sm" className="num shrink-0">
          {resolution.score}/100
        </Chip>
      </div>

      {/* Par de identidade: o nome pesquisado e o encontrado, lado a
          lado, porque é a comparação que sustenta a hipótese. */}
      <div className="grid min-w-0 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <span className="min-w-0 rounded-md border border-line-soft bg-surface px-2.5 py-1.5">
          <span className="block text-2xs text-ink-3">Nome pesquisado</span>
          <strong className="block text-xs font-semibold text-ink [overflow-wrap:anywhere]">
            {source?.name || resolution.sourceName || 'Não informado'}
          </strong>
        </span>

        <Icons.ArrowRight size={14} aria-hidden="true" className="mx-auto rotate-90 text-ink-3 sm:rotate-0" />

        <span className="min-w-0 rounded-md border border-line-soft bg-surface px-2.5 py-1.5">
          <span className="block text-2xs text-ink-3">Registro encontrado</span>
          <strong className="block text-xs font-semibold text-ink [overflow-wrap:anywhere]">
            {candidate?.name || resolution.candidateName || 'Não informado'}
          </strong>
        </span>
      </div>

      <FactGrid columns={3}>
        {maskedCpf(candidate) ? <Fact label="CPF mascarado" value={maskedCpf(candidate)} mono /> : null}
        {role ? <Fact label="Função pública" value={role} /> : null}
        {organization ? <Fact label="Órgão" value={organization} /> : null}
        {startsAt || endsAt ? (
          <Fact label="Período" value={`${startsAt || 'não informado'} a ${endsAt || 'não informado'}`} />
        ) : null}
        {employmentType ? <Fact label="Tipo de vínculo" value={employmentType} /> : null}
        {referencePeriod ? <Fact label="Competência" value={referencePeriod} /> : null}
        {sourceSheet ? <Fact label="Origem interna" value={sourceSheet} /> : null}
      </FactGrid>

      {signals.length > 0 ? (
        <div aria-label="Campos usados na comparação" className="flex min-w-0 flex-col gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">
            Como o índice foi calculado
          </span>
          {signals.map((signal) => (
            <div key={`${signal.code}-${signal.detail}`} className="flex min-w-0 items-start gap-2">
              <span aria-hidden="true" className={cn('mt-px shrink-0', signal.matched ? 'text-ok' : 'text-ink-muted')}>
                {signal.matched ? <Icons.CheckCircle size={14} /> : <Icons.Info size={14} />}
              </span>
              <p className="min-w-0">
                <strong className={cn('text-xs', signal.matched ? 'font-semibold text-ink' : 'text-ink-3')}>
                  {signal.label}
                </strong>
                <span className="block text-2xs leading-snug text-ink-3">
                  {signal.detail}
                  {signal.weight > 0 ? ` · +${signal.weight} pontos` : ''}
                </span>
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <Note tone="warn" icon={<Icons.AlertTriangle size={14} aria-hidden="true" />}>
        O índice mede compatibilidade entre campos; não é probabilidade e não confirma que as duas pessoas são a mesma.
      </Note>
    </div>
  );
};

export const EgosIntelligencePanel: React.FC<EgosIntelligencePanelProps> = ({
  egos,
  diligenceId,
  showGraph = true,
}) => {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});

  if (!egos) {
    return (
      <Section mark={<Icons.Database size={12} />} title="Mapa verificável da diligência">
        <EmptyState
          icon={<Icons.Database size={20} />}
          title="EGOS não executado nesta diligência"
          description="Este dossiê foi criado antes da camada de entidades e evidências. Atualize a consulta para gerar a rede rastreável."
        />
      </Section>
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
  const consulted = coverage.filter((item) => item.status === 'CONSULTED' || item.status === 'PARTIAL').length;
  const partialOrUnavailable = coverage.filter(
    (item) => item.status === 'PARTIAL' || item.status === 'UNAVAILABLE' || item.status === 'NOT_CONSULTED',
  ).length;

  const reviewFinding = async (finding: EgosFinding, newStatus: 'confirmed' | 'discarded') => {
    const cleanJustification = justification.trim();
    if (cleanJustification.length < 5) {
      setReviewError('Escreva uma justificativa curta para registrar a decisão.');
      return;
    }
    setSavingId(finding.id);
    setReviewError(null);
    try {
      await EgosReviewService.reviewFinding(
        diligenceId,
        finding.id,
        statusFor(finding),
        newStatus,
        cleanJustification,
      );
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
    <div className="flex min-w-0 flex-col gap-3">
      {/* ---- Cabeçalho e resumo ---- */}
      <Section
        mark={<Icons.Database size={12} />}
        title="Mapa verificável da diligência"
        subtitle="EGOS · inteligência com proveniência"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm leading-relaxed text-ink-2">
            Entidades e vínculos só aparecem quando existe uma fonte associada. Coincidências continuam sinalizadas
            como hipóteses.
          </p>

          {/* Fluxo da informação: entidade → relação → evidência → decisão */}
          <div
            aria-label="Fluxo da informação"
            className="scroll-fita flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface-subtle p-2"
          >
            {['Entidade', 'Relação', 'Evidência', 'Decisão'].map((step, index) => (
              <React.Fragment key={step}>
                {index > 0 ? (
                  <Icons.ArrowRight size={12} aria-hidden="true" className="shrink-0 text-ink-muted" />
                ) : null}
                <span className="shrink-0 rounded-sm bg-brand-soft px-2 py-1 text-2xs font-bold text-brand">
                  {step}
                </span>
              </React.Fragment>
            ))}
          </div>

          <FactGrid columns={3} aria-label="Resumo do EGOS">
            <Fact label="Fontes consultadas" value={consulted} tone="ok" />
            <Fact label="Entidades estruturadas" value={metrics.entities || normalizedEgos.entities.length} />
            <Fact label="Relações comprováveis" value={metrics.relationships || relationships.length} />
            <Fact
              label={reviewFindings.length === 1 ? 'Item para revisar' : 'Itens para revisar'}
              value={reviewFindings.length}
              tone={reviewFindings.length > 0 ? 'warn' : 'muted'}
            />
            <Fact
              label="Lacunas de cobertura"
              value={partialOrUnavailable}
              tone={partialOrUnavailable > 0 ? 'warn' : 'muted'}
            />
          </FactGrid>

          {insights.length > 0 ? (
            <Note tone="info" icon={<Icons.Info size={16} aria-hidden="true" />}>
              <ul className="flex flex-col gap-1">
                {insights.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Note>
          ) : null}
        </div>
      </Section>

      {/* ---- Cobertura ---- */}
      <Section
        title="O que conseguimos pesquisar"
        subtitle="Cobertura real"
        trailing={
          <Chip tone="neutral" size="sm">
            {coverage.length} eixos
          </Chip>
        }
        flush
      >
        <ul className="divide-y divide-line-soft">
          {coverage.map((item) => (
            <li key={`${item.axis}-${item.provider}`}>
              <details className="group">
                <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-4 py-2.5 transition-colors hover:bg-surface-hover">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {AXIS_LABELS[item.axis] || item.axis}
                  </span>
                  <Chip tone={STATUS_TONE[item.status]} size="sm" dot>
                    {STATUS_LABELS[item.status]}
                  </Chip>
                  <Icons.ChevronDown
                    size={14}
                    aria-hidden="true"
                    className="shrink-0 text-ink-3 transition-transform group-open:rotate-180"
                  />
                </summary>

                <div className="border-t border-line-soft bg-surface-subtle px-4 py-2.5">
                  <p className="text-xs leading-relaxed text-ink-2">{item.message}</p>
                  <span className="mt-1 block text-2xs text-ink-3">
                    Provider: {item.provider} · {item.resultCount}{' '}
                    {item.resultCount === 1 ? 'resultado' : 'resultados'}
                  </span>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---- Decisão humana ---- */}
      <Section
        title="O que exige sua atenção"
        subtitle="Decisão humana"
        trailing={
          <Chip tone={reviewFindings.length > 0 ? 'warn' : 'ok'} size="sm">
            {reviewFindings.length} {reviewFindings.length === 1 ? 'item' : 'itens'}
          </Chip>
        }
      >
        <div className="flex min-w-0 flex-col gap-3">
          {reviewFindings.length > 0 ? (
            reviewFindings.slice(0, 5).map((finding) => {
              const evidence = findEvidence(normalizedEgos, finding);
              const matchContext = matchContextForFinding(normalizedEgos, finding);
              const reviewing = reviewingId === finding.id;

              return (
                <article
                  key={finding.id}
                  className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-surface p-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Chip tone={FINDING_TONE[finding.status]} size="sm">
                      {FINDING_LABELS[finding.status]}
                    </Chip>
                    {finding.confidence != null ? (
                      <span className="num text-2xs font-semibold text-ink-3">Índice {finding.confidence}/100</span>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold leading-snug text-ink">{finding.title}</h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{finding.explanation}</p>
                  </div>

                  {matchContext ? <IdentityMatchDetail context={matchContext} /> : null}

                  {evidence ? (
                    <details className="overflow-hidden rounded-md border border-line bg-surface-subtle">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-hover">
                        <Icons.FileText size={14} aria-hidden="true" />
                        Ver evidência
                      </summary>
                      <div className="flex min-w-0 flex-col gap-1 border-t border-line-soft px-3 py-2.5">
                        <strong className="text-xs font-bold text-ink">{evidence.sourceName}</strong>
                        {evidence.excerpt ? (
                          <p className="text-xs leading-relaxed text-ink-2">{evidence.excerpt}</p>
                        ) : null}
                        <span className="text-2xs text-ink-3">
                          Consulta: {evidence.query || evidence.identifier || 'não informada'}
                        </span>
                        {evidence.sourceUrl ? (
                          <a
                            href={evidence.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand hover:underline"
                          >
                            Abrir fonte
                            <Icons.ExternalLink size={12} aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </details>
                  ) : null}

                  <Button
                    variant={reviewing ? 'ghost' : 'secondary'}
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      setReviewingId(reviewing ? null : finding.id);
                      setJustification('');
                      setReviewError(null);
                    }}
                  >
                    {reviewing ? 'Cancelar revisão' : 'Revisar hipótese'}
                  </Button>

                  {reviewing ? (
                    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-brand-line bg-brand-soft p-3">
                      <TextArea
                        id={`review-${finding.id}`}
                        label="Justificativa da decisão"
                        value={justification}
                        onChange={(event) => setJustification(event.target.value)}
                        placeholder="Ex.: CPF mascarado e órgão conferidos na documentação…"
                        rows={3}
                        error={reviewError || undefined}
                      />

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={savingId === finding.id}
                          onClick={() => void reviewFinding(finding, 'confirmed')}
                          icon={<Icons.Check size={14} aria-hidden="true" />}
                        >
                          Confirmar correspondência
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={savingId === finding.id}
                          onClick={() => void reviewFinding(finding, 'discarded')}
                          icon={<Icons.X size={14} aria-hidden="true" />}
                        >
                          Descartar hipótese
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <Note tone="ok" title="Nenhum item prioritário nesta execução" icon={<Icons.CheckCircle size={16} aria-hidden="true" />}>
              {okFindings.length} verificação(ões) foram classificadas como OK dentro da cobertura disponível.
            </Note>
          )}

          {decidedFindings.length > 0 ? (
            <details className="overflow-hidden rounded-md border border-line bg-surface-subtle">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-hover">
                {decidedFindings.length} decisão(ões) já registrada(s)
              </summary>
              <ul className="flex flex-col gap-1 border-t border-line-soft px-3 py-2.5">
                {decidedFindings.map((finding) => (
                  <li key={finding.id} className="text-xs text-ink-2">
                    <strong
                      className={cn(
                        'font-bold',
                        statusFor(finding) === 'confirmed' ? 'text-high-text' : 'text-ink-3',
                      )}
                    >
                      {statusFor(finding) === 'confirmed' ? 'Confirmado' : 'Descartado'}
                    </strong>{' '}
                    — {finding.title}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </Section>

      {showGraph ? <EgosGraphExplorer egos={normalizedEgos} /> : null}

      {/* ---- Relações estruturadas ---- */}
      <Section
        collapsible
        defaultOpen={false}
        mark={<Icons.Users size={12} />}
        title="Relações estruturadas"
        trailing={
          <Chip tone="neutral" size="sm">
            {relationships.length} vínculos
          </Chip>
        }
        flush
      >
        <ul className="divide-y divide-line-soft">
          {relationships.slice(0, 12).map((relationship) => (
            <li key={relationship.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-2.5">
              <strong className="text-sm font-semibold text-ink">{relationship.sourceName || 'Entidade'}</strong>
              <span className="text-2xs font-medium uppercase tracking-wide text-brand">{relationship.label}</span>
              <strong className="text-sm font-semibold text-ink">
                {relationship.targetName || 'Entidade relacionada'}
              </strong>
              <span className="num ml-auto shrink-0 text-2xs text-ink-3">
                {relationship.confidence}% · {relationship.status}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
};
