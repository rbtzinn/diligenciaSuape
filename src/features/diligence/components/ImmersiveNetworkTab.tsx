// ==========================================================
// DILIGÊNCIA 360 — Aba da Rede Imersiva Relacional EGOS
// Mapa relacional sobre os primitivos de layout do projeto.
// ==========================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../types';
import type {
  DepthFilter,
  FilterState,
  LayoutMode,
  NetworkSelection,
  RouteSummary,
} from './network/types';
import {
  filterGraphEntities,
  findOptimalRoute,
  isCoreRelationalEntity,
  isInternalSuapeCandidate,
  isPepCandidate,
  KINSHIP_RELATIONSHIPS,
  normalizeText,
  projectFocusGraph,
  relationshipMatchesFilter,
  RELATION_TYPE_LABELS,
  touches,
} from './network/networkUtils';
import {
  arrangeFocus,
  arrangeChain,
  arrangeRadar,
  buildCytoscapeElements,
  CYTOSCAPE_STYLESHEET,
  focusNeighborhood,
  pulseRoute,
} from './network/networkGraphConfig';
import { NetworkToolbar } from './network/NetworkToolbar';
import { NetworkInspector } from './network/NetworkInspector';
import { NetworkLegend } from './network/NetworkLegend';
import { projectNetworkDocuments } from './network/networkDocumentProjection';
import { clusterNetwork } from './network/networkClustering';
import { InvestigationOverviewPanel } from './network/InvestigationOverviewPanel';
import { Icons } from '../../../components/ui/Icons';
import { ReportService } from '../../report/services/report.service';
import { ensureEgosSnapshot } from '../utils/fallbackEgos';
import { extractEntityCnpj } from '../utils/entityCnpj';
import { useCompanyPeek } from '../hooks/useCompanyPeek';
import { cn } from '../../../lib/cn';
import { PageHeader } from '../../../components/layout/Page';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';

const MOBILE_NETWORK_BREAKPOINT = '(max-width: 760px)';
const MOBILE_NEIGHBOR_PAGE_SIZE = 6;
const DESKTOP_NEIGHBOR_LIMIT = 8;

/* Faixas do palco que ficam por baixo de algo flutuante no celular: a
   tarja do nó em foco no topo e a linha de botão/dica embaixo. O
   arranjo do grafo desconta as duas, de modo que nenhum cartão nasça
   escondido atrás delas. */
const MOBILE_STAGE_INSET_TOP = 46;
const MOBILE_STAGE_INSET_BOTTOM = 52;

function useCompactNetworkViewport() {
  const [isCompact, setIsCompact] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_NETWORK_BREAKPOINT).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_NETWORK_BREAKPOINT);
    const update = () => setIsCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isCompact;
}

interface ImmersiveNetworkTabProps {
  diligence: DiligenceItem;
  adverseMedia?: AdverseMediaSummary;
  discoveries: ProcessDiscovery[];
  workflowStatus?: string;
  isExportingPdf: boolean;
  onWorkflowStatusChange: (status: string) => void;
  onExportPdf: () => void;
  onEditRisk: () => void;
  onOpenPeople: () => void;
  onOpenSanctions: () => void;
  onOpenMedia: () => void;
  onOpenProcesses: () => void;
  onOpenQuestionnaire: () => void;
  onOpenAudit: () => void;
  onOpenEvidence: () => void;
  onOpenAiAnalysis: () => void;
  onOpenPncp: () => void;
  onDrillCompany?: (cnpj: string, name: string) => void;
  /** Volta para a aba do dossiê. O mapa é uma aba, não uma tela solta. */
  onBackToDossier?: () => void;
}

export const ImmersiveNetworkTab: React.FC<ImmersiveNetworkTabProps> = ({
  diligence,
  adverseMedia,
  discoveries,
  workflowStatus,
  isExportingPdf,
  onWorkflowStatusChange,
  onExportPdf,
  onEditRisk,
  onOpenPeople,
  onOpenSanctions,
  onOpenMedia,
  onOpenProcesses,
  onOpenQuestionnaire,
  onOpenAudit,
  onOpenEvidence,
  onOpenAiAnalysis,
  onOpenPncp,
  onDrillCompany,
  onBackToDossier,
}) => {
  const { id: diligenceId } = diligence;
  const isCompactViewport = useCompactNetworkViewport();
  // Espiadas de empresas vinculadas, guardadas por CNPJ enquanto o
  // mapa está aberto: voltar a um nó já consultado não repete a busca.
  const { peeks, consultar: peekCompany, reconsultar: repeekCompany } = useCompanyPeek();
  const egos = useMemo(() => ensureEgosSnapshot(diligence), [diligence]);
  const targetCompanyName = diligence.razaoSocial || 'Empresa analisada';
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('chain');
  const [depth, setDepth] = useState<DepthFilter>('2');
  const [relationFilter, setRelationFilter] = useState('confirmed');
  const [showDocuments, setShowDocuments] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selection, setSelection] = useState<NetworkSelection | null>(null);
  const [exportingEntityId, setExportingEntityId] = useState<string | null>(null);
  const [entityReportError, setEntityReportError] = useState('');
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGraphReady, setIsGraphReady] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isMobileSheetExpanded, setIsMobileSheetExpanded] = useState(false);
  const [isMobileFullNetwork, setIsMobileFullNetwork] = useState(false);
  const [mobileFocusEntityId, setMobileFocusEntityId] = useState<string>();
  const [mobileTrail, setMobileTrail] = useState<string[]>([]);
  const [mobileNeighborLimit, setMobileNeighborLimit] = useState(MOBILE_NEIGHBOR_PAGE_SIZE);
  // No desktop o mapa também abre por ramos: mostra o entorno imediato
  // e troca para os vínculos do nó selecionado, sem formar uma teia.
  const [desktopFocusEntityId, setDesktopFocusEntityId] = useState<string>();
  // Grupos que o analista abriu. Fechado é o padrão: o mapa começa
  // legível e cresce por escolha, não por acaso.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const wrapperRef = useRef<HTMLElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const routeTimersRef = useRef<number[]>([]);
  const filtersRef = useRef<FilterState>({ depth, relation: relationFilter, showDocuments });
  const compactViewportRef = useRef(isCompactViewport);
  compactViewportRef.current = isCompactViewport;
  const mobileFullNetworkRef = useRef(isMobileFullNetwork);
  mobileFullNetworkRef.current = isMobileFullNetwork;

  const networkData = useMemo(() => projectNetworkDocuments(
    egos?.entities || [],
    egos?.relationships || [],
    egos?.evidences || [],
    adverseMedia,
    targetCompanyName
  ), [adverseMedia, egos?.entities, egos?.evidences, egos?.relationships, targetCompanyName]);
  const { entities: rawEntities, relationships: rawRelationships, evidences, documentCount } = networkData;

  // A raiz é identificada no conjunto bruto: o agrupamento precisa
  // saber quem ela é para nunca recolhê-la, e ele roda antes.
  const rootEntityId = useMemo(() => {
    if (!rawEntities.length) return undefined;
    const normalizedTarget = normalizeText(targetCompanyName);
    const found = rawEntities.find((entity) => String(entity.role || '').toUpperCase() === 'ROOT')
      || rawEntities.find((entity) => normalizeText(entity.name) === normalizedTarget)
      || rawEntities.find((entity) => entity.depth === 0)
      || rawEntities[0];
    return found?.id;
  }, [rawEntities, targetCompanyName]);

  // Folhas repetidas — dezenas de órgãos contratantes pendurados no
  // mesmo nó pela mesma relação — viram um nó de grupo com a
  // contagem. O agrupamento roda sobre o conjunto completo, e não
  // sobre o já filtrado, de propósito: assim o grau de cada nó é o
  // real, e quem faz ponte entre dois ramos nunca é recolhido por
  // parecer folha num recorte.
  const clustered = useMemo(
    () => clusterNetwork(rawEntities, rawRelationships, rootEntityId, expandedGroups),
    [expandedGroups, rawEntities, rawRelationships, rootEntityId],
  );
  const entities = clustered.entities;
  const relationships = clustered.relationships;

  const rootEntity = useMemo(
    () => entities.find((entity) => entity.id === rootEntityId),
    [entities, rootEntityId],
  );
  const findings = useMemo(() => egos?.findings || [], [egos?.findings]);
  const resolutions = useMemo(() => egos?.resolutions || [], [egos?.resolutions]);

  const reviewCount = useMemo(() => (
    findings.filter((f) => f.status === 'REVIEW').length
  ), [findings]);

  useEffect(() => {
    if (!rootEntity) return;
    setMobileFocusEntityId((current) => (
      current && entities.some((entity) => entity.id === current) ? current : rootEntity.id
    ));
    setMobileTrail((current) => (
      current.length > 0 && current[0] === rootEntity.id ? current : [rootEntity.id]
    ));
  }, [entities, rootEntity]);

  const mobileFocusEntity = useMemo(() => (
    entities.find((entity) => entity.id === mobileFocusEntityId) || rootEntity
  ), [entities, mobileFocusEntityId, rootEntity]);

  const mobileFocusProjection = useMemo(() => projectFocusGraph(
    entities,
    relationships,
    mobileFocusEntity?.id,
    mobileNeighborLimit
  ), [entities, mobileFocusEntity?.id, mobileNeighborLimit, relationships]);

  const desktopFocusProjection = useMemo(() => projectFocusGraph(
    entities,
    relationships,
    desktopFocusEntityId || rootEntity?.id,
    DESKTOP_NEIGHBOR_LIMIT,
  ), [desktopFocusEntityId, entities, relationships, rootEntity?.id]);

  const mobileFullEntities = useMemo(() => filterGraphEntities(
    entities,
    relationships,
    { depth: '2', relation: 'core', showDocuments: false },
    rootEntity?.id
  ), [entities, relationships, rootEntity?.id]);

  const mobileFullRelationships = useMemo(() => {
    const entityIds = new Set(mobileFullEntities.map((entity) => entity.id));
    return relationships.filter((relationship) => (
      entityIds.has(relationship.sourceEntityId)
      && entityIds.has(relationship.targetEntityId)
      && relationshipMatchesFilter(relationship, 'core')
    ));
  }, [mobileFullEntities, relationships]);

  const relationTypes = useMemo(() => {
    const labels = new Map<string, string>();
    relationships.forEach((rel) => {
      labels.set(rel.type, RELATION_TYPE_LABELS[rel.type] || rel.label || rel.type);
    });
    return [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [relationships]);

  const relationOptions = useMemo(() => [
    { value: 'confirmed', label: 'Somente confirmadas' },
    { value: 'core', label: 'Societárias e de gestão' },
    { value: 'all', label: 'Todas' },
    ...relationTypes.map(([value, label]) => ({ value, label })),
  ], [relationTypes]);

  const graphEntities = isCompactViewport
    ? (isMobileFullNetwork ? mobileFullEntities : mobileFocusProjection.entities)
    : desktopFocusProjection.entities;
  const graphRelationships = isCompactViewport
    ? (isMobileFullNetwork ? mobileFullRelationships : mobileFocusProjection.relationships)
    : desktopFocusProjection.relationships;
  const displayedEntities = isCompactViewport ? graphEntities : desktopFocusProjection.entities;
  const displayedRelationshipCount = isCompactViewport
    ? graphRelationships.length
    : desktopFocusProjection.relationships.length;
  const remainingMobileNeighbors = Math.max(
    0,
    mobileFocusProjection.totalNeighbors - mobileFocusProjection.visibleNeighbors
  );

  const selectedEntity = useMemo(() => (
    selection?.kind === 'node' ? entities.find((e) => e.id === selection.id) : undefined
  ), [entities, selection]);

  const selectedEntityCnpj = useMemo(() => extractEntityCnpj(selectedEntity), [selectedEntity]);

  const selectedRelationship = useMemo(() => (
    selection?.kind === 'edge' ? relationships.find((r) => r.id === selection.id) : undefined
  ), [relationships, selection]);

  const sourceEntity = useMemo(() => (
    selectedRelationship ? entities.find((e) => e.id === selectedRelationship.sourceEntityId) : undefined
  ), [entities, selectedRelationship]);

  const targetEntity = useMemo(() => (
    selectedRelationship ? entities.find((e) => e.id === selectedRelationship.targetEntityId) : undefined
  ), [entities, selectedRelationship]);

  const selectedConnections = useMemo(() => {
    if (!selectedEntity) return [];
    return relationships
      .filter((rel) => touches(rel, selectedEntity.id))
      .map((rel) => {
        const otherId = rel.sourceEntityId === selectedEntity.id ? rel.targetEntityId : rel.sourceEntityId;
        const other = entities.find((e) => e.id === otherId);
        if (!other) return null;
        return {
          relationship: rel,
          entity: other,
          evidenceCount: evidences.filter((ev) => ev.relationshipId === rel.id).length,
          direction: (rel.sourceEntityId === selectedEntity.id ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [entities, evidences, relationships, selectedEntity]);

  const selectedEvidence = useMemo(() => {
    if (!selectedEntity && !selectedRelationship) return [];
    if (selectedEntity) {
      return evidences.filter((ev) => ev.entityId === selectedEntity.id);
    }
    return evidences.filter((ev) => ev.relationshipId === selectedRelationship?.id);
  }, [evidences, selectedEntity, selectedRelationship]);

  const selectedFindings = useMemo(() => {
    if (!selectedEntity && !selectedRelationship) return [];
    if (selectedEntity) {
      return findings.filter((f) => f.entityId === selectedEntity.id);
    }
    return findings.filter((f) => f.relationshipId === selectedRelationship?.id);
  }, [findings, selectedEntity, selectedRelationship]);

  const selectedPepMatches = useMemo(() => {
    if (!selectedEntity) return [];
    return resolutions
      .filter((res) => res.sourceEntityId === selectedEntity.id || res.candidateEntityId === selectedEntity.id)
      .map((resolution) => {
        const candidate = entities.find((e) => e.id === resolution.candidateEntityId);
        const source = entities.find((e) => e.id === resolution.sourceEntityId);
        return { resolution, candidate, source, counterpart: resolution.sourceEntityId === selectedEntity.id ? candidate : source };
      })
      .filter((ctx) => isPepCandidate(ctx.candidate));
  }, [entities, resolutions, selectedEntity]);

  const selectedSuapeLinks = useMemo(() => {
    if (!selectedEntity) return [];
    const list: Array<{ internalPerson: (typeof entities)[0]; direct: boolean; resolution?: (typeof resolutions)[0] }> = [];
    if (isInternalSuapeCandidate(selectedEntity)) {
      list.push({ internalPerson: selectedEntity, direct: true });
    }
    return list;
  }, [selectedEntity]);

  const selectedKinshipLinks = useMemo(() => {
    if (!selectedEntity) return [];
    return relationships
      .filter((rel) => touches(rel, selectedEntity.id) && KINSHIP_RELATIONSHIPS.has(rel.type))
      .map((rel) => {
        const otherId = rel.sourceEntityId === selectedEntity.id ? rel.targetEntityId : rel.sourceEntityId;
        const relative = entities.find((e) => e.id === otherId);
        return {
          relationship: rel,
          relative,
          evidenceCount: evidences.filter((ev) => ev.relationshipId === rel.id).length,
        };
      });
  }, [entities, evidences, relationships, selectedEntity]);

  const selectedPersonOccurrences = useMemo(() => {
    if (!selectedEntity) return [];
    return relationships
      .filter((rel) => touches(rel, selectedEntity.id))
      .map((rel) => {
        const otherId = rel.sourceEntityId === selectedEntity.id ? rel.targetEntityId : rel.sourceEntityId;
        const doc = entities.find((e) => e.id === otherId && e.type === 'Document');
        if (!doc) return null;
        const evidence = evidences.find((ev) => ev.relationshipId === rel.id);
        return { relationship: rel, document: doc, evidence };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [entities, evidences, relationships, selectedEntity]);

  /**
   * Reenquadra o mapa no modo em que ele está.
   *
   * No desktop isso é um `fit`. No celular não pode ser: o arranjo
   * compacto é desenhado no tamanho do palco e enquadrado descontando
   * as faixas cobertas pela tarja e pelo botão — um `fit` ali
   * devolvia o mapa encolhido e centrado no palco inteiro, que é
   * exatamente o defeito que o arranjo existe para evitar. Tocar no
   * fundo, limpar a busca ou usar "centralizar" caíam todos nesse
   * `fit`.
   */
  const reframeGraph = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed()) return;
    if (!compactViewportRef.current) {
      cy.animate({ fit: { eles: cy.elements(), padding: 60 }, duration: 400 });
      return;
    }
    if (mobileFullNetworkRef.current) {
      arrangeChain(cy, rootEntity?.id, { compact: true });
      return;
    }
    arrangeFocus(cy, mobileFocusEntity?.id, {
      compact: true,
      insetTop: MOBILE_STAGE_INSET_TOP,
      insetBottom: MOBILE_STAGE_INSET_BOTTOM,
    });
  };

  // O manipulador de toque no fundo é registrado uma única vez, na
  // criação do Cytoscape; sem esta referência ele ficaria preso na
  // primeira versão de `reframeGraph` e reenquadraria segundo o modo
  // em que o mapa estava naquele instante.
  const reframeGraphRef = useRef(reframeGraph);
  reframeGraphRef.current = reframeGraph;

  // Inicialização e atualização do Cytoscape
  useEffect(() => {
    if (!graphRef.current) return;

    filtersRef.current = isCompactViewport
      ? { depth: 'all', relation: 'all', showDocuments: false }
      : { depth, relation: relationFilter, showDocuments };
    // No celular, na exploração por ramos, o mapa é desenhado no
    // tamanho do palco: cartão menor, nome ajustado ao cartão e o
    // vínculo escrito na segunda linha do vizinho.
    const compactBuild = isCompactViewport
      ? { focusId: isMobileFullNetwork ? undefined : mobileFocusEntity?.id }
      : undefined;
    const elements = buildCytoscapeElements(
      graphEntities,
      graphRelationships,
      rootEntity,
      filtersRef.current,
      searchTerm,
      compactBuild
    );

    if (!cyRef.current) {
      const cy = cytoscape({
        container: graphRef.current,
        elements,
        style: CYTOSCAPE_STYLESHEET,
        boxSelectionEnabled: false,
        autounselectify: false,
        minZoom: 0.15,
        maxZoom: 3.5,
      });

      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        const nodeId = node.id();

        // Nó de grupo não é entidade: tocar nele abre ou fecha o que
        // ele recolhe, em vez de selecionar algo que não existe.
        if (nodeId.startsWith('grupo:')) {
          setExpandedGroups((current) => {
            const next = new Set(current);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
          });
          return;
        }

        setSelection({ kind: 'node', id: nodeId });
        setIsInspectorOpen(true);
        if (compactViewportRef.current) {
          setIsMobileFullNetwork(false);
          setMobileFocusEntityId(nodeId);
          setMobileNeighborLimit(MOBILE_NEIGHBOR_PAGE_SIZE);
          setMobileTrail((current) => {
            const existingIndex = current.lastIndexOf(nodeId);
            return existingIndex >= 0 ? current.slice(0, existingIndex + 1) : [...current, nodeId];
          });
          setIsMobileSheetExpanded(false);
        } else {
          setDesktopFocusEntityId(nodeId);
          focusNeighborhood(cy, nodeId);
        }
      });

      cy.on('tap', 'edge', (evt) => {
        const edge = evt.target;
        setSelection({ kind: 'edge', id: edge.id() });
        setIsInspectorOpen(true);
        if (compactViewportRef.current) setIsMobileSheetExpanded(true);
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          setSelection(null);
          setRoute(null);
          if (compactViewportRef.current) setIsMobileSheetExpanded(false);
          cy.elements().removeClass('is-dimmed is-route-active');
          reframeGraphRef.current();
        }
      });

      cyRef.current = cy;
      setIsGraphReady(true);
    } else {
      const cy = cyRef.current;
      cy.batch(() => {
        cy.elements().remove();
        cy.add(elements);
      });
    }

    const cy = cyRef.current;
    cy.resize();
    if (isCompactViewport && !isMobileFullNetwork) {
      arrangeFocus(cy, mobileFocusEntity?.id, {
        compact: true,
        insetTop: MOBILE_STAGE_INSET_TOP,
        insetBottom: MOBILE_STAGE_INSET_BOTTOM,
      });
    } else if (isCompactViewport || layoutMode === 'chain') {
      arrangeChain(cy, rootEntity?.id, { compact: isCompactViewport });
    } else if (layoutMode === 'radar') {
      arrangeRadar(cy, rootEntity?.id);
    }
  }, [
    depth,
    graphEntities,
    graphRelationships,
    isCompactViewport,
    isMobileFullNetwork,
    layoutMode,
    mobileFocusEntity?.id,
    relationFilter,
    rootEntity,
    searchTerm,
    showDocuments,
  ]);

  useEffect(() => {
    const container = graphRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    let frameId = 0;
    const resizeGraph = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const cy = cyRef.current;
        if (!cy || cy.destroyed()) return;
        cy.resize();
        // Na exploração por ramos o arranjo é função do tamanho do
        // palco, então mudar de tamanho pede um novo arranjo — não um
        // `fit`, que reintroduziria justamente o encolhimento de que o
        // arranjo compacto existe para fugir.
        if (isCompactViewport && !isMobileFullNetwork) {
          cy.style().update();
          arrangeFocus(cy, mobileFocusEntity?.id, {
            compact: true,
            insetTop: MOBILE_STAGE_INSET_TOP,
            insetBottom: MOBILE_STAGE_INSET_BOTTOM,
          });
          return;
        }
        if (isCompactViewport) {
          cy.style().update();
          arrangeChain(cy, rootEntity?.id, { compact: true });
          return;
        }
        cy.fit(cy.elements(), 60);
      });
    };
    const observer = new ResizeObserver(resizeGraph);
    observer.observe(container);
    resizeGraph();

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [isCompactViewport, isMobileFullNetwork, mobileFocusEntity?.id, rootEntity?.id]);

  // Download contextual de PDF da entidade (otimizado sem bloqueios)
  const downloadSelectedEntityReport = async () => {
    if (!selectedEntity || exportingEntityId) return;
    setEntityReportError('');
    setExportingEntityId(selectedEntity.id);
    try {
      const snapshot = {
        id: diligenceId,
        razaoSocial: targetCompanyName,
        adverseMedia: adverseMedia ? {
          ...adverseMedia,
          results: adverseMedia.results.filter((item) => item.status !== 'discarded'),
        } : adverseMedia,
        egos: egos ? {
          ...egos,
          entities,
          relationships,
          evidences,
          metrics: {
            ...egos.metrics,
            entities: entities.length,
            relationships: relationships.length,
            evidences: evidences.length,
          },
        } : egos,
      };
      await ReportService.downloadEntityReport(diligenceId, selectedEntity.id, snapshot);
    } catch (error) {
      setEntityReportError(error instanceof Error ? error.message : 'Não foi possível gerar o relatório desta entidade.');
    } finally {
      setExportingEntityId(null);
    }
  };

  const handleTraceRoute = () => {
    if (!rootEntity || !selectedEntity || !cyRef.current) return;
    const computed = findOptimalRoute(rootEntity, selectedEntity, entities, relationships, evidences);
    if (computed) {
      setRoute(computed);
      pulseRoute(cyRef.current, computed, routeTimersRef);
    }
  };

  const handleFit = () => {
    reframeGraph();
  };

  const toggleFullscreen = () => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const selectNodeById = (nodeId: string) => {
    setSelection({ kind: 'node', id: nodeId });
    setIsInspectorOpen(true);
    const target = entities.find((entity) => entity.id === nodeId);
    if (isCompactViewport) {
      if (target && isCoreRelationalEntity(target)) {
        setIsMobileFullNetwork(false);
        setMobileFocusEntityId(nodeId);
        setMobileNeighborLimit(MOBILE_NEIGHBOR_PAGE_SIZE);
        setMobileTrail((current) => {
          const existingIndex = current.lastIndexOf(nodeId);
          return existingIndex >= 0 ? current.slice(0, existingIndex + 1) : [...current, nodeId];
        });
        setIsMobileSheetExpanded(false);
      } else {
        setIsMobileSheetExpanded(true);
      }
      return;
    }
    setDesktopFocusEntityId(nodeId);
    if (cyRef.current) {
      cyRef.current.nodes().unselect();
      const node = cyRef.current.getElementById(nodeId);
      if (node.length) {
        node.select();
        focusNeighborhood(cyRef.current, nodeId);
      }
    }
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    if (!term) {
      setSelection(null);
      setRoute(null);
      if (cyRef.current) {
        cyRef.current.elements().removeClass('is-dimmed is-route-active');
        reframeGraph();
      }
    }
  };

  const handleLayoutModeChange = (mode: LayoutMode) => {
    setLayoutMode(mode);
    setSelection(null);
    setRoute(null);
    if (cyRef.current) {
      cyRef.current.elements().removeClass('is-dimmed is-route-active');
    }
  };

  const handleDepthChange = (newDepth: DepthFilter) => {
    setDepth(newDepth);
    setSelection(null);
    setRoute(null);
    if (cyRef.current) {
      cyRef.current.elements().removeClass('is-dimmed is-route-active');
    }
  };

  const handleRelationFilterChange = (newRel: string) => {
    setRelationFilter(newRel);
    setSelection(null);
    setRoute(null);
    if (cyRef.current) {
      cyRef.current.elements().removeClass('is-dimmed is-route-active');
    }
  };

  const handleToggleDocuments = () => {
    setShowDocuments((prev) => !prev);
    setSelection(null);
    setRoute(null);
    if (cyRef.current) {
      cyRef.current.elements().removeClass('is-dimmed is-route-active');
    }
  };

  const handleMobileBack = () => {
    if (mobileTrail.length <= 1) return;
    const nextTrail = mobileTrail.slice(0, -1);
    const previousId = nextTrail[nextTrail.length - 1];
    setMobileTrail(nextTrail);
    setMobileFocusEntityId(previousId);
    setMobileNeighborLimit(MOBILE_NEIGHBOR_PAGE_SIZE);
    setSelection({ kind: 'node', id: previousId });
    setRoute(null);
    setIsMobileSheetExpanded(false);
  };

  const handleToggleMobileFullNetwork = () => {
    setIsMobileFullNetwork((current) => !current);
    setSelection(null);
    setRoute(null);
    setIsMobileSheetExpanded(false);
  };

  const handleOpenMobileSummary = () => {
    setSelection(null);
    setRoute(null);
    setIsInspectorOpen(true);
    setIsMobileSheetExpanded(true);
  };

  const handleClearSelection = () => {
    setSelection(null);
    setRoute(null);
    setIsMobileSheetExpanded(false);
    if (cyRef.current) {
      cyRef.current.elements().removeClass('is-dimmed is-route-active');
      reframeGraph();
    }
  };

  return (
    <section
      ref={wrapperRef}
      aria-label="Ambiente de exploração relacional EGOS"
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col bg-canvas',
        // Em tela cheia a seção sai do fluxo e cobre a janela. Antes
        // isso era uma classe de CSS com `position: fixed` e um
        // z-index literal de 9000, acima de qualquer gaveta.
        isFullscreen && 'z-modal fixed inset-0',
      )}
    >
      <PageHeader
        width="wide"
        sticky={false}
        onBack={onBackToDossier}
        backLabel="Voltar ao dossiê"
        eyebrow={isMobileFullNetwork ? 'Rede completa' : 'Exploração por ramos'}
        title="Mapa de vínculos"
        subtitle={targetCompanyName}
        /* Os contadores só entram no desktop. No celular eles
           desciam para uma fita própria de 44px, repetindo o que a
           faixa flutuante sobre o mapa já diz — e essa altura sai
           direto do palco do grafo, que é o que falta ali. */
        actions={isCompactViewport ? undefined : (
          <>
            <Chip tone="neutral" size="sm">
              {displayedEntities.length} entidades
            </Chip>
            <Chip tone="neutral" size="sm">
              {displayedRelationshipCount} ligações
            </Chip>
            {/* O mapa recolhe folhas repetidas em nós de grupo. Sem
                dizer quantas, o contador afirmaria que o mapa mostra
                tudo — e ele passou a mostrar um resumo. */}
            {clustered.collapsedCount > 0 ? (
              <Chip tone="info" size="sm">
                {clustered.collapsedCount} agrupadas
              </Chip>
            ) : null}
            <Chip tone={reviewCount > 0 ? 'warn' : 'ok'} size="sm" dot>
              {reviewCount} em revisão
            </Chip>
          </>
        )}
      />

      <NetworkToolbar
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        layoutMode={layoutMode}
        onLayoutModeChange={handleLayoutModeChange}
        depth={depth}
        onDepthChange={handleDepthChange}
        relationFilter={relationFilter}
        onRelationFilterChange={handleRelationFilterChange}
        relationOptions={relationOptions}
        showDocuments={showDocuments}
        documentCount={documentCount}
        onToggleDocuments={handleToggleDocuments}
        onFit={handleFit}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        mobileControls={isCompactViewport ? {
          canGoBack: mobileTrail.length > 1,
          isFullNetwork: isMobileFullNetwork,
          onBack: handleMobileBack,
          onToggleFullNetwork: handleToggleMobileFullNetwork,
          onOpenSummary: handleOpenMobileSummary,
        } : undefined}
      />

      {/* Palco do grafo e painel de leitura.
          No desktop são duas colunas; no celular o painel é uma
          folha que sobe da base. Antes as duas formas conviviam no
          mesmo grid de CSS, e em larguras intermediárias o painel
          aparecia como coluna e como folha ao mesmo tempo. */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative min-h-[320px] min-w-0 overflow-hidden bg-surface-subtle">
          {/* Malha de fundo: dá noção de deslocamento ao arrastar. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:radial-gradient(var(--border-default)_1px,transparent_1px)] [background-size:22px_22px]"
          />

          {/* O Cytoscape sobrescreve o `position` do container para
              `relative` assim que monta. Com isso um `absolute
              inset-0` deixa de esticar, e o palco colapsava para
              altura zero — o grafo existia, com os nós certos, e
              simplesmente não tinha onde ser pintado. A altura aqui
              vem de `size-full`, que independe de posicionamento. */}
          <div
            ref={graphRef}
            className={cn(
              'w-full',
              // A folha de leitura é `fixed` e cobre os 132px de baixo.
              // Antes o palco ia até o fim e o grafo era enquadrado
              // contando com uma altura que a folha comia: o anel
              // nascia centrado atrás dela. Encurtar o palco resolve na
              // origem, e sem depender de posicionamento — que é o que
              // o Cytoscape reescreve.
              isCompactViewport ? 'h-[calc(100%-132px)]' : 'h-full',
            )}
          />

          {isCompactViewport ? (
            /* Uma linha, não três: a faixa fica sobre o palco, e cada
               pixel que ela ocupa é um pixel a menos de mapa. */
            <div
              aria-live="polite"
              className="pointer-events-none absolute inset-x-2 top-2 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm"
            >
              <span className="shrink-0 text-2xs font-semibold uppercase tracking-wide text-ink-3">
                {isMobileFullNetwork ? 'Rede' : 'Foco'}
              </span>
              <strong className="min-w-0 flex-1 truncate text-xs font-bold text-ink">
                {isMobileFullNetwork ? targetCompanyName : mobileFocusEntity?.name}
              </strong>
              <span className="num shrink-0 text-2xs text-ink-3">
                {graphRelationships.length} ligações
              </span>
            </div>
          ) : null}

          {isCompactViewport && !isMobileFullNetwork && remainingMobileNeighbors > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMobileNeighborLimit((current) => current + MOBILE_NEIGHBOR_PAGE_SIZE)}
              icon={<Icons.Plus size={15} aria-hidden="true" />}
              className="absolute bottom-[144px] left-3 shadow-md"
            >
              Mostrar mais {Math.min(MOBILE_NEIGHBOR_PAGE_SIZE, remainingMobileNeighbors)}
              <span className="ml-1 text-2xs font-normal opacity-70">
                ({remainingMobileNeighbors} restantes)
              </span>
            </Button>
          ) : null}

          {isCompactViewport
            && !isMobileFullNetwork
            && remainingMobileNeighbors === 0
            && mobileTrail.length <= 1
            && !selection ? (
            <p className="absolute inset-x-3 bottom-[144px] rounded-lg border border-line bg-surface/95 px-3 py-1.5 text-center text-2xs text-ink-2 shadow-sm backdrop-blur-sm">
              Toque numa pessoa ou empresa para abrir aquele ramo.
            </p>
          ) : null}

          {!isGraphReady ? (
            <div className="absolute inset-0 grid place-items-center bg-surface-subtle/80">
              <span className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2 shadow-sm">
                <Icons.Loader size={16} aria-hidden="true" />
                Carregando topologia relacional…
              </span>
            </div>
          ) : null}

          {isCompactViewport ? null : (
            <NetworkLegend
              visibleCount={displayedEntities.length}
              totalCount={rawEntities.length}
              groupedCount={clustered.collapsedCount}
            />
          )}

          {!isInspectorOpen ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsInspectorOpen(true)}
              icon={<Icons.Info size={15} aria-hidden="true" />}
              className="absolute right-3 top-3 shadow-md"
            >
              Abrir resumo
            </Button>
          ) : null}
        </div>

        {isInspectorOpen ? (
          <aside
            className={cn(
              'flex min-w-0 flex-col overflow-hidden border-line bg-surface',
              // Desktop: coluna à direita, com traço à esquerda.
              'lg:min-h-0 lg:border-l',
              // Celular: folha ancorada na base, em duas alturas.
              isCompactViewport
                ? cn(
                    'z-sticky fixed inset-x-0 bottom-0 rounded-t-xl border-t shadow-overlay transition-[max-height] duration-300',
                    isMobileSheetExpanded ? 'max-h-[82dvh]' : 'max-h-[132px]',
                  )
                : 'max-h-none',
            )}
          >
            {isCompactViewport ? (
              <button
                type="button"
                onClick={() => setIsMobileSheetExpanded((current) => !current)}
                aria-expanded={isMobileSheetExpanded}
                aria-controls="mobile-network-sheet-content"
                className="relative flex min-w-0 shrink-0 items-center gap-2.5 border-b border-line-soft px-4 py-2.5 text-left"
              >
                <span aria-hidden="true" className="absolute inset-x-0 top-1.5 mx-auto h-1 w-9 rounded-full bg-line-strong" />

                <span className="min-w-0 flex-1 pt-1">
                  <span className="block text-2xs font-semibold uppercase tracking-wide text-ink-3">
                    {selectedEntity || selectedRelationship ? 'Seleção atual' : 'Resumo da diligência'}
                  </span>
                  <strong className="block truncate text-sm font-bold text-ink">
                    {selectedEntity?.name || selectedRelationship?.label || targetCompanyName}
                  </strong>
                  <span className="block truncate text-2xs text-ink-3">
                    {selectedEntity
                      ? `${selectedConnections.length} conexões · toque para ver fontes`
                      : selectedRelationship
                        ? 'Toque para entender esta ligação'
                        : `${reviewCount} ponto(s) em revisão · toque para abrir`}
                  </span>
                </span>

                {isMobileSheetExpanded ? (
                  <Icons.ChevronDown size={17} aria-hidden="true" className="shrink-0 text-ink-3" />
                ) : (
                  <Icons.ChevronUp size={17} aria-hidden="true" className="shrink-0 text-ink-3" />
                )}
              </button>
            ) : null}

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" id="mobile-network-sheet-content">
              {!selectedEntity && !selectedRelationship ? (
                <InvestigationOverviewPanel
                  diligence={diligence}
                  adverseMedia={adverseMedia}
                  discoveries={discoveries}
                  entityCount={displayedEntities.length}
                  relationshipCount={displayedRelationshipCount}
                  evidenceCount={evidences.length}
                  reviewCount={reviewCount}
                  workflowStatus={workflowStatus}
                  isExportingPdf={isExportingPdf}
                  onWorkflowStatusChange={onWorkflowStatusChange}
                  onClose={() => {
                    if (isCompactViewport) setIsMobileSheetExpanded(false);
                    else setIsInspectorOpen(false);
                  }}
                  onExportPdf={onExportPdf}
                  onEditRisk={onEditRisk}
                  onOpenPeople={onOpenPeople}
                  onOpenSanctions={onOpenSanctions}
                  onOpenMedia={onOpenMedia}
                  onOpenProcesses={onOpenProcesses}
                  onOpenQuestionnaire={onOpenQuestionnaire}
                  onOpenAudit={onOpenAudit}
                  onOpenEvidence={onOpenEvidence}
                  onOpenAiAnalysis={onOpenAiAnalysis}
                  onOpenPncp={onOpenPncp}
                />
              ) : null}

              {selectedEntity || selectedRelationship ? (
                <NetworkInspector
                  selectedEntity={selectedEntity}
                  selectedRelationship={selectedRelationship}
                  sourceEntity={sourceEntity}
                  targetEntity={targetEntity}
                  route={route}
                  onTraceRoute={handleTraceRoute}
                  onClearSelection={handleClearSelection}
                  onSelectNode={selectNodeById}
                  isExportingPdf={exportingEntityId === selectedEntity?.id}
                  onExportEntityPdf={downloadSelectedEntityReport}
                  exportError={entityReportError}
                  selectedConnections={selectedConnections}
                  selectedEvidence={selectedEvidence}
                  selectedFindings={selectedFindings}
                  selectedPepMatches={selectedPepMatches}
                  selectedSuapeLinks={selectedSuapeLinks}
                  selectedKinshipLinks={selectedKinshipLinks}
                  selectedPersonOccurrences={selectedPersonOccurrences}
                  currentCnpj={diligence.cnpj}
                  onDrillCompany={onDrillCompany}
                  companyPeek={selectedEntityCnpj ? peeks[selectedEntityCnpj] : undefined}
                  onPeekCompany={peekCompany}
                  onRepeekCompany={repeekCompany}
                />
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
};
