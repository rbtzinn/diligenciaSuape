import React, { useEffect, useMemo, useRef, useState } from 'react';
import type cytoscape from 'cytoscape';
import { Icons } from '../../../components/ui/Icons';
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
        wheelSensitivity: 0.2,
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
    <section className="egos-graph-explorer" aria-labelledby="egos-graph-title">
      <div className="egos-graph-intro">
        <div>
          <span>Rede investigativa</span>
          <h3 id="egos-graph-title">Entenda quem se liga a quem</h3>
          <p>Nós sólidos são registros documentados; linhas tracejadas representam hipóteses que ainda exigem revisão.</p>
        </div>
        <button type="button" className="egos-graph-open" onClick={() => setOpen((current) => !current)}>
          <Icons.Users size={16} /> {open ? 'Fechar rede' : 'Explorar rede'}
        </button>
      </div>

      {open ? (
        <div className="egos-graph-workspace">
          <div className="egos-graph-toolbar" aria-label="Controles do grafo">
            <label>Nível<select value={depth} onChange={(event) => setDepth(event.target.value)}><option value="all">Todos</option><option value="1">Até 1</option><option value="2">Até 2</option><option value="3">Até 3</option></select></label>
            <label>Relações<select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}><option value="all">Todas</option><option value="confirmed">Confirmadas</option><option value="review">Em revisão</option></select></label>
            <div className="egos-graph-actions">
              <button type="button" onClick={() => zoom(1.2)} aria-label="Aumentar zoom">+</button>
              <button type="button" onClick={() => zoom(0.82)} aria-label="Diminuir zoom">−</button>
              <button type="button" onClick={fit}>Centralizar</button>
              <button type="button" disabled={!hasRelevantGoal} onClick={highlightRelevantPath}>Destacar caminho</button>
            </div>
          </div>
          <div className="egos-graph-main">
            <div ref={containerRef} className="egos-graph-canvas" aria-label="Grafo interativo de entidades e relações" />
            <aside className="egos-graph-detail" aria-live="polite">
              {selection ? (
                <>
                  <span>{selection.kind === 'node' ? 'Entidade selecionada' : 'Relação selecionada'}</span>
                  <h4>{selection.title}</h4>
                  <p>{selection.subtitle}</p>
                  <strong>{selection.confidence}% de confiança</strong>
                  <div className="egos-graph-evidence">
                    <span>Evidências ({selectedEvidence.length})</span>
                    {selectedEvidence.length > 0 ? selectedEvidence.map((evidence) => (
                      <article key={evidence.id}>
                        <strong>{evidence.sourceName}</strong>
                        {evidence.excerpt ? <p>{evidence.excerpt}</p> : null}
                        {evidence.sourceUrl ? <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte <Icons.ExternalLink size={11} /></a> : null}
                      </article>
                    )) : <p>Selecione uma aresta ligada a esta entidade para abrir a prova da relação.</p>}
                  </div>
                </>
              ) : (
                <div className="egos-graph-placeholder"><Icons.Info size={20} /><strong>Selecione um nó ou uma linha</strong><p>Aqui aparecerão a classificação, a confiança e as evidências associadas.</p></div>
              )}
            </aside>
          </div>
          <div className="egos-graph-legend"><span><i className="legend-company" /> Empresa</span><span><i className="legend-person" /> Pessoa</span><span><i className="legend-institution" /> Instituição</span><span><b /> relação confirmada</span><span><b className="legend-candidate" /> hipótese</span></div>
        </div>
      ) : null}
    </section>
  );
};
