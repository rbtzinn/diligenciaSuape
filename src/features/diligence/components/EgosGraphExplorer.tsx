import React, { useEffect, useMemo, useRef, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Icons } from '../../../components/ui/Icons';
import { Section } from '../../../components/ui/Section';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { Select } from '../../../components/ui/Field';
import { Toolbar } from '../../../components/ui/Toolbar';
import { EmptyState } from '../../../components/ui/EmptyState';
import { EgosEvidenceItem, EgosSnapshot } from '../types';

interface EgosGraphExplorerProps {
  egos: EgosSnapshot;
}

interface Selection {
  kind: 'node' | 'edge';
  id: string;
  title: string;
  subtitle: string;
  confidence: number;
}

const TYPE_LABELS: Record<string, string> = {
  Company: 'Empresa',
  Person: 'Pessoa',
  Address: 'Endereço',
  Sanction: 'Sanção',
  PublicOffice: 'Cargo público',
  CourtCase: 'Processo',
  Document: 'Documento',
  Organization: 'Instituição',
};

function evidenceFor(egos: EgosSnapshot, selection: Selection | null): EgosEvidenceItem[] {
  if (!selection) return [];
  return egos.evidences.filter((item) => selection.kind === 'edge'
    ? item.relationshipId === selection.id
    : item.entityId === selection.id);
}

export const EgosGraphExplorer: React.FC<EgosGraphExplorerProps> = ({ egos }) => {
  const [open, setOpen] = useState(false);
  const [depth, setDepth] = useState('all');
  const [relationFilter, setRelationFilter] = useState('all');
  const [selection, setSelection] = useState<Selection | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const entityById = useMemo(() => new Map(egos.entities.map((entity) => [entity.id, entity])), [egos.entities]);
  const selectedEvidence = useMemo(() => evidenceFor(egos, selection), [egos, selection]);

  useEffect(() => {
    if (!open || !containerRef.current) return undefined;
    let disposed = false;

    void import('cytoscape').then(({ default: cytoscapeFactory }) => {
      if (disposed || !containerRef.current) return;
      const maxDepth = depth === 'all' ? Number.POSITIVE_INFINITY : Number(depth);
      const visibleEntities = egos.entities.filter((entity) => entity.depth <= maxDepth);
      const visibleIds = new Set(visibleEntities.map((entity) => entity.id));
      const visibleRelationships = egos.relationships.filter((relationship) => {
        if (!visibleIds.has(relationship.sourceEntityId) || !visibleIds.has(relationship.targetEntityId)) return false;
        if (relationFilter === 'review') return relationship.status !== 'CONFIRMED' && relationship.status !== 'VALIDATED';
        if (relationFilter === 'confirmed') return relationship.status === 'CONFIRMED' || relationship.status === 'VALIDATED';
        return true;
      });

      cyRef.current?.destroy();
      const cy = cytoscapeFactory({
        container: containerRef.current,
        elements: [
          ...visibleEntities.map((entity) => ({
            data: {
              id: entity.id,
              label: entity.name.length > 28 ? `${entity.name.slice(0, 27)}…` : entity.name,
              fullName: entity.name,
              entityType: entity.type,
              role: entity.role,
              confidence: entity.confidence,
              root: entity.role === 'root' ? 'yes' : 'no',
            },
          })),
          ...visibleRelationships.map((relationship) => ({
            data: {
              id: relationship.id,
              source: relationship.sourceEntityId,
              target: relationship.targetEntityId,
              label: relationship.label,
              status: relationship.status,
              confidence: relationship.confidence,
            },
          })),
        ],
        style: [
          {
            selector: 'node',
            style: {
              'background-color': '#dbe9ed',
              'border-color': '#7898a3',
              'border-width': 1.5,
              color: '#173845',
              label: 'data(label)',
              'font-size': 9,
              'font-weight': 600,
              'text-valign': 'bottom',
              'text-margin-y': 7,
              'text-wrap': 'wrap',
              'text-max-width': '110px',
              width: 38,
              height: 38,
            },
          },
          { selector: 'node[entityType = "Company"]', style: { 'background-color': '#0f6b78', 'border-color': '#064b56', color: '#153642', shape: 'round-rectangle', width: 48, height: 38 } },
          { selector: 'node[entityType = "Person"]', style: { 'background-color': '#dce9f7', 'border-color': '#5680a8', shape: 'ellipse' } },
          { selector: 'node[entityType = "Organization"]', style: { 'background-color': '#cdebdc', 'border-color': '#3c8060', shape: 'hexagon', width: 46, height: 46 } },
          { selector: 'node[entityType = "PublicOffice"]', style: { 'background-color': '#f5e4b6', 'border-color': '#a67a23', shape: 'diamond', width: 42, height: 42 } },
          { selector: 'node[entityType = "Sanction"]', style: { 'background-color': '#f4d0cf', 'border-color': '#a84c49', shape: 'diamond' } },
          { selector: 'node[entityType = "CourtCase"]', style: { 'background-color': '#eadcf4', 'border-color': '#805a98', shape: 'round-rectangle' } },
          { selector: 'node[root = "yes"]', style: { 'border-width': 4, 'border-color': '#f1ba4b', width: 58, height: 46 } },
          {
            selector: 'edge',
            style: {
              width: 1.6,
              'line-color': '#9db2ba',
              'target-arrow-color': '#9db2ba',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              opacity: 0.84,
            },
          },
          { selector: 'edge[status = "CANDIDATE"], edge[status = "PROBABLE"]', style: { 'line-style': 'dashed', 'line-color': '#d2932e', 'target-arrow-color': '#d2932e' } },
          { selector: '.path-highlight', style: { 'line-color': '#e45c35', 'target-arrow-color': '#e45c35', 'background-color': '#f6b34c', width: 4, opacity: 1, 'z-index': 999 } },
          { selector: ':selected', style: { 'overlay-color': '#0d6b78', 'overlay-opacity': 0.14, 'overlay-padding': 8 } },
        ],
        layout: {
          name: 'cose',
          animate: false,
          fit: true,
          padding: 34,
          nodeRepulsion: () => 7200,
          idealEdgeLength: () => 92,
          gravity: 0.22,
          numIter: 900,
        },
        minZoom: 0.25,
        maxZoom: 2.6,
        wheelSensitivity: 0.55,
      });
      cyRef.current = cy;
      cy.on('tap', 'node', (event) => {
        const data = event.target.data();
        setSelection({ kind: 'node', id: data.id, title: data.fullName, subtitle: TYPE_LABELS[data.entityType] || data.entityType, confidence: data.confidence });
      });
      cy.on('tap', 'edge', (event) => {
        const data = event.target.data();
        const source = entityById.get(data.source)?.name || 'Entidade';
        const target = entityById.get(data.target)?.name || 'Entidade relacionada';
        setSelection({ kind: 'edge', id: data.id, title: data.label, subtitle: `${source} → ${target}`, confidence: data.confidence });
      });
    });

    return () => {
      disposed = true;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [depth, egos, entityById, open, relationFilter]);

  const fit = () => cyRef.current?.fit(undefined, 30);
  const zoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: Math.max(0.25, Math.min(2.6, cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };
  const highlightRelevantPath = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('path-highlight');
    const root = egos.entities.find((entity) => entity.role === 'root');
    const goal = egos.entities.find((entity) => entity.type === 'Organization' && entity.name.toUpperCase().includes('SUAPE'))
      || egos.entities.find((entity) => entity.type === 'Sanction' || entity.type === 'CourtCase' || entity.type === 'PublicOffice');
    if (!root || !goal || cy.getElementById(root.id).empty() || cy.getElementById(goal.id).empty()) return;
    const result = cy.elements().aStar({ root: cy.getElementById(root.id), goal: cy.getElementById(goal.id), directed: false });
    if (result.found) {
      result.path.addClass('path-highlight');
      cy.fit(result.path, 50);
    }
  };

  const hasRelevantGoal = egos.entities.some((entity) => (
    (entity.type === 'Organization' && entity.name.toUpperCase().includes('SUAPE'))
    || entity.type === 'Sanction'
    || entity.type === 'CourtCase'
    || entity.type === 'PublicOffice'
  ));

  return (
    <Section
      mark={<Icons.Network size={12} />}
      title="Entenda quem se liga a quem"
      subtitle="Rede investigativa"
      trailing={
        <Button
          variant={open ? 'ghost' : 'secondary'}
          size="sm"
          onClick={() => setOpen((current) => !current)}
          icon={<Icons.Users size={15} aria-hidden="true" />}
        >
          {open ? 'Fechar rede' : 'Explorar rede'}
        </Button>
      }
      flush={open}
    >
      {!open ? (
        <p className="text-sm leading-relaxed text-ink-2">
          Nós sólidos são registros documentados; linhas tracejadas representam hipóteses que ainda exigem revisão.
        </p>
      ) : (
        <div className="flex min-w-0 flex-col">
          {/* ---- Controles ---- */}
          <div
            aria-label="Controles do grafo"
            className="grid min-w-0 gap-3 border-b border-line-soft bg-surface-subtle px-4 py-3 sm:grid-cols-2 lg:grid-cols-[180px_180px_minmax(0,1fr)] lg:items-end"
          >
            <Select
              label="Nível"
              controlSize="sm"
              value={depth}
              options={[
                { value: 'all', label: 'Todos' },
                { value: '1', label: 'Até 1' },
                { value: '2', label: 'Até 2' },
                { value: '3', label: 'Até 3' },
              ]}
              onChange={setDepth}
            />

            <Select
              label="Relações"
              controlSize="sm"
              value={relationFilter}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'confirmed', label: 'Confirmadas' },
                { value: 'review', label: 'Em revisão' },
              ]}
              onChange={setRelationFilter}
            />

            <Toolbar align="start" className="lg:justify-end">
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                onClick={() => zoom(1.2)}
                aria-label="Aumentar zoom"
                title="Aumentar zoom"
                icon={<Icons.Plus size={15} aria-hidden="true" />}
              />
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                onClick={() => zoom(0.82)}
                aria-label="Diminuir zoom"
                title="Diminuir zoom"
                icon={<Icons.Minus size={15} aria-hidden="true" />}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={fit}
                icon={<Icons.Maximize size={15} aria-hidden="true" />}
              >
                Centralizar
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasRelevantGoal}
                onClick={highlightRelevantPath}
                icon={<Icons.Compass size={15} aria-hidden="true" />}
              >
                Destacar caminho
              </Button>
            </Toolbar>
          </div>

          {/* ---- Palco e detalhe ---- */}
          <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div
              ref={containerRef}
              aria-label="Grafo interativo de entidades e relações"
              className="min-h-[300px] min-w-0 bg-surface-subtle"
            />

            <aside
              aria-live="polite"
              className="flex min-w-0 flex-col gap-2 border-t border-line-soft p-3 lg:border-l lg:border-t-0"
            >
              {selection ? (
                <>
                  <span className="text-2xs font-bold uppercase tracking-wider text-ink-3">
                    {selection.kind === 'node' ? 'Entidade selecionada' : 'Relação selecionada'}
                  </span>
                  <h4 className="text-sm font-bold leading-snug text-ink [overflow-wrap:anywhere]">
                    {selection.title}
                  </h4>
                  <p className="text-xs leading-relaxed text-ink-2">{selection.subtitle}</p>

                  <Chip tone={selection.confidence >= 80 ? 'ok' : 'warn'} size="sm" className="num self-start">
                    {selection.confidence}% de confiança
                  </Chip>

                  <div className="mt-1 flex min-w-0 flex-col gap-2 border-t border-line-soft pt-2">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">
                      Evidências ({selectedEvidence.length})
                    </span>

                    {selectedEvidence.length > 0 ? (
                      selectedEvidence.map((evidence) => (
                        <article
                          key={evidence.id}
                          className="flex min-w-0 flex-col gap-1 rounded-md border border-line-soft bg-surface-subtle px-2.5 py-2"
                        >
                          <strong className="text-xs font-bold text-ink [overflow-wrap:anywhere]">
                            {evidence.sourceName}
                          </strong>
                          {evidence.excerpt ? (
                            <p className="text-2xs leading-relaxed text-ink-2">{evidence.excerpt}</p>
                          ) : null}
                          {evidence.sourceUrl ? (
                            <a
                              href={evidence.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex w-fit items-center gap-1 text-2xs font-semibold text-brand hover:underline"
                            >
                              Abrir fonte
                              <Icons.ExternalLink size={11} aria-hidden="true" />
                            </a>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="text-2xs leading-relaxed text-ink-3">
                        Selecione uma aresta ligada a esta entidade para abrir a prova da relação.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<Icons.Info size={18} />}
                  title="Selecione um nó ou uma linha"
                  description="Aqui aparecerão a classificação, a confiança e as evidências associadas."
                />
              )}
            </aside>
          </div>

          {/* ---- Legenda ---- */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft bg-surface-subtle px-4 py-2.5">
            {[
              { label: 'Empresa', color: 'var(--brand-blue)' },
              { label: 'Pessoa', color: '#7C4DBE' },
              { label: 'Instituição', color: '#0E7490' },
            ].map((kind) => (
              <span key={kind.label} className="flex items-center gap-1.5 text-2xs font-medium text-ink-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm border-2 bg-surface"
                  style={{ borderColor: kind.color }}
                />
                {kind.label}
              </span>
            ))}

            <span aria-hidden="true" className="h-3 w-px bg-line" />

            <span className="flex items-center gap-1.5 text-2xs font-medium text-ink-2">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-brand" />
              Relação confirmada
            </span>
            <span className="flex items-center gap-1.5 text-2xs font-medium text-ink-2">
              <span
                aria-hidden="true"
                className="h-0 w-4 border-t-2 border-dashed border-[color:var(--brand-gold)]"
              />
              Hipótese
            </span>
          </div>
        </div>
      )}
    </Section>
  );
};
