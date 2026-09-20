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
  /** Nomes efetivamente reconciliados junto ao ICIJ. */
  nomesConsultados?: number;
  /** Nomes que ficaram sem consulta; nunca podem ser lidos como "nada consta". */
  nomesNaoConsultados?: string[];
  /** Verdadeiro quando parte dos nomes não foi consultada. */
  parcial?: boolean;
  avisos?: string[];
}
