// ==========================================================
// DILIGÊNCIA 360 — Tipos Principais da Diligência
// ==========================================================

import { RiskLevel, StatusVariant, StepStatus } from '../../types';
import { JudicialProcessItem, ProcessDiscovery } from './types/judicial.types';
import { AdverseMediaSummary } from './types/adverseMedia.types';
import { OfficialGazetteSummary } from './types/officialGazette.types';
import { CorporateNetworkSummary } from './types/corporateNetwork.types';
import { OffshoreSummary } from './types/offshore.types';
import { FundNetworkSummary } from './types/fundNetwork.types';
import { PncpSummary } from './types/pncp.types';
import { FederalExposureSummary } from './types/federalExposure.types';
import { TcePeSummary } from './types/tcePe.types';

export * from './types/judicial.types';
export * from './types/adverseMedia.types';
export * from './types/officialGazette.types';
export * from './types/corporateNetwork.types';
export * from './types/offshore.types';
export * from './types/fundNetwork.types';
export * from './types/aiAnalysis.types';
export * from './types/pncp.types';
export * from './types/federalExposure.types';
export * from './types/tcePe.types';

export interface Shareholder {
  nome_socio: string;
  qualificacao_socio?: string;
  cnpj_cpf_do_socio?: string;
  data_entrada_sociedade?: string;
  data_saida_sociedade?: string;
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

export type GovernanceHistoryCategory = 'director' | 'board' | 'fiscal_council' | 'shareholder';

export interface GovernanceHistorySnapshot {
  id: string;
  name: string;
  category: GovernanceHistoryCategory;
  qualification: string;
  organization?: string;
  document?: string;
  year: number;
  referenceDate?: string;
  electionDate?: string;
  possessionDate?: string;
  firstMandateStart?: string;
  mandateTerm?: string;
  compositionDate?: string;
  lastChangeDate?: string;
  totalSharePercent?: number | null;
  ordinarySharePercent?: number | null;
  preferredSharePercent?: number | null;
  controller?: boolean;
  shareholderAgreement?: boolean;
  sourceDocumentId?: string;
  sourceVersion?: number;
}

export interface GovernanceHistoryMember {
  id: string;
  name: string;
  document?: string;
  categories: GovernanceHistoryCategory[];
  years: number[];
  snapshots: GovernanceHistorySnapshot[];
  qualification: string;
  organization?: string;
  firstSeenExercise: number;
  lastSeenExercise: number;
  presentInLatestExercise: boolean;
  latestSnapshot: GovernanceHistorySnapshot;
}

export interface GovernanceHistoryCoverage {
  year: number;
  status: 'consulted' | 'no_record' | 'unavailable' | 'not_applicable';
  administrators?: number;
  shareholders?: number;
  referenceDate?: string;
  documentId?: string;
  version?: number;
  message?: string;
}

export interface GovernanceHistoryResult {
  ok: boolean;
  status?: number;
  applicable: boolean;
  provider: string;
  years: number[];
  members: GovernanceHistoryMember[];
  coverage: GovernanceHistoryCoverage[];
  coverageStatus: 'complete_public' | 'partial' | 'unavailable' | 'not_applicable';
  directors?: number;
  shareholders?: number;
  consultedYears?: number;
  unavailableYears?: number;
  aviso?: string;
  erro?: string;
  sourceUrl?: string;
  consultadoEm?: string;
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

export interface PersonSanctionSignal {
  code: string;
  label: string;
  matched: boolean;
  weight: number;
  detail: string;
}

export interface PersonSanctionCandidate {
  cadastro: 'CEIS' | 'CNEP';
  sancionado: string;
  documentoSancionado: string;
  orgao: string;
  sancao: string;
  inicio: string;
  fim: string;
  vigente: boolean;
  processo: string;
  fonte: string;
  /** Índice de compatibilidade 0–100. Não é probabilidade nem confirmação. */
  score: number;
  status: string;
  signals: PersonSanctionSignal[];
  requiresHumanReview: boolean;
  identityConfirmed: boolean;
}

export interface PersonSanctionResult {
  nome: string;
  qualificacao: string;
  maskedCpf: string | null;
  consultado: boolean;
  cadastrosIndisponiveis: string[];
  candidatos: PersonSanctionCandidate[];
}

export interface PersonSanctionsSummary {
  ok: boolean;
  provider?: string;
  consultadoEm?: string;
  peopleInQsa: number;
  peopleSearched: number;
  peopleTruncated?: boolean;
  totalCandidates: number;
  strongCandidates: number;
  coverageStatus: 'CONSULTED' | 'PARTIAL' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  aviso?: string;
  limitacao?: string;
  erro?: string;
  resultados: PersonSanctionResult[];
}

export interface RiskDetail {
  criterio: string;
  pontos: number;
  info: string;
  categoria?:
    | 'CADASTRAL'
    | 'INTEGRIDADE'
    | 'PESSOAS_RELACIONADAS'
    | 'ESTRUTURA_SOCIETARIA'
    | 'REDE_EMPRESARIAL'
    | 'SOBREPOSICAO_OPERACIONAL'
    | 'TRANSPARENCIA'
    | 'MIDIA_REPUTACIONAL'
    | 'JUDICIAL'
    | 'OFFSHORE'
    | 'CONTRATOS_PUBLICOS'
    | 'CONTROLE_EXTERNO'
    | 'GOVERNANCA'
    | 'COBERTURA'
    | 'DECISAO_HUMANA';
  natureza?: 'confirmed' | 'indicator' | 'uncertainty' | 'coverage' | 'manual_override';
  confianca?: 'alta' | 'media' | 'baixa';
  requerRevisao?: boolean;
  automaticScore?: number;
  automaticLevel?: string;
  finalScore?: number;
  finalLevel?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ManualRiskOverride {
  score: number;
  level: string;
  reason: string;
  automaticScore: number;
  automaticLevel: string;
  reviewedBy?: string;
  reviewedAt?: string;
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
  automaticScore?: number;
  methodologyVersion?: string;
  manualOverride?: ManualRiskOverride;
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
  identifiers?: Array<{
    identifierType?: string;
    type?: string;
    value: string;
    provider?: string;
    confidence?: number;
  }>;
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
  governanceHistory?: GovernanceHistoryResult;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  personSanctions?: PersonSanctionsSummary;
  pepResults: PepPartnerResult[];
  processosJudiciais?: JudicialProcessItem[];
  processosDescobertos?: ProcessDiscovery[];
  processDiscoveryExecuted?: boolean;
  processDiscoverySources?: string[];
  adverseMedia?: AdverseMediaSummary;
  officialGazettes?: OfficialGazetteSummary;
  corporateNetwork?: CorporateNetworkSummary;
  fundNetwork?: FundNetworkSummary;
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
  pncp?: PncpSummary;
  federalExposure?: FederalExposureSummary;
  tcePe?: TcePeSummary;
}

export interface DiligenceStepConfig {
  id: string;
  label: string;
  icon?: string;
  status: StepStatus;
  detail?: string;
}
