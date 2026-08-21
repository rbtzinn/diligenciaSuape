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

export interface CorporateNetworkSummary {
  ok: boolean;
  provider?: string;
  rootCnpj?: string;
  maxDepth?: number;
  maxCompanies?: number;
  companies: CorporateNetworkCompany[];
  relationships: CorporateNetworkRelationship[];
  failures?: number;
  consultaParcial?: boolean;
  consultadoEm: string;
  erro?: string;
}
