import type { SourceQueryStatus } from './sourceStatus.types';

export interface FundNetworkIdentifier {
  type: string;
  value: string;
  provider?: string;
  confidence?: number;
}

export interface FundNetworkEntity {
  key: string;
  type: string;
  name: string;
  role: string;
  depth: number;
  confidence: number;
  properties: Record<string, unknown>;
  identifiers?: FundNetworkIdentifier[];
}

export interface FundNetworkRelationship {
  key: string;
  sourceKey: string;
  targetKey: string;
  type: string;
  label: string;
  status: string;
  confidence: number;
  properties: Record<string, unknown>;
}

export interface FundNetworkEvidence {
  entityKey?: string;
  relationshipKey?: string;
  provider: string;
  sourceName: string;
  sourceUrl?: string | null;
  query?: string | null;
  identifier?: string | null;
  excerpt?: string | null;
  confidence?: number;
  retrievedAt: string;
}

export interface FundRegistryProfile {
  cnpj: string;
  name: string;
  cvmFundCode?: string | null;
  fundType?: string | null;
  registrationStatus?: string | null;
  fiscalYearStart?: string | null;
  fiscalYearEnd?: string | null;
  netAssetValue?: number | null;
  netAssetValueDate?: string | null;
}

export interface FundNetworkSummary {
  ok: boolean;
  status?: number;
  applicable: boolean;
  /** Estado canônico da consulta; ausente em dossiês anteriores a esta camada. */
  sourceStatus?: SourceQueryStatus;
  provider: string;
  fund?: FundRegistryProfile;
  fundClass?: {
    cnpj: string;
    name: string;
    type?: string;
    status?: string;
    netAssetValue?: number | null;
    netAssetValueDate?: string | null;
  } | null;
  directParties?: number;
  expandedCompanies?: number;
  expansionFailures?: number;
  consultaParcial?: boolean;
  entities: FundNetworkEntity[];
  relationships: FundNetworkRelationship[];
  evidences: FundNetworkEvidence[];
  sourceUrl?: string;
  dataUrl?: string;
  consultadoEm?: string;
  aviso?: string;
  erro?: string;
}
