// ==========================================================
// DILIGÊNCIA 360 — Tipos de Mídia Adversa e Ocorrências Públicas
// ==========================================================

import { ExtractedCNJ } from '../../../lib/cnj';

export type AdverseMediaMatchStrength = 'high' | 'medium' | 'low';

export type AdverseMediaStatus = 'candidate' | 'validated' | 'discarded';

export type AdverseMediaSubjectType = 'company' | 'person';

export type AdverseMediaIdentityStatus = 'documented-entity' | 'supported' | 'contextual' | 'unverified';

/** Níveis da camada de resolução de identidade da entidade investigada. */
export type EntityMatchLevel = 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'POSSIBLE' | 'FALSE_POSITIVE';

export interface EntityMatchSignal {
  code: string;
  label: string;
  points: number;
  matched: boolean;
  detail?: string;
}

/**
 * Resposta à pergunta "a empresa é realmente a mesma?". Acompanha cada
 * resultado para que o descarte de um item seja auditável, e não silencioso.
 */
export interface EntityMatch {
  level: EntityMatchLevel;
  score: number;
  confidence: number;
  basis: string;
  signals: EntityMatchSignal[];
  matched: {
    cnpj: boolean;
    corporateName: boolean;
    tradeName: boolean;
    municipality: boolean;
    state: boolean;
    partner: boolean;
    partnerName?: string | null;
    knownContract: boolean;
    distinctiveTokenCoverage: number;
  };
}

export interface AdverseMediaDiscardedResult {
  title: string;
  url?: string;
  domain?: string;
  query?: string;
  level: 'FALSE_POSITIVE';
  score: number;
  basis: string;
}

export interface AdverseMediaEntitySummary {
  entityId: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  aliases: string[];
  municipio?: string;
  uf?: string;
  socios: number;
  administradores: number;
}

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
  /** Identidade resolvida; ausente em dossiês salvos antes desta camada. */
  entityMatch?: EntityMatch;
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
  confirmedMatches?: number;
  entity?: AdverseMediaEntitySummary;
  /** Resultados que citavam uma palavra do nome, mas não a empresa. */
  falsePositivesDiscarded?: number;
  falsePositives?: AdverseMediaDiscardedResult[];
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
