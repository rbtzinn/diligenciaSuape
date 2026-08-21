// ==========================================================
// DILIGÊNCIA 360 — Tipos do Módulo Judicial e Descoberta
// ==========================================================

import { StatusVariant } from '../../../types';

export interface JudicialMovement {
  codigo: number;
  nome: string;
  dataHora: string;
  complementos?: string[];
}

export interface JudicialProcessItem {
  numero: string;
  numeroLimpo: string;
  tribunal: string;
  tribunalNome: string;
  grau: string;
  classe: {
    codigo: number;
    nome: string;
  };
  categoria: {
    id: string;
    label: string;
    badgeVariant: StatusVariant;
  };
  assuntos: Array<{
    codigo: number;
    nome: string;
  }>;
  orgaoJulgador: {
    codigo: number;
    nome: string;
    municipio?: string;
  };
  dataAjuizamento: string;
  nivelSigilo: number;
  sistema: string;
  formato: string;
  ultimaAtualizacao: string;
  totalMovimentos: number;
  movimentos: JudicialMovement[];
  fonte: string;
  consultadoEm: string;
}

export interface JudicialProcessResponse {
  ok: boolean;
  status: number;
  erro?: string;
  numero?: string;
  tribunal?: string;
  numeroLimpo?: string;
  tribunalNome?: string;
  grau?: string;
  classe?: { codigo: number; nome: string };
  categoria?: { id: string; label: string; badgeVariant: StatusVariant };
  assuntos?: Array<{ codigo: number; nome: string }>;
  orgaoJulgador?: { codigo: number; nome: string; municipio?: string };
  dataAjuizamento?: string;
  nivelSigilo?: number;
  sistema?: string;
  formato?: string;
  ultimaAtualizacao?: string;
  totalMovimentos?: number;
  movimentos?: JudicialMovement[];
  fonte?: string;
  consultadoEm?: string;
}

export type DiscoverySourceType =
  | 'manual'
  | 'certificate'
  | 'judicial_gazette'
  | 'official_gazette'
  | 'adverse_media'
  | 'internal_document'
  | 'text_import'
  | 'other';

export interface DiscoverySource {
  type: DiscoverySourceType;
  name: string;
  url?: string;
  consultedAt: string;
  excerpt?: string;
}

export type DiscoveryStatus =
  | 'candidate'
  | 'validated'
  | 'discarded'
  | 'enriched';

export interface ProcessDiscovery {
  id: string;
  processNumber: string;
  formattedProcessNumber: string;
  tribunal: string;
  sources: DiscoverySource[];
  firstDiscoveredAt: string;
  lastUpdated: string;
  status: DiscoveryStatus;
  dataJud?: JudicialProcessItem;
}
