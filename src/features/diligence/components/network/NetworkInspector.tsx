// ==========================================================
// DILIGÊNCIA 360 — Painel Lateral de Inspeção da Rede Imersiva
// Header limpo com X integrado, sem sobreposições
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
import {
  confidencePercent,
  formatGeneratedAt,
  humanizeProperty,
  isConfirmed,
  safeExternalUrl,
  TYPE_LABELS,
} from './networkUtils';

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
  exportError: string;
  selectedConnections: DirectConnectionContext[];
  selectedEvidence: EgosEvidenceItem[];
  selectedFindings: EgosFinding[];
  selectedPepMatches: ResolutionContext[];
  selectedSuapeLinks: SuapeLinkContext[];
  selectedKinshipLinks: KinshipContext[];
  selectedPersonOccurrences: PersonOccurrenceContext[];
}

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
}) => {
  if (!selectedEntity && !selectedRelationship) return null;

  return (
    <aside
      className="network-inspector"
      aria-label="Detalhes da seleção"
      style={{
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}
    >
      <div
        className="network-inspector-content"
        style={{
          boxSizing: 'border-box',
          padding: '20px 18px 28px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '100%',
        }}
      >
        {selectedEntity && (
          <>
            {/* Header Integrado com Título e Botão Fechar no mesmo alinhamento */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                width: '100%',
                boxSizing: 'border-box',
                borderBottom: '1px solid rgba(41, 77, 107, 0.45)',
                paddingBottom: '14px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="network-panel-kicker">Entidade selecionada</span>
                <h3
                  style={{
                    fontSize: '19px',
                    fontWeight: 700,
                    margin: '4px 0 8px 0',
                    color: '#ffffff',
                    wordBreak: 'break-word',
                    lineHeight: 1.25,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {selectedEntity.name}
                </h3>

                <div className="network-selection-meta" style={{ marginTop: 0 }}>
                  <span>{TYPE_LABELS[selectedEntity.type] || selectedEntity.type}</span>
                  <span>Grau {selectedEntity.depth}</span>
                  {confidencePercent(selectedEntity.confidence) !== null && (
                    <span>{confidencePercent(selectedEntity.confidence)}% de confiança</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={onClearSelection}
                aria-label="Fechar painel"
                title="Fechar painel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#0d2843',
                  border: '1px solid #2a4e70',
                  color: '#9fb5ca',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#173c60';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#0d2843';
                  e.currentTarget.style.color = '#9fb5ca';
                }}
              >
                <Icons.X size={16} />
              </button>
            </div>

            {selectedEntity.role !== 'ROOT' && (
              <button
                type="button"
                className="network-trace-button"
                onClick={onTraceRoute}
                style={{ width: '100%', boxSizing: 'border-box', marginTop: '4px' }}
              >
                <Icons.Compass size={16} />
                <span>Traçar caminho até aqui</span>
                <Icons.ArrowRight size={14} />
              </button>
            )}

            {route && route.targetId === selectedEntity.id && (
              <div className="network-route-metrics">
                <span><strong>{route.hops}</strong> saltos</span>
                <span><strong>{route.confirmed ? '100%' : '50%'}</strong> certeza</span>
                <span><strong>{route.evidenceCount}</strong> provas</span>
              </div>
            )}

            {/* Emissão de PDF contextual da entidade */}
            <div className="network-entity-report-card" style={{ boxSizing: 'border-box', width: '100%' }}>
              <span className="network-entity-report-icon">
                <Icons.FileText size={16} />
              </span>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <strong style={{ display: 'block', wordBreak: 'break-word' }}>Relatório desta entidade</strong>
                <small style={{ display: 'block', wordBreak: 'break-word', marginTop: '2px' }}>
                  Vínculos, achados, notícias e fontes com links clicáveis.
                </small>
              </div>
              <button
                type="button"
                onClick={onExportEntityPdf}
                disabled={isExportingPdf}
                style={{ flexShrink: 0 }}
              >
                {isExportingPdf ? (
                  <>
                    <Icons.Loader size={12} />
                    <span>Gerando...</span>
                  </>
                ) : (
                  <>
                    <Icons.Download size={12} />
                    <span>Baixar PDF</span>
                  </>
                )}
              </button>
              {exportError && <p style={{ gridColumn: '1 / -1', color: '#f87171', margin: 0 }}>{exportError}</p>}
            </div>

            {/* Conexões Diretas / Vizinhança */}
            {selectedConnections.length > 0 && (
              <div className="network-direct-connections" style={{ width: '100%', boxSizing: 'border-box' }}>
                <header>
                  <div>
                    <span>Vizinhança desta entidade</span>
                    <h4>Conexões diretas</h4>
                  </div>
                  <strong>{selectedConnections.length}</strong>
                </header>

                <div className="network-connection-list" style={{ maxHeight: '280px' }}>
                  {selectedConnections.map(({ relationship, entity, direction }) => (
                    <button
                      key={relationship.id}
                      type="button"
                      onClick={() => onSelectNode(entity.id)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '10px minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 10px',
                        textAlign: 'left',
                        boxSizing: 'border-box',
                        width: '100%',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: isConfirmed(relationship.status) ? '#20a77c' : '#f59e0b',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                        <span
                          style={{
                            color: '#72b8f1',
                            fontSize: '8px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            lineHeight: 1.2,
                          }}
                        >
                          {relationship.label} ({direction === 'outgoing' ? 'Saída' : 'Entrada'})
                        </span>
                        <strong
                          style={{
                            color: '#ffffff',
                            fontSize: '11px',
                            lineHeight: 1.35,
                            wordBreak: 'break-word',
                            fontWeight: 600,
                          }}
                        >
                          {entity.name}
                        </strong>
                      </div>
                      <Icons.ArrowRight size={13} style={{ color: '#6aa6dc', flexShrink: 0, marginLeft: '6px' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PEP Alerts */}
            {selectedPepMatches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span className="network-panel-kicker">Cargo Público / PEP</span>
                {selectedPepMatches.map(({ resolution, counterpart }) => (
                  <div
                    key={resolution.id}
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(126, 84, 10, 0.22)',
                      border: '1px solid rgba(252, 179, 21, 0.4)',
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <strong style={{ color: '#f7d995', fontSize: '11px', display: 'block', wordBreak: 'break-word' }}>
                      {counterpart?.name || 'Vínculo PEP'}
                    </strong>
                    <p style={{ color: '#d9e6f3', fontSize: '10px', marginTop: '4px', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {resolution.signals?.find((s) => s.matched)?.detail || 'Apontamento em base oficial de PEP.'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* SUAPE Links */}
            {selectedSuapeLinks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span className="network-panel-kicker">Vínculo Interno SUAPE</span>
                {selectedSuapeLinks.map(({ internalPerson, resolution }) => (
                  <div
                    key={internalPerson.id}
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(45, 96, 173, 0.22)',
                      border: '1px solid #4e7ca8',
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <strong style={{ color: '#9bd6ff', fontSize: '11px', display: 'block', wordBreak: 'break-word' }}>
                      {internalPerson.name}
                    </strong>
                    <p style={{ color: '#d9e6f3', fontSize: '10px', marginTop: '4px', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {resolution?.signals?.find((s) => s.matched)?.detail || 'Possível coincidência com registros internos.'}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Parentesco */}
            {selectedKinshipLinks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span className="network-panel-kicker">Parentesco e Relações Familiares</span>
                {selectedKinshipLinks.map(({ relationship, relative }) => (
                  <div
                    key={relationship.id}
                    style={{
                      padding: '10px 12px',
                      background: '#0a2845',
                      border: '1px solid #294c69',
                      borderRadius: '9px',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                    onClick={() => relative && onSelectNode(relative.id)}
                  >
                    <strong style={{ color: '#fff', fontSize: '11px', display: 'block', wordBreak: 'break-word' }}>
                      {relative?.name}
                    </strong>
                    <small style={{ color: '#91abc3', display: 'block', fontSize: '9.5px', marginTop: '3px' }}>
                      {relationship.label}
                    </small>
                  </div>
                ))}
              </div>
            )}

            {/* Fontes documentais e publicações */}
            {selectedPersonOccurrences.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span className="network-panel-kicker">Fontes documentais e publicações ({selectedPersonOccurrences.length})</span>
                {selectedPersonOccurrences.map(({ relationship, document, evidence }) => (
                  <div
                    key={relationship.id}
                    style={{
                      padding: '12px 14px',
                      background: '#08213b',
                      border: '1px solid #234768',
                      borderRadius: '10px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <strong
                      style={{
                        color: '#ffffff',
                        fontSize: '11px',
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                        display: 'block',
                      }}
                    >
                      {document?.name || relationship.label}
                    </strong>

                    {evidence?.sourceUrl && (
                      <div style={{ paddingTop: '2px' }}>
                        <a
                          href={safeExternalUrl(evidence.sourceUrl) || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 8px',
                            background: 'rgba(45, 96, 173, 0.35)',
                            border: '1px solid #3c6d9d',
                            borderRadius: '6px',
                            color: '#93cbfb',
                            fontSize: '9px',
                            fontWeight: 600,
                            textDecoration: 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>Abrir fonte original</span>
                          <Icons.ExternalLink size={10} />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Dados Cadastrais */}
            {selectedEntity.properties && Object.keys(selectedEntity.properties).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span className="network-panel-kicker">Dados Cadastrais</span>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {Object.entries(selectedEntity.properties).map(([key, value]) => {
                    if (value === null || value === undefined || value === '') return null;
                    return (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '7px 10px',
                          background: '#0a2845',
                          borderRadius: '6px',
                          fontSize: '10px',
                          boxSizing: 'border-box',
                          gap: '8px',
                        }}
                      >
                        <span style={{ color: '#7f98b1', flexShrink: 0 }}>{humanizeProperty(key)}</span>
                        <strong style={{ color: '#fff', wordBreak: 'break-word', textAlign: 'right' }}>
                          {String(value)}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Selected Relationship */}
        {selectedRelationship && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '12px',
                width: '100%',
                borderBottom: '1px solid rgba(41, 77, 107, 0.45)',
                paddingBottom: '14px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="network-panel-kicker">Relação Selecionada</span>
                <h3 style={{ wordBreak: 'break-word', margin: '4px 0 0 0', fontSize: '19px', color: '#fff' }}>
                  {selectedRelationship.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClearSelection}
                aria-label="Fechar painel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#0d2843',
                  border: '1px solid #2a4e70',
                  color: '#9fb5ca',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Icons.X size={16} />
              </button>
            </div>

            <div className="network-selection-meta">
              <span>{isConfirmed(selectedRelationship.status) ? 'Confirmada' : 'Hipótese'}</span>
              <span>{selectedRelationship.type}</span>
            </div>

            <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
              <div
                style={{ padding: '10px 12px', background: '#0a2845', borderRadius: '9px', cursor: 'pointer' }}
                onClick={() => sourceEntity && onSelectNode(sourceEntity.id)}
              >
                <small style={{ color: '#7f98b1', fontSize: '9px', display: 'block', marginBottom: '2px' }}>Origem</small>
                <strong style={{ color: '#fff', display: 'block', fontSize: '11px', wordBreak: 'break-word' }}>
                  {sourceEntity?.name || 'Origem'}
                </strong>
              </div>

              <div style={{ textAlign: 'center', color: '#79c8ff' }}>
                <Icons.ChevronDown size={16} />
              </div>

              <div
                style={{ padding: '10px 12px', background: '#0a2845', borderRadius: '9px', cursor: 'pointer' }}
                onClick={() => targetEntity && onSelectNode(targetEntity.id)}
              >
                <small style={{ color: '#7f98b1', fontSize: '9px', display: 'block', marginBottom: '2px' }}>Destino</small>
                <strong style={{ color: '#fff', display: 'block', fontSize: '11px', wordBreak: 'break-word' }}>
                  {targetEntity?.name || 'Destino'}
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Achados e Apontamentos */}
        {selectedFindings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="network-panel-kicker">Achados ({selectedFindings.length})</span>
            {selectedFindings.map((finding) => (
              <div
                key={finding.id}
                style={{
                  padding: '12px',
                  background: '#0a2845',
                  border: '1px solid #294c69',
                  borderRadius: '9px',
                  boxSizing: 'border-box',
                }}
              >
                <strong style={{ color: '#f7d995', fontSize: '11px', display: 'block', wordBreak: 'break-word' }}>
                  {finding.title}
                </strong>
                <p style={{ color: '#d9e6f3', fontSize: '10px', marginTop: '4px', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {finding.explanation}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Fontes e Evidências */}
        {selectedEvidence.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="network-panel-kicker">Evidências ({selectedEvidence.length})</span>
            {selectedEvidence.map((evidence) => (
              <div
                key={evidence.id}
                style={{
                  padding: '12px',
                  background: '#0a2845',
                  border: '1px solid #294c69',
                  borderRadius: '9px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <strong style={{ color: '#fff', fontSize: '11px', display: 'block', wordBreak: 'break-word' }}>
                  {evidence.sourceName || evidence.provider}
                </strong>
                <p style={{ color: '#a9bed3', fontSize: '9.5px', margin: 0, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {evidence.excerpt}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '9px', color: '#718ba6' }}>
                  <span>{formatGeneratedAt(evidence.retrievedAt)}</span>
                  {evidence.sourceUrl && (
                    <a
                      href={safeExternalUrl(evidence.sourceUrl) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#79c8ff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      <span>Fonte</span> <Icons.ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
