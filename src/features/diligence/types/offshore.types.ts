export interface OffshoreCandidate {
  sourceType: 'company' | 'person';
  sourceName: string;
  sourceReference: string;
  id: string;
  name: string;
  description: string;
  offshoreType: string;
  score: number;
  reconciliationMatch: boolean;
  confidence: number;
  url: string;
}

export interface OffshoreSummary {
  ok: boolean;
  provider?: string;
  totalQueries: number;
  candidates: OffshoreCandidate[];
  consultadoEm: string;
  disclaimer?: string;
  erro?: string;
}
