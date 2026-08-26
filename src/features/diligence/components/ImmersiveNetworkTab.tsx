// ==========================================================
// DILIGÊNCIA 360 — Aba da Rede Imersiva Relacional EGOS
// 100% alinhada a network-immersive.css
// ==========================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import type { EgosSnapshot } from '../types';
import type {
  DepthFilter,
  FilterState,
  LayoutMode,
  NetworkSelection,
  RouteSummary,
} from './network/types';
import {
  findOptimalRoute,
  isInternalSuapeCandidate,
  isPepCandidate,
  KINSHIP_RELATIONSHIPS,
  normalizeText,
  RELATION_TYPE_LABELS,
  touches,
  visibleEntity,
} from './network/networkUtils';
import {
  arrangeChain,
  arrangeRadar,
  buildCytoscapeElements,
  CYTOSCAPE_STYLESHEET,
  focusNeighborhood,
  pulseRoute,
  syncGraphVisualScale,
} from './network/networkGraphConfig';
import { NetworkToolbar } from './network/NetworkToolbar';
import { NetworkInspector } from './network/NetworkInspector';
import { NetworkLegend } from './network/NetworkLegend';
import { Icons } from '../../../components/ui/Icons';
import { ReportService } from '../../report/services/report.service';
import '../../../styles/network-immersive.css';

interface ImmersiveNetworkTabProps {
  diligenceId: string;
  egos?: EgosSnapshot;
  targetCompanyName?: string;
}

export const ImmersiveNetworkTab: React.FC<ImmersiveNetworkTabProps> = ({
  diligenceId,
  egos,
  targetCompanyName = 'Empresa analisada',
}) => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('radar');
  const [depth, setDepth] = useState<DepthFilter>('all');
  const [relationFilter, setRelationFilter] = useState('all');
  const [showDocuments, setShowDocuments] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selection, setSelection] = useState<NetworkSelection | null>(null);
  const [exportingEntityId, setExportingEntityId] = useState<string | null>(null);
  const [entityReportError, setEntityReportError] = useState('');
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGraphReady, setIsGraphReady] = useState(false);

  const wrapperRef = useRef<HTMLElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const routeTimersRef = useRef<number[]>([]);
  const filtersRef = useRef<FilterState>({ depth, relation: relationFilter, showDocuments });
  const layoutRef = useRef<LayoutMode>(layoutMode);

  const entities = useMemo(() => egos?.entities || [], [egos?.entities]);
  const relationships = useMemo(() => egos?.relationships || [], [egos?.relationships]);
  const evidences = useMemo(() => egos?.evidences || [], [egos?.evidences]);
  const findings = useMemo(() => egos?.findings || [], [egos?.findings]);
  const resolutions = useMemo(() => egos?.resolutions || [], [egos?.resolutions]);

  const reviewCount = useMemo(() => (
    findings.filter((f) => f.status === 'REVIEW').length
  ), [findings]);

  const rootEntity = useMemo(() => {
    if (!entities.length) return undefined;
    const normalizedTarget = normalizeText(targetCompanyName);
    return entities.find((entity) => entity.role.toUpperCase() === 'ROOT')
      || entities.find((entity) => normalizeText(entity.name) === normalizedTarget)
      || entities.find((entity) => entity.depth === 0)
      || entities[0];
  }, [entities, targetCompanyName]);

  const relationTypes = useMemo(() => {
    const labels = new Map<string, string>();
    relationships.forEach((rel) => {
      labels.set(rel.type, RELATION_TYPE_LABELS[rel.type] || rel.label || rel.type);
    });
    return [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [relationships]);

  const relationOptions = useMemo(() => [
    { value: 'all', label: 'Todas' },
    ...relationTypes.map(([value, label]) => ({ value, label })),
  ], [relationTypes]);

  const visibleEntities = useMemo(() => entities.filter((entity) => visibleEntity(entity, {
    depth,
    relation: relationFilter,
    showDocuments,
  })), [depth, entities, relationFilter, showDocuments]);

  const selectedEntity = useMemo(() => (
    selection?.kind === 'node' ? entities.find((e) => e.id === selection.id) : undefined
  ), [entities, selection]);

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

  // Inicialização e atualização do Cytoscape
  useEffect(() => {
    if (!graphRef.current) return;

    filtersRef.current = { depth, relation: relationFilter, showDocuments };
    layoutRef.current = layoutMode;

    const elements = buildCytoscapeElements(entities, relationships, rootEntity, filtersRef.current, searchTerm);

    if (!cyRef.current) {
      const cy = cytoscape({
        container: graphRef.current,
        elements,
        style: CYTOSCAPE_STYLESHEET,
        boxSelectionEnabled: false,
        autounselectify: false,
        wheelSensitivity: 0.55,
        minZoom: 0.15,
        maxZoom: 3.5,
      });

      cy.on('tap', 'node', (evt) => {
        const node = evt.target;
        setSelection({ kind: 'node', id: node.id() });
        focusNeighborhood(cy, node.id());
      });

      cy.on('tap', 'edge', (evt) => {
        const edge = evt.target;
        setSelection({ kind: 'edge', id: edge.id() });
      });

      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          setSelection(null);
          setRoute(null);
          cy.elements().removeClass('is-dimmed is-route-active');
          cy.animate({ fit: { eles: cy.elements(), padding: 60 }, duration: 400 });
        }
      });

      cy.on('zoom pan', () => syncGraphVisualScale(cy));

      cyRef.current = cy;
      setIsGraphReady(true);
    } else {
      const cy = cyRef.current;
      cy.batch(() => {
        cy.elements().remove();
        cy.add(elements);
      });
      syncGraphVisualScale(cy);
    }

    const cy = cyRef.current;
    if (layoutMode === 'radar') {
      arrangeRadar(cy, rootEntity?.id);
    } else {
      arrangeChain(cy, rootEntity?.id);
    }
  }, [entities, relationships, rootEntity, depth, relationFilter, showDocuments, layoutMode, searchTerm]);

  // Download contextual de PDF da entidade (otimizado sem bloqueios)
  const downloadSelectedEntityReport = async () => {
    if (!selectedEntity || exportingEntityId) return;
    setEntityReportError('');
    setExportingEntityId(selectedEntity.id);
    try {
      const snapshot = {
        id: diligenceId,
        razaoSocial: targetCompanyName,
        egos,
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
    if (cyRef.current) {
      cyRef.current.animate({ fit: { eles: cyRef.current.elements(), padding: 60 }, duration: 400 });
    }
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
        cyRef.current.animate({ fit: { eles: cyRef.current.elements(), padding: 60 }, duration: 400 });
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

  return (
    <section
      ref={wrapperRef}
      className={`network-investigation ${isFullscreen ? 'is-fullscreen' : ''}`}
      aria-label="Ambiente de Exploração Relacional EGOS"
    >
      {/* Header oficial do ambiente investigativo */}
      <header className="network-investigation-header">
        <div className="network-workspace-mark" aria-hidden="true">
          <Icons.Network size={22} />
        </div>
        <div className="network-title-block">
          <span>Mapa Relacional · Ambiente Investigativo</span>
          <h2>Quem se liga a quem</h2>
          <p>
            <strong>{targetCompanyName}</strong> · Selecione uma entidade para entender vínculos e evidências.
          </p>
        </div>
        <div className="network-facts">
          <span><strong>{entities.length}</strong> entidades</span>
          <span><strong>{relationships.length}</strong> relações</span>
          <span className={reviewCount > 0 ? 'has-review' : ''}>
            <strong>{reviewCount}</strong> em revisão
          </span>
        </div>
      </header>

      {/* Barra de ferramentas */}
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
        onToggleDocuments={handleToggleDocuments}
        onFit={handleFit}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Palco do grafo e painel lateral */}
      <div className={`network-canvas-grid ${selectedEntity || selectedRelationship ? 'panel-open' : ''}`}>
        <div className="network-canvas-wrap">
          <div className="network-canvas" ref={graphRef} />
          {!isGraphReady && (
            <div className="network-loading">
              <Icons.Loader size={18} />
              <span>Carregando topologia relacional...</span>
            </div>
          )}
          <NetworkLegend
            visibleCount={visibleEntities.length}
            totalCount={entities.length}
          />
        </div>

        <NetworkInspector
          selectedEntity={selectedEntity}
          selectedRelationship={selectedRelationship}
          sourceEntity={sourceEntity}
          targetEntity={targetEntity}
          route={route}
          onTraceRoute={handleTraceRoute}
          onClearSelection={() => {
            setSelection(null);
            setRoute(null);
            if (cyRef.current) {
              cyRef.current.elements().removeClass('is-dimmed is-route-active');
              cyRef.current.animate({ fit: { eles: cyRef.current.elements(), padding: 60 }, duration: 400 });
            }
          }}
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
        />
      </div>
    </section>
  );
};
