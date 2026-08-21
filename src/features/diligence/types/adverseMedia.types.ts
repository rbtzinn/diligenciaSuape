// ==========================================================
// DILIGÊNCIA 360 — Tipos de Mídia Adversa e Ocorrências Públicas
// ==========================================================

import { ExtractedCNJ } from '../../../lib/cnj';

export type AdverseMediaMatchStrength = 'high' | 'medium' | 'low';

export type AdverseMediaStatus = 'candidate' | 'validated' | 'discarded';

export interface AdverseMediaResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  publishedAt?: string;
  snippet: string;
  queriesMatched: string[];
  matchedTerms: string[];
  categories: string[];
  matchStrength: AdverseMediaMatchStrength;
  companyMatch: {
    corporateName: boolean;
    tradeName: boolean;
    cnpj: boolean;
  };
  processNumbers?: ExtractedCNJ[];
  status: AdverseMediaStatus;
  searchedAt: string;
}

export interface AdverseMediaQueryLog {
  query: string;
  ok: boolean;
  count: number;
  erro?: string;
}

export interface AdverseMediaSummary {
  ok: boolean;
  provider?: string;
  totalFound: number;
  candidatesCount: number;
  strongMatches: number;
  mediumMatches: number;
  weakMatches: number;
  semChave?: boolean;
  aviso?: string;
  results: AdverseMediaResult[];
  queriesExecuted?: AdverseMediaQueryLog[];
  consultadoEm: string;
}
