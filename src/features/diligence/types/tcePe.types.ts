import type { EntityMatch } from './adverseMedia.types';
import type { SourceQueryStatus } from './sourceStatus.types';

/** Natureza do vínculo entre a empresa e o processo de controle externo. */
export type TcePeRelationshipType =
  | 'CONTRACTOR'
  | 'PARTY'
  | 'MENTIONED'
  | 'RELATED'
  | 'UNKNOWN'
  | 'FALSE_POSITIVE';

export type TcePeRelevance = 'high' | 'medium' | 'low' | 'none';

export interface TcePeProcess {
  processNumber: string;
  /** Identidade resolvida sobre o interessado e o teor da decisão. */
  entityMatch?: EntityMatch | null;
  relationshipType?: TcePeRelationshipType;
  /** Falso positivo e coincidência incidental não entram na lista principal. */
  relevantToEntity?: boolean;
  attributionBasis?: string | null;
  rawProcessNumber: string;
  interestedName: string;
  matchStrength: 'high' | 'medium';
  confidence: number;
  matchBasis: string;
  type?: string;
  modality?: string;
  organization?: string;
  municipality?: string;
  sphere?: string;
  exercise?: number | null;
  status?: string;
  outcome?: string;
  description?: string;
  rapporteur?: string;
  collegiate?: string;
  judgmentDate?: string;
  decisionNumber?: string;
  processUrl?: string | null;
  decisionUrl?: string | null;
  considerations: string[];
  determinations: string[];
  contractsMentioned: string[];
  relevance: TcePeRelevance;
  attributionWarning: string;
}

export interface TcePeDiscardedProcess {
  processNumber: string;
  interestedName?: string;
  type?: string;
  modality?: string;
  organization?: string;
  exercise?: number | null;
  processUrl?: string | null;
  relationshipType?: TcePeRelationshipType;
  level?: string | null;
  score?: number | null;
  basis?: string | null;
}

export interface TcePeSummary {
  ok: boolean;
  status?: number;
  sourceStatus?: SourceQueryStatus;
  erro?: string;
  provider?: string;
  sourceUrl?: string;
  consultadoEm?: string;
  consultaParcial?: boolean;
  variantesPesquisadas?: string[];
  consultas?: Array<{ termo: string; ok: boolean; retornados?: number; erro?: string }>;
  processos: TcePeProcess[];
  processosDescartados?: TcePeDiscardedProcess[];
  falsePositivesDiscarded?: number;
  resumo?: {
    total: number;
    descartados?: number;
    contratante?: number;
    parte?: number;
    citada?: number;
    auditorias: number;
    julgados: number;
    resultadosIrregulares: number;
    altaRelevancia: number;
  };
  limitacao?: string;
}
