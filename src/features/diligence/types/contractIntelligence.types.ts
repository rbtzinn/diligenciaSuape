// ==========================================================
// DILIGÊNCIA 360 — Inteligência contratual (contrato e eventos)
// ==========================================================
// Contrapartida de `server/src/contract-intelligence/`.
//
// Nenhum campo aqui expressa risco, score ou irregularidade: a camada organiza
// fatos publicados pelo TCE-PE em contratos, eventos e linha do tempo. A leitura
// jurídica pertence à análise humana e a fases posteriores.
// ==========================================================

import type { EntityMatch } from './adverseMedia.types';
import type { SourceQueryStatus } from './sourceStatus.types';
import type { TcePeRelationshipType } from './tcePe.types';

export type ContractEventType =
  | 'CONTRACT_CREATED'
  | 'ADDITIVE'
  | 'VALUE_ADDITION'
  | 'VALUE_SUPPRESSION'
  | 'TERM_EXTENSION'
  | 'TERM_REDUCTION'
  | 'QUANTITATIVE_CHANGE'
  | 'QUALITATIVE_CHANGE'
  | 'CONTRACT_CLOSED'
  | 'TERMINATION'
  | 'PAYMENT'
  | 'OTHER';

/** Força do vínculo entre o contrato e um registro de outra natureza. */
export type AssociationConfidence = 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN' | 'NOT_ASSOCIATED';

/** Completude da ordenação cronológica dos eventos. */
export type TimelineOrdering = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';

/**
 * Precisão da data de um evento.
 *
 * `APPROXIMATE` é o caso comum: o TCE-PE não publica data de assinatura de
 * contrato nem de termo aditivo, e a data vem da vigência. A interface precisa
 * mostrar essa diferença — apresentar aproximação como data exata afirmaria um
 * fato que documento nenhum sustenta.
 */
export type DatePrecision = 'EXACT' | 'APPROXIMATE' | 'YEAR_ONLY' | 'UNKNOWN';

export type DateConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/** Entrada da linha do tempo detalhada, com toda a proveniência temporal. */
export interface TimelineEntry {
  id: string;
  kind: 'LICITACAO' | 'CONTRATO' | 'ADITIVO' | 'EMPENHO' | 'PROCESSO';
  type: string;
  types: string[];
  label: string;
  description: string | null;
  eventDate: string | null;
  eventYear: string | null;
  datePrecision: DatePrecision;
  dateConfidence: DateConfidence;
  /** Campo da fonte de onde a data veio. Nulo quando não há data. */
  dateSource: string | null;
  orderingBasis: string | null;
  /** Posição definida por desempate técnico, não por data comprovada. */
  orderWithinDateIsTechnical?: boolean;
  value: number | null;
  /** 'SOURCE' quando publicado pela fonte. Nesta fase nada é calculado. */
  valueOrigin: 'SOURCE' | 'DERIVED' | null;
  vigenciaInicial: string | null;
  vigenciaFinal: string | null;
  associationConfidence: AssociationConfidence | null;
  associationBasis: string | null;
  relationshipType: TcePeRelationshipType | null;
  entityMatch: EntityMatch | null;
  /** Duas datas oficiais divergentes; nenhuma foi escolhida automaticamente. */
  temporalConflict: boolean;
  conflitos: Array<{ valor: string; origem: string }> | null;
  conflitoNota: string | null;
  numeroTermoAditivo: string | null;
  source: string | null;
  endpoint: string | null;
  sourceUrl: string | null;
  linkArquivo: string | null;
  retrievedAt: string | null;
}

export interface ContractTimelineDetailed {
  contractId: string;
  entries: TimelineEntry[];
  ordering: TimelineOrdering;
  /** Vigência publicada. Vigência não é execução. */
  vigencia: { inicial: string | null; final: string | null; nota: string };
  cobertura: {
    totalEventos: number;
    eventosComDataExata: number;
    eventosComDataAproximada: number;
    eventosApenasComAno: number;
    eventosSemData: number;
    conflitosTemporais: number;
    fontesSuccess: number;
    fontesEmpty: number;
    fontesPartial: number;
    fontesUnavailable: number;
  };
  notasDeCobertura: string[];
  aviso: string | null;
  limitacao: string;
}

/** Campo cujo valor não veio do registro, com a origem declarada. */
export interface DerivedField {
  field: string;
  origem: string;
  nota: string;
}

export interface Contract {
  id: string;
  codigoContrato: string | null;
  numeroContrato: string | null;
  anoContrato: string | null;
  codigoPL: string | null;
  numeroProcesso: string | null;
  anoProcesso: string | null;
  tipoProcesso: string | null;
  unidadeGestora: string | null;
  unidadeOrcamentaria: string | null;
  siglaUG: string | null;
  codigoUG: string | null;
  esfera: string | null;
  esferaNome: string | null;
  municipio: string | null;
  uf: string | null;
  cnpj: string | null;
  cnpjNormalizado: string | null;
  razaoSocial: string | null;
  objeto: string | null;
  valorInicial: number | null;
  /** Nulo enquanto a fonte não publicar. Nunca calculado a partir dos aditivos. */
  valorAtualizado: number | null;
  valorAtualizadoDisponivel: boolean;
  vigenciaInicial: string | null;
  vigenciaFinal: string | null;
  vigenciaInicialIso: string | null;
  vigenciaFinalIso: string | null;
  situacao: string | null;
  estagio: string | null;
  relationshipType: TcePeRelationshipType;
  entityMatch: EntityMatch | null;
  source: string | null;
  provider: string | null;
  endpoint: string | null;
  query: string | null;
  sourceUrl: string | null;
  linkArquivo: string | null;
  retrievedAt: string | null;
  derivedFields: DerivedField[];
  compositeKey: string;
}

export interface ContractEvent {
  id: string;
  contractId: string | null;
  type: ContractEventType;
  /** Um termo costuma acumular naturezas — prazo e valor no mesmo instrumento. */
  types: ContractEventType[];
  /** Campo da fonte que sustenta cada natureza atribuída. */
  typeBasis?: string[];
  sequence: number;
  date: string | null;
  year: string | null;
  /** Falso quando a fonte não publica data. A data nunca é inventada. */
  dateKnown: boolean;
  description: string;
  /** Valor bruto, com o sinal da fonte. Negativo indica supressão registrada. */
  value: number | null;
  objeto: string | null;
  justificativa: string | null;
  vigenciaInicial: string | null;
  vigenciaFinal: string | null;
  numeroTermoAditivo: string | null;
  anoTermoAditivo: string | null;
  situacao?: string | null;
  estagio?: string | null;
  relationshipType?: TcePeRelationshipType;
  entityMatch?: EntityMatch | null;
  associationConfidence?: AssociationConfidence;
  associationBasis?: string;
  duplicatesMerged?: number;
  source: string | null;
  endpoint: string | null;
  sourceUrl: string | null;
  linkArquivo: string | null;
  retrievedAt: string | null;
}

export interface ContractTimeline {
  events: ContractEvent[];
  ordering: TimelineOrdering;
  eventosComData: number;
  eventosSemData: number;
  periodo: { inicio: string | null; fim: string } | null;
  aviso: string | null;
}

export interface ContractAssociation {
  tipo: string;
  confidence: AssociationConfidence;
  basis: string;
  sourceUrl?: string | null;
  retrievedAt?: string | null;
  [key: string]: unknown;
}

export interface ContractProfile {
  contrato: Contract;
  eventos: ContractEvent[];
  aditivos: ContractEvent[];
  timeline: ContractTimeline;
  /** Linha do tempo com licitação, empenhos e processos datados. */
  timelineDetalhada?: ContractTimelineDetailed;
  relacionamentos: {
    licitacoes: ContractAssociation[];
    despesas: ContractAssociation[];
    obras: ContractAssociation[];
    obrasLimitacao: string;
  };
  documentos: Array<{ tipo: string; numero?: string | null; url: string; retrievedAt: string | null }>;
  /** Estados por fonte, lado a lado. Nunca colapsados num status global. */
  sourceStatuses: {
    contrato: SourceQueryStatus;
    aditivos: SourceQueryStatus;
    licitacoes: SourceQueryStatus;
    obras: SourceQueryStatus;
    despesas: SourceQueryStatus;
  };
  resumo: {
    totalEventos: number;
    totalAditivos: number;
    aditivosComValorPositivo: number;
    aditivosComValorNegativo: number;
    aditivosSemValor: number;
    documentos: number;
    ordenacaoTemporal: TimelineOrdering;
  };
}

export interface ContractIntelligenceSummary {
  generatedAt: string;
  entity?: { entityId: string; cnpj: string | null; razaoSocial: string | null } | null;
  contratos: ContractProfile[];
  /** Termos cujo contrato de origem não veio na coleta. Preservados, não descartados. */
  aditivosOrfaos: ContractEvent[];
  cobertura: Record<string, { status: SourceQueryStatus; quantidade: number; erros: string[]; warnings: string[] }>;
  resumo: {
    contratos: number;
    aditivos: number;
    aditivosOrfaos: number;
    eventos: number;
    contratosComAditivo: number;
    contratosSemAditivo: number;
    licitacoesAssociadas: number;
    despesasAssociadas: number;
    obrasDaEntidade: number;
    documentos: number;
    timelinesIncompletas: number;
  };
  limitacao: string;
}
