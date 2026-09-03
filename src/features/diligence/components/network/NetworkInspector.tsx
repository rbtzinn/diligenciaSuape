// ==========================================================
// DILIGÊNCIA 360 — Painel de inspeção do mapa
// ==========================================================
// Era o arquivo mais fora do sistema de todo o projeto: ~640 linhas
// em que praticamente cada nó tinha `style` em linha, com dezenas de
// cores literais do tema escuro (#0a2845, #9fb5ca, #f7d995…) e
// corpos de texto de 8, 9, 9.5, 10 e 11px — nenhum deles na escala
// tipográfica. Havia até dois manipuladores de mouse para simular
// `:hover` no botão de fechar.
//
// Depois que o grafo passou a ser desenhado sobre tela clara, esse
// painel ficou escuro no meio de uma tela clara. Agora ele usa as
// mesmas seções, selos e avisos do dossiê, e o texto está na escala.
// ==========================================================

import React from 'react';
import { Icons } from '../../../../components/ui/Icons';
import type {
  EgosEntity,
  EgosEvidenceItem,
  EgosFinding,
  EgosRelationship,
} from '../../types';
import type {
  DirectConnectionContext,
  KinshipContext,
  PersonOccurrenceContext,
  ResolutionContext,
  RouteSummary,
  SuapeLinkContext,
} from './types';
import { extractEntityCnpj, formatCnpj, isDrillableCompany } from '../../utils/entityCnpj';
import {
  confidencePercent,
  formatGeneratedAt,
  humanizeProperty,
  humanizePropertyValue,
  isConfirmed,
  safeExternalUrl,
  TYPE_LABELS,
} from './networkUtils';
import { Section } from '../../../../components/ui/Section';
import { Button } from '../../../../components/ui/Button';
import { Chip } from '../../../../components/ui/Chip';
import { Note } from '../../../../components/ui/Note';
import { DataTable, TableRow } from '../../../../components/ui/DataTable';

interface NetworkInspectorProps {
  selectedEntity?: EgosEntity;
  selectedRelationship?: EgosRelationship;
  sourceEntity?: EgosEntity;
  targetEntity?: EgosEntity;
  route: RouteSummary | null;
  onTraceRoute: () => void;
  onClearSelection: () => void;
  onSelectNode: (id: string) => void;
  isExportingPdf: boolean;
  onExportEntityPdf: () => void;
  currentCnpj?: string;
  onDrillCompany?: (cnpj: string, name: string) => void;
  exportError: string;
  selectedConnections: DirectConnectionContext[];
  selectedEvidence: EgosEvidenceItem[];
  selectedFindings: EgosFinding[];
  selectedPepMatches: ResolutionContext[];
  selectedSuapeLinks: SuapeLinkContext[];
  selectedKinshipLinks: KinshipContext[];
  selectedPersonOccurrences: PersonOccurrenceContext[];
}

/** Cabeçalho do painel: título da seleção e o botão de fechar. */
const InspectorHeader: React.FC<{
  eyebrow: string;
  title: string;
  meta?: React.ReactNode;
  onClose: () => void;
}> = ({ eyebrow, title, meta, onClose }) => (
  <header className="flex min-w-0 items-start gap-2 border-b border-line-soft pb-3">
    <div className="min-w-0 flex-1">
      <span className="block text-2xs font-bold uppercase tracking-wider text-ink-3">{eyebrow}</span>
      <h3 className="mt-0.5 text-lg font-bold leading-tight text-ink [overflow-wrap:anywhere]">{title}</h3>
      {meta ? <div className="mt-1.5 flex flex-wrap gap-1.5">{meta}</div> : null}
    </div>

    <Button
      variant="ghost"
      size="sm"
      iconOnly
      onClick={onClose}
      aria-label="Fechar painel"
      title="Fechar painel"
      icon={<Icons.X size={16} aria-hidden="true" />}
    />
  </header>
);

/** Cartão de pessoa ou entidade ligada, clicável para navegar no mapa. */
const LinkedCard: React.FC<{
  title: string;
  caption?: string;
  onClick?: () => void;
}> = ({ title, caption, onClick }) => {
  const content = (
    <>
      <span className="min-w-0 flex-1">
        {caption ? <span className="block text-2xs font-medium uppercase tracking-wide text-ink-3">{caption}</span> : null}
        <strong className="block text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{title}</strong>
      </span>
      {onClick ? <Icons.ArrowRight size={14} aria-hidden="true" className="shrink-0 text-ink-3" /> : null}
    </>
  );

  if (!onClick) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-line-soft bg-surface-subtle px-3 py-2">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-2 rounded-md border border-line-soft bg-surface-subtle px-3 py-2 text-left transition-colors hover:border-brand-line hover:bg-brand-soft"
    >
      {content}
    </button>
  );
};

export const NetworkInspector: React.FC<NetworkInspectorProps> = ({
  selectedEntity,
  selectedRelationship,
  sourceEntity,
  targetEntity,
  route,
  onTraceRoute,
  onClearSelection,
  onSelectNode,
  isExportingPdf,
  onExportEntityPdf,
  exportError,
  selectedConnections,
  selectedEvidence,
  selectedFindings,
  selectedPepMatches,
  selectedSuapeLinks,
  selectedKinshipLinks,
  selectedPersonOccurrences,
  currentCnpj,
  onDrillCompany,
}) => {
  if (!selectedEntity && !selectedRelationship) return null;

  const drillCnpj = isDrillableCompany(selectedEntity, currentCnpj)
    ? extractEntityCnpj(selectedEntity)
    : null;

  const propertyRows: TableRow[] = selectedEntity?.properties
    ? Object.entries(selectedEntity.properties)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => ({
          id: key,
          cells: { campo: humanizeProperty(key), valor: humanizePropertyValue(value) },
        }))
    : [];

  return (
    <aside aria-label="Detalhes da seleção" className="flex min-w-0 flex-col gap-3 p-3">
      {selectedEntity ? (
        <>
          <InspectorHeader
            eyebrow="Entidade selecionada"
            title={selectedEntity.name}
            onClose={onClearSelection}
            meta={
              <>
                <Chip tone="brand" size="sm">
                  {TYPE_LABELS[selectedEntity.type] || selectedEntity.type}
                </Chip>
                <Chip tone="neutral" size="sm">
                  Grau {selectedEntity.depth}
                </Chip>
                {confidencePercent(selectedEntity.confidence) !== null ? (
                  <Chip tone="muted" size="sm">
                    {confidencePercent(selectedEntity.confidence)}% de confiança
                  </Chip>
                ) : null}
              </>
            }
          />

          {selectedEntity.role !== 'ROOT' ? (
            <Button
              variant="secondary"
              block
              onClick={onTraceRoute}
              icon={<Icons.Compass size={16} aria-hidden="true" />}
              rightIcon={<Icons.ArrowRight size={14} aria-hidden="true" />}
            >
              Traçar caminho até aqui
            </Button>
          ) : null}

          {/* Atalho para investigar uma empresa vinculada sem redigitar o CNPJ. */}
          {drillCnpj && onDrillCompany ? (
            <Button
              variant="primary"
              block
              onClick={() => onDrillCompany(drillCnpj, selectedEntity.name)}
              icon={<Icons.Search size={16} aria-hidden="true" />}
              rightIcon={<Icons.ArrowRight size={14} aria-hidden="true" />}
              className="h-auto flex-col items-start gap-0.5 py-2"
            >
              <span className="block">Fazer a diligência desta empresa</span>
              <span className="block font-mono text-2xs font-normal opacity-80" translate="no">
                {formatCnpj(drillCnpj)}
              </span>
            </Button>
          ) : null}

          {route && route.targetId === selectedEntity.id ? (
            <div className="flex flex-wrap gap-1.5">
              <Chip tone="info" size="sm">
                {route.hops} saltos
              </Chip>
              <Chip tone={route.confirmed ? 'ok' : 'warn'} size="sm">
                {route.confirmed ? '100%' : '50%'} de certeza
              </Chip>
              <Chip tone="neutral" size="sm">
                {route.evidenceCount} provas
              </Chip>
            </div>
          ) : null}

          {/* ---- Relatório da entidade ---- */}
          <Section
            mark={<Icons.FileText size={12} />}
            title="Relatório desta entidade"
            subtitle="Vínculos, achados, notícias e fontes com links clicáveis."
            footer={
              <Button
                variant="secondary"
                size="sm"
                onClick={onExportEntityPdf}
                isLoading={isExportingPdf}
                loadingLabel="Gerando…"
                icon={<Icons.Download size={14} aria-hidden="true" />}
              >
                Baixar PDF
              </Button>
            }
          >
            {exportError ? (
              <Note tone="high" role="alert" icon={<Icons.AlertCircle size={15} aria-hidden="true" />}>
                {exportError}
              </Note>
            ) : (
              <p className="text-sm leading-relaxed text-ink-2">
                O relatório reúne o que esta entidade tem no mapa, com a fonte de cada item.
              </p>
            )}
          </Section>

          {/* ---- Conexões diretas ---- */}
          {selectedConnections.length > 0 ? (
            <Section
              title="Conexões diretas"
              subtitle="Vizinhança desta entidade"
              trailing={
                <Chip tone="neutral" size="sm">
                  {selectedConnections.length}
                </Chip>
              }
              flush
            >
              <ul className="max-h-[320px] divide-y divide-line-soft overflow-y-auto">
                {selectedConnections.map(({ relationship, entity, direction }) => (
                  <li key={relationship.id}>
                    <button
                      type="button"
                      onClick={() => onSelectNode(entity.id)}
                      className="flex w-full min-w-0 items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${isConfirmed(relationship.status) ? 'bg-ok' : 'bg-warn'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-2xs font-bold uppercase tracking-wide text-brand">
                          {relationship.label} ({direction === 'outgoing' ? 'saída' : 'entrada'})
                        </span>
                        <strong className="block text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                          {entity.name}
                        </strong>
                      </span>
                      <Icons.ArrowRight size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* ---- PEP ---- */}
          {selectedPepMatches.length > 0 ? (
            <Section title="Cargo público / PEP" mark="P">
              <div className="flex flex-col gap-2">
                {selectedPepMatches.map(({ resolution, counterpart }) => (
                  <Note key={resolution.id} tone="warn" title={counterpart?.name || 'Vínculo PEP'}>
                    {resolution.signals?.find((signal) => signal.matched)?.detail
                      || 'Apontamento em base oficial de PEP.'}
                  </Note>
                ))}
              </div>
            </Section>
          ) : null}

          {/* ---- Vínculo interno ---- */}
          {selectedSuapeLinks.length > 0 ? (
            <Section title="Vínculo interno SUAPE" mark="S">
              <div className="flex flex-col gap-2">
                {selectedSuapeLinks.map(({ internalPerson, resolution }) => (
                  <Note key={internalPerson.id} tone="info" title={internalPerson.name}>
                    {resolution?.signals?.find((signal) => signal.matched)?.detail
                      || 'Possível coincidência com registros internos.'}
                  </Note>
                ))}
              </div>
            </Section>
          ) : null}

          {/* ---- Parentesco ---- */}
          {selectedKinshipLinks.length > 0 ? (
            <Section title="Parentesco e relações familiares" mark="F">
              <div className="flex flex-col gap-2">
                {selectedKinshipLinks.map(({ relationship, relative }) => (
                  <LinkedCard
                    key={relationship.id}
                    title={relative?.name || 'Pessoa relacionada'}
                    caption={relationship.label}
                    onClick={relative ? () => onSelectNode(relative.id) : undefined}
                  />
                ))}
              </div>
            </Section>
          ) : null}

          {/* ---- Publicações ---- */}
          {selectedPersonOccurrences.length > 0 ? (
            <Section
              title="Fontes documentais e publicações"
              mark="D"
              trailing={
                <Chip tone="neutral" size="sm">
                  {selectedPersonOccurrences.length}
                </Chip>
              }
            >
              <ul className="flex flex-col gap-2">
                {selectedPersonOccurrences.map(({ relationship, document, evidence }) => (
                  <li
                    key={relationship.id}
                    className="flex min-w-0 flex-col gap-2 rounded-md border border-line-soft bg-surface-subtle px-3 py-2.5"
                  >
                    <strong className="text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                      {document?.name || relationship.label}
                    </strong>

                    {evidence?.sourceUrl ? (
                      <a
                        href={safeExternalUrl(evidence.sourceUrl) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-brand-line bg-brand-soft px-2 py-1 text-2xs font-semibold text-brand transition-colors hover:bg-surface"
                      >
                        Abrir fonte original
                        <Icons.ExternalLink size={11} aria-hidden="true" />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* ---- Dados cadastrais ---- */}
          {propertyRows.length > 0 ? (
            <Section title="Dados cadastrais" mark="C" flush>
              <div className="px-4 py-3">
                <DataTable
                  columns={[
                    { key: 'campo', header: 'Campo', strong: true },
                    { key: 'valor', header: 'Valor', align: 'right' },
                  ]}
                  rows={propertyRows}
                />
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      {/* ---- Relação selecionada ---- */}
      {selectedRelationship ? (
        <>
          <InspectorHeader
            eyebrow="Relação selecionada"
            title={selectedRelationship.label}
            onClose={onClearSelection}
            meta={
              <>
                <Chip tone={isConfirmed(selectedRelationship.status) ? 'ok' : 'warn'} size="sm" dot>
                  {isConfirmed(selectedRelationship.status) ? 'Confirmada' : 'Hipótese'}
                </Chip>
                <Chip tone="neutral" size="sm">
                  {selectedRelationship.type}
                </Chip>
              </>
            }
          />

          <div className="flex flex-col gap-1.5">
            <LinkedCard
              caption="Origem"
              title={sourceEntity?.name || 'Origem'}
              onClick={sourceEntity ? () => onSelectNode(sourceEntity.id) : undefined}
            />
            <Icons.ChevronDown size={16} aria-hidden="true" className="mx-auto text-ink-3" />
            <LinkedCard
              caption="Destino"
              title={targetEntity?.name || 'Destino'}
              onClick={targetEntity ? () => onSelectNode(targetEntity.id) : undefined}
            />
          </div>
        </>
      ) : null}

      {/* ---- Achados ---- */}
      {selectedFindings.length > 0 ? (
        <Section
          title="Achados"
          mark="!"
          trailing={
            <Chip tone="warn" size="sm">
              {selectedFindings.length}
            </Chip>
          }
        >
          <div className="flex flex-col gap-2">
            {selectedFindings.map((finding) => (
              <Note key={finding.id} tone="warn" title={finding.title}>
                {finding.explanation}
              </Note>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ---- Evidências ---- */}
      {selectedEvidence.length > 0 ? (
        <Section
          title="Evidências"
          mark="E"
          trailing={
            <Chip tone="neutral" size="sm">
              {selectedEvidence.length}
            </Chip>
          }
          flush
        >
          <ul className="divide-y divide-line-soft">
            {selectedEvidence.map((evidence) => (
              <li key={evidence.id} className="flex min-w-0 flex-col gap-1 px-4 py-2.5">
                <strong className="text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
                  {evidence.sourceName || evidence.provider}
                </strong>
                <p className="text-xs leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{evidence.excerpt}</p>

                <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2 text-2xs text-ink-3">
                  <span>{formatGeneratedAt(evidence.retrievedAt)}</span>
                  {evidence.sourceUrl ? (
                    <a
                      href={safeExternalUrl(evidence.sourceUrl) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand hover:underline"
                    >
                      Fonte
                      <Icons.ExternalLink size={11} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </aside>
  );
};
