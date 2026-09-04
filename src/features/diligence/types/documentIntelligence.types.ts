// ==========================================================
// DILIGÊNCIA 360 — Catálogo documental
// ==========================================================
// Contrapartida de `server/src/document-intelligence/`.
//
// A separação entre `publishedMetadata` e `extractedFacts` é a razão de estes
// tipos existirem: o primeiro traz o que a fonte publicou no registro, o segundo
// só existe quando alguém efetivamente leu o documento. Exibir metadado como
// "extraído do documento" afirmaria uma leitura que não aconteceu.
//
// Nenhum campo aqui expressa risco. Tipo documental é natureza do papel.
// ==========================================================

import type { SourceQueryStatus } from './sourceStatus.types';
import type { DatePrecision, DateConfidence } from './contractIntelligence.types';

export type DocumentType = 'CONTRACT' | 'ADDITIVE' | 'TENDER' | 'PROCESS' | 'DECISION' | 'OTHER';

/**
 * Estado do CONTEÚDO — não do registro que o referencia.
 *
 * `REFERENCED` e `EMPTY` são opostos que uma lista vazia esconderia: no
 * primeiro existe documento e ninguém o abriu; no segundo a fonte respondeu e
 * não publicou documento algum. `UNAVAILABLE` nunca se converte em `EMPTY`.
 */
export type DocumentContentStatus = 'REFERENCED' | 'AVAILABLE' | 'UNAVAILABLE' | 'EMPTY' | 'ERROR';

export type DocumentExtractionStatus =
  | 'NOT_ATTEMPTED'
  | 'SUCCESS'
  | 'ERROR'
  /** Conteúdo obtido, mas digitalizado: ler exigiria OCR, fora desta fase. */
  | 'OCR_REQUIRED'
  | 'NOT_APPLICABLE';

export type DocumentLinkConfidence = 'CONFIRMED' | 'PROBABLE' | 'CONTEXTUAL' | 'UNKNOWN';

/** Fato publicado pela fonte, com o campo original e a regra preservados. */
export interface PublishedFact {
  field: string;
  value: string | number;
  rule: string;
  origin: 'PUBLISHED_METADATA';
}

export interface DocumentContractRef {
  contractId: string | null;
  codigoContrato: string | null;
  numeroContrato: string | null;
  anoContrato: string | null;
  unidadeGestora: string | null;
}

export interface CatalogedDocument {
  documentId: string;
  documentType: DocumentType;
  title: string;

  // Proveniência.
  source: string | null;
  provider: string | null;
  endpoint: string | null;
  query: string | null;
  sourceStatus: SourceQueryStatus | null;
  /** Endereço do registro na API. */
  sourceUrl: string | null;
  /** Endereço do documento em si, publicado pela fonte. */
  officialUrl: string | null;
  retrievedAt: string | null;

  // Vínculos, com a força declarada.
  relatedEntity: { entityId: string | null; cnpj: string | null; razaoSocial: string | null } | null;
  relatedContract: DocumentContractRef | null;
  relatedAdditive: { numeroTermoAditivo: string | null; anoTermoAditivo: string | null } | null;
  relatedTender: { codigoPL: string | null; numeroProcesso: string | null } | null;
  relatedProcess: { processNumber: string | null; exercise: number | null; relationshipType: string | null } | null;
  linkConfidence: DocumentLinkConfidence;
  linkBasis: string;

  // Datas. Publicação, vigência e coleta permanecem distintas.
  publicationDate: string | null;
  documentDate: string | null;
  documentYear: string | null;
  dateSource: string | null;
  datePrecision: DatePrecision;
  dateConfidence: DateConfidence;
  dateBasis: string | null;

  // Conteúdo.
  contentStatus: DocumentContentStatus;
  contentType: string | null;
  contentBytes: number | null;
  availabilityCheckedAt: string | null;
  availabilityEvidence: string | null;

  // Extração.
  extractionStatus: DocumentExtractionStatus;
  extractionNote: string;
  /** Fatos lidos de dentro do documento. Vazio até que o conteúdo seja lido. */
  extractedFacts: unknown[];
  /** Fatos publicados no registro. Existem sem abrir o documento. */
  publishedMetadata: PublishedFact[];

  dedupeKey?: string | null;
  duplicatesMerged?: number;
  possibleDuplicate?: boolean;
  possibleDuplicateNote?: string;
  raw?: unknown;
}

/** Ausência declarada por fonte, com a formulação que o estado exige. */
export interface DocumentAbsence {
  documentType: string;
  provider: string;
  sourceStatus: SourceQueryStatus;
  documentStatus: DocumentContentStatus;
  nota: string;
}

export interface DocumentIntelligenceSummary {
  generatedAt: string;
  entity?: { entityId?: string; cnpj?: string | null; razaoSocial?: string | null } | null;
  documentos: CatalogedDocument[];
  ausencias: DocumentAbsence[];
  resumo: {
    total: number;
    porTipo: Record<string, number>;
    referenciados: number;
    disponiveis: number;
    indisponiveis: number;
    vazios: number;
    comErro: number;
    comUrlOficial: number;
    exigemOcr: number;
    comFatosExtraidos: number;
    vinculoConfirmado: number;
    vinculoProvavel: number;
    vinculoContextual: number;
    possiveisDuplicatas: number;
    disponibilidadeVerificada: number;
    disponibilidadeNaoVerificada: number;
    verificacaoTruncada: boolean;
  };
  limitacao: string;
}
