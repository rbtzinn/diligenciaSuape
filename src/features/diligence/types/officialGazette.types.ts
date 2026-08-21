export interface OfficialGazetteResult {
  id: string;
  date?: string | null;
  territoryId?: string | null;
  territoryName: string;
  stateCode?: string | null;
  edition?: string | null;
  url?: string | null;
  txtUrl?: string | null;
  excerpts: string[];
  matchStrength: 'high' | 'medium' | 'low';
}

export interface OfficialGazetteSummary {
  ok: boolean;
  provider?: string;
  query?: string;
  totalFound: number;
  returned: number;
  results: OfficialGazetteResult[];
  consultadoEm: string;
  scope?: string;
  erro?: string;
}
