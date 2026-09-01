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
  subjectType?: 'company' | 'person';
  subjectName?: string;
  subjectQualification?: string | null;
}

export interface OfficialGazetteSubject {
  type: 'company' | 'person';
  name: string;
  qualification?: string | null;
  ok: boolean;
  totalFound: number;
  returned: number;
  erro?: string;
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
  partial?: boolean;
  peopleSearched?: number;
  subjects?: OfficialGazetteSubject[];
  erro?: string;
}
