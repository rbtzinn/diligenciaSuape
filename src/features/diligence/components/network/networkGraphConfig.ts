// ==========================================================
// DILIGÊNCIA 360 — Configurações, Estilos e Layout Cytoscape
// ==========================================================

import type cytoscape from 'cytoscape';
import type { EgosEntity, EgosRelationship } from '../../types';
import type { FilterState, RouteSummary } from './types';
import {
  filterGraphEntities,
  isConfirmed,
  normalizeText,
  relationshipMatchesFilter,
  TYPE_LABELS,
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

/**
 * Entidade que representa uma ocorrência, e não apenas um vínculo.
 *
 * O sinal vem das propriedades que os adaptadores já gravam: resultado do
 * processo de controle externo e situação de sanção. Nome de órgão não conta
 * — a Prefeitura não é o risco, o processo é.
 */
function carriesRisk(entity: EgosEntity): boolean {
  const props = entity.properties || {};
  const outcome = String(props.outcome || '');
  if (/IRREGULAR/i.test(outcome)) return true;
  if (props.sanctionActive === true) return true;
  return false;
}

export function buildCytoscapeElements(
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  rootEntity: EgosEntity | undefined,
  filters: FilterState,
  searchTerm: string
): cytoscape.ElementDefinition[] {
  const normalizedSearch = normalizeText(searchTerm);
  const visible = new Map(
    filterGraphEntities(entities, relationships, filters, rootEntity?.id)
      .map((entity) => [entity.id, entity])
  );

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
        // Entidade ligada a controle externo ou sanção é o que o mapa
        // precisa destacar: sem isso, o grafo mostra com quem a empresa
        // se relaciona, mas não onde está o risco.
        carriesRisk(entity) ? 'has-risk' : '',
      ].filter(Boolean).join(' '),
    };
  });

  const edges: cytoscape.ElementDefinition[] = relationships
    .filter((relationship) => visible.has(relationship.sourceEntityId) && visible.has(relationship.targetEntityId))
    .filter((relationship) => relationshipMatchesFilter(relationship, filters.relation))
    .map((relationship) => {
      const confirmed = isConfirmed(relationship.status);
      const isDocEdge = visible.get(relationship.sourceEntityId)?.type === 'Document' ||
        visible.get(relationship.targetEntityId)?.type === 'Document' ||
        relationship.type.toUpperCase().includes('DOCUMENT') ||
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

export function arrangeFocus(cy: cytoscape.Core, focusId?: string) {
  const focusNode = focusId ? cy.getElementById(focusId) : cy.nodes().first();
  const focus = focusNode.length ? focusNode : cy.nodes().first();
  if (!focus.length) return;

  const neighbors = cy.nodes()
    .filter((node) => node.id() !== focus.id())
    .sort((left, right) => String(left.data('label')).localeCompare(String(right.data('label')), 'pt-BR'));
  const positions: Record<string, { x: number; y: number }> = {
    [focus.id()]: { x: 0, y: 0 },
  };
  const count = neighbors.length;
  const radius = count <= 4 ? 145 : count <= 8 ? 205 : 245;
  const angleStep = (2 * Math.PI) / Math.max(1, count);
  const angleOffset = -Math.PI / 2;

  neighbors.forEach((node, index) => {
    const angle = angleOffset + index * angleStep;
    positions[node.id()] = {
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
    };
  });

  cy.nodes().removeClass('is-mobile-focus');
  focus.addClass('is-mobile-focus');
  cy.layout({
    name: 'preset',
    positions,
    fit: true,
    padding: 76,
    animate: true,
    animationDuration: 280,
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
    const column = Math.max(1, Number(node.data('depth')) || 1);
    if (!grouped[column]) grouped[column] = [];
    grouped[column].push(node);
  });

  // Leitura genealógica: raiz à esquerda e graus seguintes em blocos legíveis.
  // Camadas extensas quebram em subcolunas para evitar que o mapa seja reduzido
  // a uma faixa vertical quase impossível de selecionar.
  const columnWidth = 270;
  const rowHeight = 104;
  const maxRowsPerColumn = 7;
  let nextColumnX = columnWidth;

  Object.entries(grouped)
    .sort(([left], [right]) => Number(left) - Number(right))
    .forEach(([, nodes]) => {
      nodes.sort((left, right) => String(left.data('label')).localeCompare(String(right.data('label')), 'pt-BR'));
      const subcolumnCount = Math.ceil(nodes.length / maxRowsPerColumn);
      nodes.forEach((node, index) => {
        const subcolumn = Math.floor(index / maxRowsPerColumn);
        const row = index % maxRowsPerColumn;
        const rowsInSubcolumn = Math.min(maxRowsPerColumn, nodes.length - subcolumn * maxRowsPerColumn);
        const startY = -((rowsInSubcolumn - 1) * rowHeight) / 2;
        positions[node.id()] = {
          x: nextColumnX + subcolumn * columnWidth,
          y: startY + row * rowHeight,
        };
      });
      nextColumnX += Math.max(1, subcolumnCount) * columnWidth;
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
  /* ==========================================================
     Nós em cartão sobre tela clara.

     O grafo era escuro e usava formas geométricas com o rótulo por
     fora, o que obrigava a consultar a legenda para saber o que cada
     forma significava e deixava a tela do mapa incoerente com o resto
     do sistema. Agora cada nó é um cartão branco com o texto dentro e
     a cor da borda indicando o tipo, no mesmo vocabulário visual do
     dossiê.
     ========================================================== */
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      shape: 'roundrectangle',
      'background-color': '#FFFFFF',
      'border-width': 2,
      'border-color': '#2D60AD',
      color: '#142630',
      'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif',
      'font-size': '10px',
      'font-weight': 600,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-max-width': '128px',
      'text-wrap': 'wrap',
      width: 150,
      height: 52,
      padding: '6px',
      'transition-property': 'border-color, width, height, opacity',
      'transition-duration': 180,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-company',
    style: { 'border-color': '#2D60AD' } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-person',
    style: { 'border-color': '#7C4DBE' } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-publicoffice',
    style: { 'border-color': '#0E7490' } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-document',
    style: {
      'border-color': '#8FA3AE',
      color: '#465B67',
      width: 128,
      height: 42,
      'font-size': '9px',
    } as cytoscape.Css.Node,
  },
  {
    /* A empresa investigada usa o dourado institucional, o mesmo que a
       marca o cartão de identificação do dossiê. */
    selector: 'node.is-root',
    style: {
      width: 176,
      height: 60,
      'border-width': 3,
      'border-color': '#FCB315',
      'font-size': '11px',
      'font-weight': 700,
    } as cytoscape.Css.Node,
  },
  {
    /* Ocorrência de controle externo é o único nó que o mapa pinta de
       vermelho: é onde está o risco, e precisa saltar. */
    selector: 'node.has-risk',
    style: {
      'border-color': '#DC2626',
      color: '#DC2626',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.is-search-match',
    style: {
      'border-color': '#D97706',
      'border-width': 3,
      'underlay-color': '#FCB315',
      'underlay-opacity': 0.18,
      'underlay-padding': 8,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.is-mobile-focus',
    style: {
      'border-width': 3,
      'underlay-color': '#2D60AD',
      'underlay-opacity': 0.16,
      'underlay-padding': 12,
      'z-index': 10,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'underlay-color': '#2D60AD',
      'underlay-opacity': 0.22,
      'underlay-padding': 10,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'edge',
    style: {
      width: 2,
      'curve-style': 'bezier',
      'line-color': '#A9BCC6',
      'target-arrow-color': '#A9BCC6',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.85,
      label: 'data(label)',
      color: '#667A85',
      'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif',
      'font-size': '9px',
      'text-rotation': 'autorotate',
      'text-margin-y': -8,
      'text-background-color': '#FBFCFD',
      'text-background-opacity': 0.95,
      'text-background-padding': '3px',
      'transition-property': 'line-color, target-arrow-color, width, opacity',
      'transition-duration': 180,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge.is-confirmed',
    style: {
      'line-color': '#2D60AD',
      'target-arrow-color': '#2D60AD',
      width: 2.5,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge.is-hypothesis',
    style: {
      'line-style': 'dashed',
      'line-color': '#c58b27',
      'target-arrow-color': '#c58b27',
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge.is-doc-edge',
    style: {
      label: '',
      'line-style': 'dotted',
      'line-color': '#8FA3AE',
      'target-arrow-color': '#8FA3AE',
      width: 1.5,
      opacity: 0.6,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#ffffff',
      'target-arrow-color': '#ffffff',
      width: 4,
      'underlay-color': '#ffffff',
      'underlay-opacity': 0.16,
      'underlay-padding': 4,
    } as cytoscape.Css.Edge,
  },
  // Rota destacada: separada estritamente para nós e arestas para nunca esmagar o tamanho do nó
  {
    selector: 'edge.is-route-active',
    style: {
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
      width: 4.5,
      'underlay-color': '#f59e0b',
      'underlay-opacity': 0.18,
      'underlay-padding': 5,
    } as cytoscape.Css.Edge,
  },
  {
    selector: 'node.is-route-active',
    style: {
      'border-color': '#f59e0b',
      'border-width': 4,
      'underlay-color': '#f59e0b',
      'underlay-opacity': 0.2,
      'underlay-padding': 8,
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
