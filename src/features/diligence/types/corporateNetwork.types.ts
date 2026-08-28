import type { CompanyData } from '../types';

export interface CorporateNetworkCompany {
  cnpj: string;
  company: CompanyData;
  depth: number;
  source?: string;
  consultedAt?: string;
}

export interface CorporateNetworkRelationship {
  sourceCnpj: string;
  targetCnpj: string;
  qualification: string;
  joinedAt?: string | null;
  depth: number;
  provider: string;
  consultedAt: string;
}

export interface PersonCorporateGraphPerson {
  id: string;
  name: string;
  maskedCpf?: string | null;
}

export interface PersonCorporateMembership {
  personId: string;
  personName: string;
  maskedCpf?: string | null;
  companyCnpj: string;
  companyName: string;
  isRootCompany: boolean;
  depth: number;
  confidence: number;
  matchBasis: 'EXACT_NAME_AND_MASKED_CPF_HASH' | 'EXACT_NAME_HASH';
  sourceUrl?: string;
}

export interface PersonCorporateExpansion {
  ok: boolean;
  provider: string;
  rootCnpj?: string;
  people: PersonCorporateGraphPerson[];
  peopleFound?: number;
  peopleExpanded?: number;
  peopleTruncated?: boolean;
  memberships: PersonCorporateMembership[];
  relatedCompanies?: number;
  failures?: number;
  consultaParcial?: boolean;
  aviso?: string;
  erro?: string;
  consultadoEm?: string;
}

export interface CorporateNetworkSummary {
  ok: boolean;
  provider?: string;
  rootCnpj?: string;
  maxDepth?: number;
  maxCompanies?: number;
  companies: CorporateNetworkCompany[];
  relationships: CorporateNetworkRelationship[];
  personExpansion?: PersonCorporateExpansion;
  failures?: number;
  consultaParcial?: boolean;
  consultadoEm: string;
  erro?: string;
}
