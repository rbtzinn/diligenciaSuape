// ==========================================================
// DILIGÊNCIA 360 — Tipos Principais da Diligência
// ==========================================================

import { RiskLevel, StatusVariant, StepStatus } from '../../types';
import { JudicialProcessItem, ProcessDiscovery } from './types/judicial.types';
import { AdverseMediaSummary } from './types/adverseMedia.types';
import { OfficialGazetteSummary } from './types/officialGazette.types';
import { CorporateNetworkSummary } from './types/corporateNetwork.types';
import { OffshoreSummary } from './types/offshore.types';

export * from './types/judicial.types';
export * from './types/adverseMedia.types';
export * from './types/officialGazette.types';
export * from './types/corporateNetwork.types';
export * from './types/offshore.types';

export interface Shareholder {
  nome_socio: string;
  qualificacao_socio?: string;
  cnpj_cpf_do_socio?: string;
  data_entrada_sociedade?: string;
  faixa_etaria?: string;
  pais?: string;
}

export interface CompanyData {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  natureza_juridica?: string;
  porte?: string;
  descricao_porte?: string;
  cnae_fiscal?: string | number;
  cnae_fiscal_descricao?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
  ddd_telefone_1?: string;
  capital_social?: number;
  qsa?: Shareholder[];
}

export interface SanctionRecord {
  id?: number;
  sancionado?: string;
  documentoSancionado?: string;
  orgao?: string;
  esfera?: string;
  uf?: string;
  sancao?: string;
  inicio?: string;
  fim?: string;
  vigente?: boolean;
  abrangencia?: string;
  processo?: string;
  valorMulta?: string;
  fundamentacao?: string;
  detalhamentoPublicacao?: string;
}

export interface SanctionsResult {
  ok: boolean;
  fonte: string;
  consultadoEm?: string;
  encontrado: boolean;
  quantidade: number;
  vigentes?: number;
  historicas?: number;
  consultaParcial?: boolean;
  aviso?: string;
  semChave?: boolean;
  erro?: string;
  registros: SanctionRecord[];
}

export interface PepRecord {
  nome?: string;
  cpf?: string;
  funcao?: string;
  orgao?: string;
  inicio?: string;
  fim?: string;
  carencia?: string;
}

export interface PepPartnerResult {
  nome: string;
  ok: boolean;
  fonte?: string;
  consultadoEm?: string;
  encontrado: boolean;
  quantidade: number;
  semChave?: boolean;
  erro?: string;
  registros: PepRecord[];
}

export interface RiskDetail {
  criterio: string;
  pontos: number;
  info: string;
}

export interface RiskClassification {
  label: string;
  level: RiskLevel;
  emoji: string;
  variant: StatusVariant;
  color: string;
}

export interface RiskDecision {
  texto: string;
  icone: string;
  descricao: string;
}

export interface RiskAssessment {
  score: number;
  nivel: string;
  cor: StatusVariant;
  emoji: string;
  decisao: string;
  decisaoDesc: string;
  classificacao?: RiskClassification;
  detalhes: RiskDetail[];
}

export interface AnalysisAlert {
  tipo: 'critical' | 'high' | 'medium' | 'info';
  titulo: string;
  texto: string;
  acao?: string;
}

export interface AutomatedAnalysis {
  provider: string;
  tipoAnalise: string;
  disclaimer: string;
  alertas: AnalysisAlert[];
  observacoes: string[];
  resumo: string[];
  totalAlertas: number;
  alertasCriticos: number;
}

export interface AuditEvent {
  time: string;
  txt: string;
  tipo: 'info' | 'warning' | 'error';
}

export type EgosCoverageStatus = 'CONSULTED' | 'PARTIAL' | 'NOT_CONSULTED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
export type EgosFindingStatus = 'OK' | 'REVIEW' | 'INCONCLUSIVE' | 'UNAVAILABLE';
export type EgosSeverity = 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface EgosCoverageItem {
  id?: string;
  axis: string;
  provider: string;
  status: EgosCoverageStatus;
  message: string;
  resultCount: number;
  consultedAt?: string;
  validUntil?: string;
}

export interface EgosEntity {
  id: string;
  key: string;
  type: string;
  name: string;
  normalizedName: string;
  properties: Record<string, unknown>;
  depth: number;
  role: string;
  confidence: number;
}

export interface EgosRelationship {
  id: string;
  key: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceName?: string;
  targetName?: string;
  type: string;
  label: string;
  status: string;
  confidence: number;
  properties: Record<string, unknown>;
}

export interface EgosEvidenceItem {
  id: string;
  entityId?: string | null;
  relationshipId?: string | null;
  provider: string;
  sourceName: string;
  sourceUrl?: string | null;
  query?: string | null;
  identifier?: string | null;
  excerpt?: string | null;
  confidence?: number | null;
  retrievedAt: string;
}

export interface EgosFinding {
  id: string;
  entityId?: string | null;
  relationshipId?: string | null;
  axis: string;
  status: EgosFindingStatus;
  severity: EgosSeverity;
  title: string;
  explanation: string;
  confidence?: number | null;
  reviewStatus: string;
}

export interface EgosResolutionSignal {
  code: string;
  label: string;
  matched: boolean;
  weight: number;
  detail: string;
}

export interface EgosResolution {
  id: string;
  sourceEntityId: string;
  sourceName?: string;
  candidateEntityId: string;
  candidateName?: string;
  score: number;
  status: string;
  signals: EgosResolutionSignal[];
  reviewStatus: string;
}

export interface EgosSnapshot {
  runId: string;
  version: string;
  generatedAt: string;
  metrics: {
    entities: number;
    relationships: number;
    evidences: number;
    findings: number;
    resolutions: number;
    coverage: Record<string, number>;
    statuses: Record<string, number>;
  };
  insights: string[];
  coverage: EgosCoverageItem[];
  entities: EgosEntity[];
  relationships: EgosRelationship[];
  evidences: EgosEvidenceItem[];
  findings: EgosFinding[];
  resolutions: EgosResolution[];
}

export interface DiligenceItem {
  id: string;
  cnpj: string;
  cnpjFmt: string;
  razaoSocial: string;
  nomeFantasia: string;
  dataAnalise: string;
  companySource?: string;
  companyConsultedAt?: string;
  empresa: CompanyData;
  socios: Shareholder[];
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  pepResults: PepPartnerResult[];
  processosJudiciais?: JudicialProcessItem[];
  processosDescobertos?: ProcessDiscovery[];
  processDiscoveryExecuted?: boolean;
  processDiscoverySources?: string[];
  adverseMedia?: AdverseMediaSummary;
  officialGazettes?: OfficialGazetteSummary;
  corporateNetwork?: CorporateNetworkSummary;
  offshore?: OffshoreSummary;
  risco: RiskAssessment;
  analise?: AutomatedAnalysis;
  timeline: AuditEvent[];
  persisted?: boolean;
  avisoPersistencia?: string;
  status?: string;
  createdById?: string;
  reviewedById?: string;
  createdBy?: { id: string; name: string; role?: string };
  reviewedBy?: { id: string; name: string; role?: string };
  returnJustification?: string;
  egos?: EgosSnapshot;
}

export interface DiligenceStepConfig {
  id: string;
  label: string;
  icon?: string;
  status: StepStatus;
  detail?: string;
}
