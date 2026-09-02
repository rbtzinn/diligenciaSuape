export type TcePeRelevance = 'high' | 'medium' | 'low';

export interface TcePeProcess {
  processNumber: string;
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

export interface TcePeSummary {
  ok: boolean;
  status?: number;
  erro?: string;
  provider?: string;
  sourceUrl?: string;
  consultadoEm?: string;
  consultaParcial?: boolean;
  variantesPesquisadas?: string[];
  consultas?: Array<{ termo: string; ok: boolean; retornados?: number; erro?: string }>;
  processos: TcePeProcess[];
  resumo?: {
    total: number;
    auditorias: number;
    julgados: number;
    resultadosIrregulares: number;
    altaRelevancia: number;
  };
  limitacao?: string;
}
