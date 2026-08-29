// ==========================================================
// DILIGÊNCIA 360 — Tipos de Mídia Adversa e Ocorrências Públicas
// ==========================================================

import { ExtractedCNJ } from '../../../lib/cnj';

export type AdverseMediaMatchStrength = 'high' | 'medium' | 'low';

export type AdverseMediaStatus = 'candidate' | 'validated' | 'discarded';

export type AdverseMediaSubjectType = 'company' | 'person';

export type AdverseMediaIdentityStatus = 'documented-entity' | 'supported' | 'contextual' | 'unverified';

export interface AdverseMediaCoMentionedSubject {
  subjectType: AdverseMediaSubjectType;
  subjectName: string;
  subjectDocument?: string | null;
  matchBasis: Array<'EXACT_NAME' | 'CORPORATE_NAME' | 'TRADE_NAME' | 'CNPJ' | 'MASKED_CPF' | 'COMPANY_CONTEXT'>;
  confidence: number;
}

export interface AdverseMediaRelatedSubject {
  subjectType: AdverseMediaSubjectType;
  subjectName: string;
  subjectQualification?: string;
  subjectDocument?: string | null;
  matchStrength?: AdverseMediaMatchStrength;
  identityStatus?: AdverseMediaIdentityStatus;
  matchBasis?: AdverseMediaCoMentionedSubject['matchBasis'];
  confidence?: number;
}

export interface AdverseMediaProviderAttempt {
  provider?: string;
  providerId?: string;
  channel?: string;
  ok: boolean;
  status?: number;
  resultCount?: number;
  erro?: string;
}

export interface AdverseMediaResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt?: string;
  snippet: string;
  canonicalUrl?: string;
  queriesMatched: string[];
  queryPurposes?: string[];
  providerSources?: string[];
  matchedTerms: string[];
  categories: string[];
  riskRelevant?: boolean;
  matchStrength: AdverseMediaMatchStrength;
  companyMatch: {
    corporateName: boolean;
    tradeName: boolean;
    cnpj: boolean;
  };
  personMatch?: {
    fullName: boolean;
    maskedCpf: boolean;
    companyContext: boolean;
    nameTokenCoverage: number;
  };
  subjectType?: AdverseMediaSubjectType;
  subjectName?: string;
  subjectQualification?: string;
  subjectDocument?: string;
  questionnaireRefs?: string[];
  identityStatus?: AdverseMediaIdentityStatus;
  requiresHumanReview?: boolean;
  coMentionedSubjects?: AdverseMediaCoMentionedSubject[];
  relatedSubjects?: AdverseMediaRelatedSubject[];
  processNumbers?: ExtractedCNJ[];
  status: AdverseMediaStatus;
  searchedAt: string;
}

export interface AdverseMediaQueryLog {
  query: string;
  subjectType?: AdverseMediaSubjectType;
  subjectName?: string;
  ok: boolean;
  status?: number;
  count: number;
  purpose?: string;
  channel?: string;
  partial?: boolean;
  provider?: string;
  providerSources?: string[];
  attempts?: AdverseMediaProviderAttempt[];
  erro?: string;
}

export interface AdverseMediaSubjectSummary {
  name: string;
  qualification?: string;
  searched: boolean;
  queryCount: number;
  candidatesCount: number;
  strongMatches: number;
  exactNameCandidates: number;
}

export interface AdverseMediaSummary {
  ok: boolean;
  provider?: string;
  totalFound: number;
  candidatesCount: number;
  riskRelevantCount?: number;
  generalMentionsCount?: number;
  strongMatches: number;
  mediumMatches: number;
  weakMatches: number;
  companyResultsCount?: number;
  personResultsCount?: number;
  peopleRequested?: number;
  peopleSearched?: number;
  peopleWithCandidates?: number;
  peopleWithRiskRelevant?: number;
  personSearchCompleted?: boolean;
  personSearchTruncated?: boolean;
  expansionQueriesSkipped?: number;
  consultaParcial?: boolean;
  coverageStatus?: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  deadlineExceeded?: boolean;
  queriesPlanned?: number;
  queryPlanVersion?: string;
  providerSources?: string[];
  cached?: boolean;
  semChave?: boolean;
  aviso?: string;
  results: AdverseMediaResult[];
  subjects?: AdverseMediaSubjectSummary[];
  queriesExecuted?: AdverseMediaQueryLog[];
  consultadoEm: string;
}
