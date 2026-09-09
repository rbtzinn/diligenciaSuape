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
  shortRelationLabel,
  TYPE_LABELS,
} from './networkUtils';

/* ==========================================================
   GEOMETRIA DO NÓ
   ==========================================================
   Um só lugar declara o tamanho do cartão de cada tipo de nó, e
   tanto a folha de estilo do Cytoscape quanto os arranjos leem
   daqui. Antes havia dois tamanhos concorrentes: a folha de estilo
   desenhava cartões de 150×52 com o texto dentro, e uma função de
   compensação de zoom reescrevia a largura para 52px e empurrava o
   rótulo para fora com `text-margin-y`. O resultado era o texto
   maior que a caixa, sobrepondo o nó vizinho — foi o que sobrou da
   conversão de círculos para cartões.
   ========================================================== */
export interface NodeBox {
  width: number;
  height: number;
  fontSize: number;
  /** Largura de texto: sempre menor que a caixa, por causa do padding. */
  textMaxWidth: number;
}

export const NODE_BOX: Record<'default' | 'root' | 'document', NodeBox> = {
  default: { width: 150, height: 52, fontSize: 10, textMaxWidth: 128 },
  root: { width: 176, height: 60, fontSize: 11, textMaxWidth: 152 },
  document: { width: 128, height: 42, fontSize: 9, textMaxWidth: 108 },
};

/** Folga entre dois cartões vizinhos, para o traço da ligação respirar. */
const NODE_GAP = 44;

/* ==========================================================
   GEOMETRIA DO CELULAR
   ==========================================================
   No desktop o mapa é desenhado grande e depois encolhido para
   caber (`fit`), e isso funciona porque o palco tem mil pixels de
   largura. No celular a mesma conta era ruinosa: oito vizinhos em
   cartões de 150px formam um anel de 640px de diâmetro, e encaixar
   640px num palco de 390px com 76 de folga dá zoom 0,37 — o texto
   de 10px virava 3,7px na tela. Era isto que estava ilegível: o
   grafo certo, desenhado pequeno demais para ser lido.

   Aqui a conta é ao contrário: o arranjo é calculado no tamanho do
   palco, e o mapa é mostrado a zoom 1. O cartão é o maior que ainda
   permite dois vizinhos lado a lado do nó em foco sem sair da tela —
   é daí que sai a fórmula abaixo.
   ========================================================== */
export interface CompactGeometry {
  cardWidth: number;
  cardHeight: number;
  rootWidth: number;
  rootHeight: number;
  /** Folga entre o cartão em foco e o do vizinho. */
  gap: number;
  /** Margem entre o cartão mais externo e a borda do palco. */
  margin: number;
}

/** Cartões maiores que isto não cabem em pares num celular. */
const COMPACT_CARD_MIN = 96;
const COMPACT_CARD_MAX = 136;
const COMPACT_ROOT_RATIO = 1.16;

/**
 * Restrição que define o cartão do celular: na horizontal cabem, do
 * centro até a borda, meio cartão em foco, a folga e um cartão
 * inteiro de vizinho. Ou seja
 *
 *   rootWidth / 2 + gap + cardWidth ≤ larguraDoPalco / 2 − margem
 *
 * Com `rootWidth = cardWidth × 1,16`, sobra uma equação de primeiro
 * grau em `cardWidth`, que é o que a função resolve.
 */
export function compactGeometry(stageWidth: number): CompactGeometry {
  const gap = 14;
  const margin = 12;
  const half = Math.max(280, stageWidth) / 2;
  const cardWidth = Math.round(Math.max(
    COMPACT_CARD_MIN,
    Math.min(COMPACT_CARD_MAX, (half - margin - gap) / (1 + COMPACT_ROOT_RATIO / 2)),
  ));

  return {
    cardWidth,
    // Quatro linhas de texto: até três de nome e uma do vínculo.
    cardHeight: 62,
    rootWidth: Math.round(cardWidth * COMPACT_ROOT_RATIO),
    rootHeight: 58,
    gap,
    margin,
  };
}

/** Nome cortado na fronteira de palavra, para caber no cartão. */
function fitName(name: string, maxChars: number): string {
  const clean = String(name || '').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Quantos caracteres cabem no cartão do celular, por papel. */
const COMPACT_NAME_CHARS = 32;
const COMPACT_ROOT_NAME_CHARS = 40;

/**
 * Raio mínimo para acomodar `count` cartões num anel sem que dois se
 * toquem. A conta é o perímetro necessário dividido por 2π: com
 * cartões de 150px, um anel de raio 180 cabe sete, e o oitavo já
 * entra por cima do sétimo. Era o que acontecia no mapa.
 */
function ringRadius(count: number, boxWidth: number, minimum: number): number {
  if (count <= 1) return minimum;
  const needed = (count * (boxWidth + NODE_GAP)) / (2 * Math.PI);
  return Math.max(minimum, Math.round(needed));
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

/**
 * Modo celular do mapa.
 *
 * Fora do celular cada ligação escreve o próprio rótulo sobre o
 * traço. Na exploração por ramos isso é desperdício e atrapalha:
 * todas as ligações desenhadas partem do mesmo nó em foco, então o
 * rótulo pertence sem ambiguidade ao vizinho — e escrito no traço
 * ele colidia com o do vizinho ao lado, num palco de 390px.
 *
 * Por isso, aqui, o vínculo é a segunda linha do cartão do vizinho e
 * o traço fica limpo.
 */
export interface CompactBuildOptions {
  /** Id do nó em foco. Os demais nós são vizinhos diretos dele. */
  focusId?: string;
}

export function buildCytoscapeElements(
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  rootEntity: EgosEntity | undefined,
  filters: FilterState,
  searchTerm: string,
  compact?: CompactBuildOptions
): cytoscape.ElementDefinition[] {
  const normalizedSearch = normalizeText(searchTerm);
  const visible = new Map(
    filterGraphEntities(entities, relationships, filters, rootEntity?.id)
      .map((entity) => [entity.id, entity])
  );

  // Vínculo de cada vizinho com o nó em foco, para a segunda linha do
  // cartão no celular.
  const bondToFocus = new Map<string, string>();
  if (compact?.focusId) {
    relationships.forEach((relationship) => {
      const { sourceEntityId: source, targetEntityId: target } = relationship;
      if (source !== compact.focusId && target !== compact.focusId) return;
      const neighborId = source === compact.focusId ? target : source;
      if (bondToFocus.has(neighborId)) return;
      // O vizinho é o destino da relação quando o foco é a origem —
      // e aí o rótulo tem de ser lido ao contrário.
      bondToFocus.set(neighborId, shortRelationLabel(relationship, neighborId === target));
    });
  }

  const nodes: cytoscape.ElementDefinition[] = [...visible.values()].map((entity) => {
    const isRoot = rootEntity?.id === entity.id;
    const matches = normalizedSearch ? normalizeText(entity.name).includes(normalizedSearch) : false;
    const isFocus = compact?.focusId === entity.id;

    let label = entity.name;
    // O nó de grupo diz a contagem e o vínculo: "48 órgãos e
    // instituições / Contratada por". Sem a segunda linha ele seria
    // um número sem relação, e o mapa perderia justamente o que o
    // agrupamento resume.
    if (entity.properties?.grupo && entity.properties?.vinculo) {
      label = `${entity.name}\n${String(entity.properties.vinculo)}`;
    }
    if (compact) {
      const maxChars = isFocus || isRoot ? COMPACT_ROOT_NAME_CHARS : COMPACT_NAME_CHARS;
      const bond = isFocus ? '' : bondToFocus.get(entity.id) || '';
      label = bond
        ? `${fitName(entity.name, maxChars)}\n${bond}`
        : fitName(entity.name, maxChars);
    }

    return {
      group: 'nodes',
      data: {
        id: entity.id,
        label,
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
        compact ? 'is-compact' : '',
        compact && isFocus ? 'is-compact-focus' : '',
        entity.properties?.grupo ? 'is-group' : '',
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
          // Na exploração por ramos o vínculo já está escrito no
          // cartão do vizinho; na rede completa não há foco, e é o
          // traço que precisa dizer o que liga um nó ao outro.
          label: isDocEdge || compact?.focusId ? '' : shortRelationLabel(relationship),
          fullLabel: relationship.label,
          status: relationship.status,
          type: relationship.type,
          isConfirmed: confirmed,
          isDocEdge,
        },
        classes: [
          confirmed ? 'is-confirmed' : 'is-hypothesis',
          isDocEdge ? 'is-doc-edge' : '',
          relationship.properties?.grupo ? 'is-group-edge' : '',
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

  // Anéis concêntricos. O raio de cada anel é o maior entre a
  // distância do grau e o mínimo que acomoda a quantidade de cartões
  // daquele anel — sem a segunda parte, um grau com dez vizinhos
  // empilhava os cartões um sobre o outro.
  const radiusStep = 260;
  Object.entries(depthGroups).forEach(([depthStr, nodes]) => {
    const depth = Number(depthStr);
    const count = nodes.length;
    const radius = ringRadius(count, NODE_BOX.default.width, depth * radiusStep);
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

  // Documentos no anel externo, fora dos graus de relacionamento.
  if (docNodes.length > 0) {
    const count = docNodes.length;
    const deepestRing = Object.keys(depthGroups).reduce((max, key) => Math.max(max, Number(key)), 1);
    const docRadius = ringRadius(count, NODE_BOX.document.width, (deepestRing + 1) * radiusStep);
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

interface ArrangeFocusOptions {
  /** Celular: o arranjo é calculado no tamanho do palco, a zoom 1. */
  compact?: boolean;
  /**
   * Faixas do palco já ocupadas por algo que flutua sobre o mapa — a
   * tarja do nó em foco no topo, o botão de "mostrar mais" embaixo.
   * Sem descontá-las, o anel nasce centrado no palco inteiro e os nós
   * de cima e de baixo aparecem por baixo delas.
   */
  insetTop?: number;
  insetBottom?: number;
}

interface Point {
  x: number;
  y: number;
}

/** Dois cartões se cobrem quando se sobrepõem nos dois eixos. */
function boxesCollide(a: Point, b: Point, aw: number, ah: number, bw: number, bh: number): boolean {
  return Math.abs(a.x - b.x) < (aw + bw) / 2 + 8
    && Math.abs(a.y - b.y) < (ah + bh) / 2 + 8;
}

export function arrangeFocus(cy: cytoscape.Core, focusId?: string, options: ArrangeFocusOptions = {}) {
  const focusNode = focusId ? cy.getElementById(focusId) : cy.nodes().first();
  const focus = focusNode.length ? focusNode : cy.nodes().first();
  if (!focus.length) return;

  const neighbors = cy.nodes()
    .filter((node) => node.id() !== focus.id())
    .sort((left, right) => String(left.data('label')).localeCompare(String(right.data('label')), 'pt-BR'));
  const count = neighbors.length;
  const angleStep = (2 * Math.PI) / Math.max(1, count);
  const angleOffset = -Math.PI / 2;

  const positions: Record<string, { x: number; y: number }> = {
    [focus.id()]: { x: 0, y: 0 },
  };

  const compactMode = options.compact === true;
  const geometry = compactGeometry(cy.width());
  const insetTop = compactMode ? Math.max(0, options.insetTop || 0) : 0;
  const insetBottom = compactMode ? Math.max(0, options.insetBottom || 0) : 0;
  const usableHeight = Math.max(160, cy.height() - insetTop - insetBottom);

  // A altura do cartão sai do rótulo já renderizado — é a única
  // medida confiável, porque quantas linhas um nome ocupa depende da
  // fonte do aparelho. Os valores de `compactGeometry` ficam como
  // reserva para o caso de o cartão ainda não ter sido medido.
  const measuredHeight = (element: cytoscape.SingularElementArgument, fallback: number) => {
    const height = element.isNode() ? element.height() : 0;
    return Number.isFinite(height) && height > 0 ? height : fallback;
  };
  const cardHeight = neighbors.length
    ? Math.max(...neighbors.map((node) => measuredHeight(node, geometry.cardHeight)))
    : geometry.cardHeight;
  const focusHeight = measuredHeight(focus, geometry.rootHeight);

  // Fora do celular, o anel é dimensionado pelo conteúdo e o
  // enquadramento fica por conta do `fit`, como no radar.
  const radiusX = compactMode
    ? Math.max(
        (geometry.rootWidth + geometry.cardWidth) / 2 + geometry.gap,
        cy.width() / 2 - geometry.cardWidth / 2 - geometry.margin,
      )
    : ringRadius(
        count,
        NODE_BOX.default.width,
        Math.round((NODE_BOX.root.width + NODE_BOX.default.width) / 2 + NODE_GAP),
      );

  const ring = (radiusY: number): Point[] => neighbors.map((_, index) => {
    const angle = angleOffset + index * angleStep;
    return {
      x: Math.round(Math.cos(angle) * radiusX),
      y: Math.round(Math.sin(angle) * radiusY),
    };
  });

  const ringIsClear = (points: Point[]) => points.every((point, index) => {
    const { cardWidth: cw, rootWidth: rw } = geometry;
    if (boxesCollide(point, { x: 0, y: 0 }, cw, cardHeight, rw, focusHeight)) return false;
    if (points.length < 2) return true;
    return !boxesCollide(point, points[(index + 1) % points.length], cw, cardHeight, cw, cardHeight);
  });

  // O palco do celular é estreito e alto: `radiusX` está no limite da
  // tela e não pode crescer, então quem abre espaço entre dois
  // cartões vizinhos é a altura do anel. Ela parte do mínimo — dois
  // cartões encostados — e cresce até que nenhum par se cubra.
  const minRadiusY = (focusHeight + cardHeight) / 2 + geometry.gap;
  const availableRadiusY = Math.max(
    minRadiusY,
    usableHeight / 2 - cardHeight / 2 - geometry.margin,
  );

  let radiusY = radiusX;
  if (compactMode) {
    let needed = minRadiusY;
    for (let attempt = 0; attempt < 16 && !ringIsClear(ring(needed)); attempt += 1) {
      needed = Math.round(needed * 1.12);
    }
    // Cabendo na faixa, o anel ainda se abre um pouco para respirar —
    // mas não até a borda: com um vizinho só, ocupar a tela inteira
    // deixava o par a duzentos pixels de distância, ligado por um
    // traço vazio. Não cabendo, ele fica no tamanho que os vizinhos
    // pedidos exigem, e o enquadramento adiante reduz o conjunto.
    radiusY = needed <= availableRadiusY
      ? Math.min(availableRadiusY, Math.round(needed * 1.35))
      : needed;
  }

  const points = ring(radiusY);
  points.forEach((point, index) => {
    positions[neighbors[index].id()] = point;
  });

  cy.nodes().removeClass('is-mobile-focus');
  focus.addClass('is-mobile-focus');
  cy.layout({
    name: 'preset',
    positions,
    // No celular o enquadramento é feito abaixo, sobre as posições já
    // calculadas: o `fit` do Cytoscape centraliza no palco inteiro e
    // não sabe das faixas cobertas pela tarja e pelo botão.
    fit: !compactMode,
    padding: 76,
    animate: true,
    animationDuration: 280,
  } as cytoscape.PresetLayoutOptions).run();

  if (!compactMode) return;

  // Caixa do conjunto em coordenadas do modelo.
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(-geometry.rootWidth / 2, ...xs.map((x) => x - geometry.cardWidth / 2));
  const right = Math.max(geometry.rootWidth / 2, ...xs.map((x) => x + geometry.cardWidth / 2));
  const top = Math.min(-focusHeight / 2, ...ys.map((y) => y - cardHeight / 2));
  const bottom = Math.max(focusHeight / 2, ...ys.map((y) => y + cardHeight / 2));

  // Um enquadramento só para os dois casos: o anel que coube sai a
  // zoom 1 — é para isso que ele foi desenhado no tamanho do palco —
  // e o que não coube encolhe até caber. Nos dois, o centro do
  // conjunto vai para o centro da faixa livre, e não do palco: é o que
  // impede que o nó de cima nasça atrás da tarja do foco.
  const framePadding = 12;
  const scale = Math.min(
    1,
    (cy.width() - framePadding * 2) / Math.max(1, right - left),
    (usableHeight - framePadding * 2) / Math.max(1, bottom - top),
  );

  cy.viewport({
    zoom: scale,
    pan: {
      x: cy.width() / 2 - scale * ((left + right) / 2),
      y: insetTop + usableHeight / 2 - scale * ((top + bottom) / 2),
    },
  });
}

interface ArrangeChainOptions {
  /** Celular: cartão menor, calha estreita e um piso de zoom. */
  compact?: boolean;
}

/**
 * Abaixo deste zoom o cartão deixa de ser legível e o mapa vira
 * decoração. A rede completa num celular raramente cabe inteira; é
 * preferível mostrá-la no menor tamanho ainda legível e deixar o
 * dedo arrastar do que encolher tudo até ninguém ler nada.
 */
const COMPACT_MIN_ZOOM = 0.62;

export function arrangeChain(cy: cytoscape.Core, rootId?: string, options: ArrangeChainOptions = {}) {
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
  const compactMode = options.compact === true;
  const widestCard = cy.nodes().reduce(
    (widest, node) => Math.max(widest, node.width() || 0),
    compactMode ? compactGeometry(cy.width()).cardWidth : NODE_BOX.default.width,
  );
  const columnWidth = compactMode ? widestCard + 62 : NODE_BOX.default.width + 120;
  // O cartão cresce com o nome; a linha acompanha o mais alto, senão
  // um nome de quatro linhas encosta no cartão de baixo.
  const tallestCard = cy.nodes().reduce(
    (tallest, node) => Math.max(tallest, node.height() || 0),
    NODE_BOX.default.height,
  );
  const rowHeight = tallestCard + (compactMode ? 22 : 34);
  // Sete linhas por subcoluna produzem um bloco quase quadrado até
  // umas cinquenta entidades. Acima disso o arranjo virava uma faixa
  // horizontal de catorze subcolunas: o `fit` então encolhia tudo pela
  // largura e sobrava metade da tela vazia em cima e embaixo. A raiz
  // quadrada mantém o bloco proporcional ao que há para desenhar.
  const totalToPlace = cy.nodes().length;
  const maxRowsPerColumn = Math.max(7, Math.ceil(Math.sqrt(Math.max(1, totalToPlace))));
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
    // No celular o enquadramento é feito à mão logo abaixo, para
    // poder impor o piso de zoom; por isso o arranjo não anima aqui.
    fit: !compactMode,
    padding: 70,
    animate: !compactMode,
    animationDuration: 360,
  } as cytoscape.PresetLayoutOptions).run();

  if (compactMode) {
    cy.fit(cy.elements(), 20);
    if (cy.zoom() < COMPACT_MIN_ZOOM) {
      cy.zoom(COMPACT_MIN_ZOOM);
      cy.center(root);
    }
  }
}

/* ==========================================================
   PALETA DO MAPA
   ==========================================================
   Cada tipo tem borda e um preenchimento claro da mesma família. A
   borda sozinha não bastava: com 2px, qualquer zoom abaixo de 0,6 a
   dissolve, e o mapa vira uma coleção de retângulos brancos iguais —
   era preciso abrir a legenda para saber o que era pessoa e o que
   era empresa. O preenchimento sobrevive à redução; é ele que
   carrega o tipo quando o traço já não se vê.
   ========================================================== */
const TYPE_PAINT = {
  company: { border: '#2D60AD', fill: '#F1F6FC' },
  person: { border: '#7C4DBE', fill: '#F7F2FD' },
  publicOffice: { border: '#0E7490', fill: '#ECF9FB' },
  document: { border: '#8FA3AE', fill: '#F4F7F8' },
  root: { border: '#FCB315', fill: '#FFF9EC' },
  risk: { border: '#DC2626', fill: '#FEF1F1' },
} as const;

export const CYTOSCAPE_STYLESHEET: cytoscape.StylesheetStyle[] = [
  /* ==========================================================
     Nós em cartão sobre tela clara.

     O grafo era escuro e usava formas geométricas com o rótulo por
     fora, o que obrigava a consultar a legenda para saber o que cada
     forma significava e deixava a tela do mapa incoerente com o resto
     do sistema. Agora cada nó é um cartão com o texto dentro, a cor
     da borda e do preenchimento indicando o tipo, no mesmo
     vocabulário visual do dossiê.
     ========================================================== */
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      shape: 'roundrectangle',
      'background-color': TYPE_PAINT.company.fill,
      'border-width': 2,
      'border-color': TYPE_PAINT.company.border,
      color: '#142630',
      'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif',
      'font-size': '10px',
      'font-weight': 600,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-max-width': `${NODE_BOX.default.textMaxWidth}px`,
      'text-wrap': 'wrap',
      // Quebra na fronteira de palavra. Com `anywhere`, o mapa
      // escrevia "MARIA APARECIDA DE SOUZA CAVALCANTI LI / NS" e
      // "CONSTRUTORA HORIZ / ONTE": nome partido no meio da sílaba
      // lê-se pior do que nome cortado no fim.
      width: NODE_BOX.default.width,
      // A largura é fixa, para os cartões alinharem; a altura vem do
      // rótulo. Fixá-la também era supor quantas linhas um nome ocupa,
      // e a suposição depende da fonte que o aparelho tem instalada:
      // no mesmo nome, o cartão que cabia no desktop transbordava a
      // borda no celular. Medir é mais barato do que adivinhar.
      height: 'label',
      padding: '8px',
      'transition-property': 'border-color, background-color, width, height, opacity',
      'transition-duration': 180,
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-company',
    style: {
      'border-color': TYPE_PAINT.company.border,
      'background-color': TYPE_PAINT.company.fill,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-person',
    style: {
      'border-color': TYPE_PAINT.person.border,
      'background-color': TYPE_PAINT.person.fill,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-publicoffice',
    style: {
      'border-color': TYPE_PAINT.publicOffice.border,
      'background-color': TYPE_PAINT.publicOffice.fill,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node.type-document',
    style: {
      'border-color': TYPE_PAINT.document.border,
      'background-color': TYPE_PAINT.document.fill,
      color: '#465B67',
      width: NODE_BOX.document.width,
      'text-max-width': `${NODE_BOX.document.textMaxWidth}px`,
      'font-size': `${NODE_BOX.document.fontSize}px`,
    } as unknown as cytoscape.Css.Node,
  },
  {
    /* A empresa investigada usa o dourado institucional, o mesmo que a
       marca o cartão de identificação do dossiê. */
    selector: 'node.is-root',
    style: {
      width: NODE_BOX.root.width,
      'text-max-width': `${NODE_BOX.root.textMaxWidth}px`,
      'border-width': 3,
      'border-color': TYPE_PAINT.root.border,
      'background-color': TYPE_PAINT.root.fill,
      'font-size': `${NODE_BOX.root.fontSize}px`,
      'font-weight': 700,
    } as unknown as cytoscape.Css.Node,
  },
  {
    /* Ocorrência de controle externo é o único nó que o mapa pinta de
       vermelho: é onde está o risco, e precisa saltar. */
    selector: 'node.has-risk',
    style: {
      'border-color': TYPE_PAINT.risk.border,
      'background-color': TYPE_PAINT.risk.fill,
      color: '#991B1B',
    } as cytoscape.Css.Node,
  },

  /* ==========================================================
     CARTÃO DO CELULAR
     A largura vem de `compactGeometry`, calculada a partir do palco:
     é o maior cartão que ainda deixa um vizinho inteiro à esquerda e
     à direita do nó em foco sem sair da tela. Como é lido a zoom 1, a
     fonte pode ser a mesma do desktop e desta vez chega íntegra ao
     olho.
     ========================================================== */
  {
    selector: 'node.is-compact',
    style: {
      width: (node: cytoscape.NodeSingular) => compactGeometry(node.cy().width()).cardWidth,
      'text-max-width': (node: cytoscape.NodeSingular) => (
        `${compactGeometry(node.cy().width()).cardWidth - 16}px`
      ),
      'font-size': '10px',
      padding: '7px',
    } as unknown as cytoscape.Css.Node,
  },
  {
    selector: 'node.is-compact.is-compact-focus',
    style: {
      width: (node: cytoscape.NodeSingular) => compactGeometry(node.cy().width()).rootWidth,
      'text-max-width': (node: cytoscape.NodeSingular) => (
        `${compactGeometry(node.cy().width()).rootWidth - 18}px`
      ),
      'font-size': '11px',
      'font-weight': 700,
      'border-width': 3,
    } as unknown as cytoscape.Css.Node,
  },

  {
    /* Nó de grupo: traço interrompido e fundo neutro. A forma precisa
       dizer, antes de qualquer leitura, que ali não há uma entidade e
       sim várias — um nó cheio no meio de nós cheios seria lido como
       mais um órgão, e não como quarenta. */
    selector: 'node.is-group',
    style: {
      'border-style': 'dashed',
      'border-width': 2,
      'border-color': '#6B6F76',
      'background-color': '#EDEBE4',
      color: '#43474D',
      'font-weight': 700,
      shape: 'roundrectangle',
    } as unknown as cytoscape.Css.Node,
  },
  {
    /* A ligação do grupo é uma só representando muitas: mais grossa,
       e interrompida como o nó. */
    selector: 'edge.is-group-edge',
    style: {
      'line-style': 'dashed',
      'line-color': '#8A8F97',
      'target-arrow-color': '#8A8F97',
      width: 3,
    } as cytoscape.Css.Edge,
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
      color: '#465B67',
      'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif',
      'font-size': '9px',
      'font-weight': 600,
      // Etiqueta sempre na horizontal. Com `autorotate` ela girava
      // junto com o traço, e numa ligação quase vertical acabava
      // escrita de lado — texto virado é sempre mais lento de ler do
      // que texto reto, mesmo quando cabe.
      'text-rotation': 'none',
      'text-margin-y': -8,
      'text-max-width': '96px',
      'text-wrap': 'ellipsis',
      'text-background-color': '#FFFFFF',
      'text-background-opacity': 1,
      'text-background-padding': '3px',
      'text-background-shape': 'roundrectangle',
      'text-border-color': '#E7EEF1',
      'text-border-width': 1,
      'text-border-opacity': 1,
      'transition-property': 'line-color, target-arrow-color, width, opacity',
      'transition-duration': 180,
    } as unknown as cytoscape.Css.Edge,
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
    /* Era branca sobre branco desde a conversão para tela clara: a
       ligação selecionada simplesmente desaparecia. */
    selector: 'edge:selected',
    style: {
      'line-color': '#163768',
      'target-arrow-color': '#163768',
      width: 4,
      'underlay-color': '#2D60AD',
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
