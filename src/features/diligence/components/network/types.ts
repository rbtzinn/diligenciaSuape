// ==========================================================
// DILIGÊNCIA 360 — Tipos da Rede Imersiva EGOS
// ==========================================================

import type {
  EgosEntity,
  EgosEvidenceItem,
  EgosFinding,
  EgosRelationship,
  EgosResolution,
} from '../../types';

export type { EgosFinding };

export type LayoutMode = 'radar' | 'chain';
export type DepthFilter = '1' | '2' | 'all';

export interface NetworkSelection {
  kind: 'node' | 'edge';
  id: string;
}

export interface RouteItem {
  id: string;
  kind: 'node' | 'edge';
  label: string;
}

export interface RouteSummary {
  targetId: string;
  targetName: string;
  hops: number;
  confidence: number | null;
  confirmed: boolean;
  evidenceCount: number;
  nodeIds: string[];
  edgeIds: string[];
  items: RouteItem[];
}

export interface FilterState {
  depth: DepthFilter;
  relation: string;
  showDocuments: boolean;
}

export interface ResolutionContext {
  resolution: EgosResolution;
  source?: EgosEntity;
  candidate?: EgosEntity;
  counterpart?: EgosEntity;
}

export interface SuapeLinkContext {
  internalPerson: EgosEntity;
  organization?: EgosEntity;
  functionalRelationship?: EgosRelationship;
  resolution?: EgosResolution;
  direct: boolean;
}

export interface KinshipContext {
  relationship: EgosRelationship;
  relative?: EgosEntity;
  evidenceCount: number;
}

export interface PersonOccurrenceContext {
  relationship: EgosRelationship;
  document?: EgosEntity;
  evidence?: EgosEvidenceItem;
}

export interface DirectConnectionContext {
  relationship: EgosRelationship;
  entity: EgosEntity;
  evidenceCount: number;
  direction: 'outgoing' | 'incoming';
}
