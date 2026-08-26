// ==========================================================
// DILIGÊNCIA 360 — Configurações, Estilos e Layout Cytoscape
// ==========================================================

import type cytoscape from 'cytoscape';
import type { EgosEntity, EgosRelationship } from '../../types';
import type { FilterState, RouteSummary } from './types';
import {
  CHAIN_ENTITY_ORDER,
  isConfirmed,
  normalizeText,
  TYPE_LABELS,
  visibleEntity,
} from './networkUtils';

export interface GraphNodeMetrics {
  width: number;
  height: number;
  fontSize: number;
  textMaxWidth: number;
  textMargin: number;
}

export const GRAPH_NODE_METRICS: Record<'default' | 'root' | 'document', GraphNodeMetrics> = {
  default: { width: 52, height: 52, fontSize: 10, textMaxWidth: 115, textMargin: 10 },
  root: { width: 84, height: 62, fontSize: 12, textMaxWidth: 160, textMargin: 10 },
  document: { width: 32, height: 32, fontSize: 9, textMaxWidth: 95, textMargin: 8 },
};

export function syncGraphVisualScale(cy: cytoscape.Core) {
  const currentZoom = Math.max(0.2, Math.min(3, cy.zoom()));
  const nodeCompensation = 1 / currentZoom;
  const labelCompensation = 1 / Math.max(0.8, currentZoom);
  const compensateNode = (value: number) => Math.round(value * Math.sqrt(nodeCompensation) * 100) / 100;
  const compensateLabel = (value: number) => Math.round(value * labelCompensation * 100) / 100;
  const allNodes = cy.nodes();
  const rootNodes = cy.nodes('[?isRoot]');
  const documentNodes = cy.nodes('[entityType = "Document"]').not(rootNodes);
  const defaultNodes = allNodes.not(rootNodes).not(documentNodes);

  const applyMetrics = (nodes: cytoscape.NodeCollection, metrics: GraphNodeMetrics) => {
    nodes.style({
      width: compensateNode(metrics.width),
      height: compensateNode(metrics.height),
      'font-size': `${compensateLabel(metrics.fontSize)}px`,
      'text-max-width': `${compensateLabel(metrics.textMaxWidth)}px`,
      'text-margin-y': `${compensateLabel(metrics.textMargin)}px`,
    });
  };

  cy.batch(() => {
    applyMetrics(defaultNodes, GRAPH_NODE_METRICS.default);
    applyMetrics(documentNodes, GRAPH_NODE_METRICS.document);
    applyMetrics(rootNodes, GRAPH_NODE_METRICS.root);
  });
}

export function buildCytoscapeElements(
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  rootEntity: EgosEntity | undefined,
  filters: FilterState,
  searchTerm: string
): cytoscape.ElementDefinition[] {
  const normalizedSearch = normalizeText(searchTerm);
  const visible = new Map<string, EgosEntity>();

  entities.forEach((entity) => {
    if (visibleEntity(entity, filters)) visible.set(entity.id, entity);
  });

  const nodes: cytoscape.ElementDefinition[] = [...visible.values()].map((entity) => {
    const isRoot = rootEntity?.id === entity.id;
    const matches = normalizedSearch ? normalizeText(entity.name).includes(normalizedSearch) : false;
    return {
      group: 'nodes',
      data: {
        id: entity.id,
        label: entity.name,
        typeLabel: TYPE_LABELS[entity.type] || entity.type,
        entityType: entity.type,
        role: entity.role,
        depth: entity.depth,
        confidence: entity.confidence,
        isRoot,
        searchMatch: matches,
      },
      classes: [
        `type-${entity.type.toLowerCase()}`,
        isRoot ? 'is-root' : '',
        matches ? 'is-search-match' : '',
      ].filter(Boolean).join(' '),
    };
  });

  const edges: cytoscape.ElementDefinition[] = relationships
    .filter((relationship) => visible.has(relationship.sourceEntityId) && visible.has(relationship.targetEntityId))
    .filter((relationship) => (filters.relation === 'all' ? true : relationship.type === filters.relation))
    .map((relationship) => {
      const confirmed = isConfirmed(relationship.status);
      const isDocEdge = relationship.type.toUpperCase().includes('DOCUMENT') ||
        relationship.label.toLowerCase().includes('publicação') ||
        relationship.label.toLowerCase().includes('menção');

      return {
        group: 'edges',
        data: {
          id: relationship.id,
          source: relationship.sourceEntityId,
          target: relationship.targetEntityId,
          label: isDocEdge ? '' : relationship.label,
          fullLabel: relationship.label,
          status: relationship.status,
          type: relationship.type,
          isConfirmed: confirmed,
          isDocEdge,
        },
        classes: [
          confirmed ? 'is-confirmed' : 'is-hypothesis',
          isDocEdge ? 'is-doc-edge' : '',
          `rel-${relationship.type.toLowerCase()}`,
        ].filter(Boolean).join(' '),
      };
    });

  return [...nodes, ...edges];
}

export function arrangeRadar(cy: cytoscape.Core, rootId?: string) {
  const rootNode = rootId ? cy.getElementById(rootId) : cy.nodes('.is-root').first();
  const root = rootNode.length ? rootNode : cy.nodes().first();
  if (!root.length) return;

  const positions: Record<string, { x: number; y: number }> = {};
  positions[root.id()] = { x: 0, y: 0 };

  const depthGroups: Record<number, cytoscape.NodeSingular[]> = {};
  const docNodes: cytoscape.NodeSingular[] = [];

  cy.nodes().forEach((node) => {
    if (node.id() === root.id()) return;
    if (node.data('entityType') === 'Document') {
      docNodes.push(node);
      return;
    }
    const depth = Number(node.data('depth')) || 1;
    if (!depthGroups[depth]) depthGroups[depth] = [];
    depthGroups[depth].push(node);
  });

  // Organiza nós normais por anéis concêntricos com bom raio
  const radiusStep = 210;
  Object.entries(depthGroups).forEach(([depthStr, nodes]) => {
    const depth = Number(depthStr);
    const radius = Math.max(180, depth * radiusStep);
    const count = nodes.length;
    const angleStep = (2 * Math.PI) / Math.max(1, count);
    const angleOffset = (depth % 2) * (angleStep / 2);

    nodes.forEach((node, index) => {
      const angle = index * angleStep + angleOffset;
      positions[node.id()] = {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius),
      };
    });
  });

  // Organiza documentos no anel exterior mais distante com dispersão ampla
  if (docNodes.length > 0) {
    const docRadius = 390;
    const count = docNodes.length;
    const angleStep = (2 * Math.PI) / Math.max(1, count);

    docNodes.forEach((node, index) => {
      const angle = index * angleStep;
      positions[node.id()] = {
        x: Math.round(Math.cos(angle) * docRadius),
        y: Math.round(Math.sin(angle) * docRadius),
      };
    });
  }

  cy.layout({
    name: 'preset',
    positions,
    fit: true,
    padding: 60,
    animate: true,
    animationDuration: 360,
  } as cytoscape.PresetLayoutOptions).run();
}

export function arrangeChain(cy: cytoscape.Core, rootId?: string) {
  const rootNode = rootId ? cy.getElementById(rootId) : cy.nodes('.is-root').first();
  const root = rootNode.length ? rootNode : cy.nodes().first();
  if (!root.length) return;

  const positions: Record<string, { x: number; y: number }> = {};
  positions[root.id()] = { x: 0, y: 0 };

  const grouped: Record<number, cytoscape.NodeSingular[]> = {};
  cy.nodes().forEach((node) => {
    if (node.id() === root.id()) return;
    const type = String(node.data('entityType') || 'Person');
    const column = CHAIN_ENTITY_ORDER[type] ?? 3;
    if (!grouped[column]) grouped[column] = [];
    grouped[column].push(node);
  });

  // Espaçamento generoso entre colunas e linhas para não ficar minúsculo
  const columnWidth = 320;
  const rowHeight = 110;

  Object.entries(grouped).forEach(([colStr, nodes]) => {
    const col = Number(colStr);
    const count = nodes.length;
    const startY = -((count - 1) * rowHeight) / 2;

    nodes.forEach((node, index) => {
      positions[node.id()] = {
        x: col * columnWidth,
        y: startY + index * rowHeight,
      };
    });
  });

  cy.layout({
    name: 'preset',
    positions,
    fit: true,
    padding: 70,
    animate: true,
    animationDuration: 360,
  } as cytoscape.PresetLayoutOptions).run();
}

export const CYTOSCAPE_STYLESHEET: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      color: '#ffffff',
      'font-family': "'Plus Jakarta Sans', 'Inter', sans-serif",
      'font-size': '10px',
      'font-weight': 600,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 10,
      'text-max-width': '120px',
      'text-wrap': 'ellipsis',
      'text-background-color': '#031426',
      'text-background-opacity': 0.88,
      'text-background-padding': '4px',
      'text-background-shape': 'roundrectangle',
      'background-color': '#1d4ed8',
      'border-width': 2,
      'border-color': '#3b82f6',
      width: 52,
      height: 52,
      'transition-property': 'background-color, border-color, width, height, opacity',
      'transition-duration': 180,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-company',
    style: {
      shape: 'roundrectangle',
      'background-color': '#1e40af',
      'border-color': '#60a5fa',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-person',
    style: {
      shape: 'ellipse',
      'background-color': '#0e7490',
      'border-color': '#38bdf8',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-publicoffice',
    style: {
      shape: 'diamond',
      'background-color': '#d97706',
      'border-color': '#fbbf24',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-document',
    style: {
      shape: 'rectangle',
      width: 32,
      height: 32,
      'background-color': '#475569',
      'border-color': '#94a3b8',
      'font-size': '9px',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.is-root',
    style: {
      width: 84,
      height: 62,
      shape: 'roundrectangle',
      'background-color': '#2563eb',
      'border-width': 3,
      'border-color': '#93c5fd',
      'font-size': '12px',
      'font-weight': 700,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.is-search-match',
    style: {
      'border-color': '#f59e0b',
      'border-width': 4,
      'background-color': '#b45309',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#ffffff',
      'border-width': 4,
      'shadow-blur': 22,
      'shadow-color': 'rgba(255, 255, 255, 0.5)',
      'shadow-opacity': 1,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'edge',
    style: {
      width: 2,
      'curve-style': 'bezier',
      'line-color': '#334155',
      'target-arrow-color': '#334155',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.85,
      label: 'data(label)',
      color: '#94a3b8',
      'font-family': "'Plus Jakarta Sans', 'Inter', sans-serif",
      'font-size': '9px',
      'text-rotation': 'autorotate',
      'text-margin-y': -8,
      'text-background-color': '#031426',
      'text-background-opacity': 0.85,
      'text-background-padding': '3px',
      'transition-property': 'line-color, target-arrow-color, width, opacity',
      'transition-duration': 180,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge.is-confirmed',
    style: {
      'line-color': '#38bdf8',
      'target-arrow-color': '#38bdf8',
      width: 2.5,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge.is-hypothesis',
    style: {
      'line-style': 'dashed',
      'line-color': '#64748b',
      'target-arrow-color': '#64748b',
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge.is-doc-edge',
    style: {
      label: '',
      'line-style': 'dotted',
      'line-color': '#475569',
      'target-arrow-color': '#475569',
      width: 1.5,
      opacity: 0.5,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#ffffff',
      'target-arrow-color': '#ffffff',
      width: 4,
      'shadow-blur': 12,
      'shadow-color': 'rgba(255, 255, 255, 0.5)',
    } as cytoscape.Css.Edge,
  },
  // Rota destacada: separada estritamente para nós e arestas para nunca esmagar o tamanho do nó
  {
    selector: 'edge.is-route-active',
    style: {
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
      width: 4.5,
      'shadow-blur': 14,
      'shadow-color': '#f59e0b',
      'shadow-opacity': 0.8,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'node.is-route-active',
    style: {
      'border-color': '#f59e0b',
      'border-width': 4,
      'shadow-blur': 22,
      'shadow-color': '#f59e0b',
      'shadow-opacity': 0.85,
    } as cytoscape.Css.Node,
  },
  {
    selector: '.is-dimmed',
    style: {
      opacity: 0.18,
    } as cytoscape.Css.Node,
  },
];

export function pulseRoute(cy: cytoscape.Core, route: RouteSummary, timersRef: React.MutableRefObject<number[]>) {
  timersRef.current.forEach((t) => window.clearTimeout(t));
  timersRef.current = [];

  const routeElements = cy.collection();
  route.nodeIds.forEach((id) => routeElements.merge(cy.getElementById(id)));
  route.edgeIds.forEach((id) => routeElements.merge(cy.getElementById(id)));

  cy.elements().addClass('is-dimmed');
  routeElements.removeClass('is-dimmed').addClass('is-route-active');

  // Enquadra e faz o zoom cinematográfico em todo o caminho traçado
  if (routeElements.length > 0) {
    cy.animate({
      fit: { eles: routeElements, padding: 90 },
      duration: 480,
    });
  }
}

export function focusNeighborhood(cy: cytoscape.Core, elementId: string, reduceMotion = false) {
  const target = cy.getElementById(elementId);
  if (!target.length) return;

  const neighborhood = target.neighborhood().add(target);
  cy.elements().addClass('is-dimmed');
  neighborhood.removeClass('is-dimmed');

  cy.animate({
    fit: { eles: neighborhood, padding: 96 },
    duration: reduceMotion ? 0 : 520,
  });
}
