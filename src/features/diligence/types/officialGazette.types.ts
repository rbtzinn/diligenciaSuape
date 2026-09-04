import type { EntityMatch } from './adverseMedia.types';
import type { SourceQueryStatus } from './sourceStatus.types';

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
  /** Identidade resolvida sobre os trechos publicados. */
  entityMatch?: EntityMatch;
}

export interface OfficialGazetteSubject {
  type: 'company' | 'person';
  name: string;
  qualification?: string | null;
  ok: boolean;
  totalFound: number;
  returned: number;
  /** Nem chegou a ser consultado: o orçamento de tempo da rota acabou antes. */
  notStarted?: boolean;
  timedOut?: boolean;
  erro?: string;
}

export interface OfficialGazetteDiscardedResult {
  id: string;
  date?: string | null;
  territoryName?: string;
  url?: string | null;
  subjectName?: string;
  level: 'FALSE_POSITIVE';
  score: number;
  basis: string;
}

export interface OfficialGazetteSummary {
  ok: boolean;
  sourceStatus?: SourceQueryStatus;
  provider?: string;
  query?: string;
  totalFound: number;
  returned: number;
  results: OfficialGazetteResult[];
  consultadoEm: string;
  scope?: string;
  partial?: boolean;
  peopleSearched?: number;
  /** Sujeitos que concluíram, que falharam e que nem começaram. */
  completedSubjects?: number;
  failedSubjects?: number;
  unavailableSubjects?: number;
  duplicateSubjects?: number;
  deadlineExceeded?: boolean;
  discardedResults?: OfficialGazetteDiscardedResult[];
  falsePositivesDiscarded?: number;
  subjects?: OfficialGazetteSubject[];
  aviso?: string;
  erro?: string;
}
