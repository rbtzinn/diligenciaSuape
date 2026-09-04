// ==========================================================
// DILIGÊNCIA 360 — Tipos do PNCP (contratações públicas)
// ==========================================================

import type { EntityMatch } from './adverseMedia.types';
import type { SourceQueryStatus } from './sourceStatus.types';

export type PncpContractStatus = 'CONFIRMADO' | 'DIVERGENTE' | 'NAO_VERIFICADO';

export interface PncpContract {
  origem: 'PNCP';
  /** Identidade resolvida; CNPJ do fornecedor confirma sozinho no PNCP. */
  entityMatch?: EntityMatch | null;
  numeroControlePncp?: string;
  numeroContrato?: string;
  objeto?: string;
  orgao?: string;
  orgaoCnpj?: string;
  unidade?: string;
  municipio?: string;
  uf?: string;
  esfera?: string;
  modalidade?: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  fornecedorCnpjFmt?: string;
  valorGlobal?: number | null;
  valorInicial?: number | null;
  dataAssinatura?: string;
  vigenciaInicio?: string;
  vigenciaFim?: string;
  status: PncpContractStatus;
  url?: string | null;
  encontradoPor?: string | null;
  erro?: string;
}

export interface PncpProcurement {
  origem: 'PNCP';
  tipo: 'contratacao';
  titulo?: string;
  objeto?: string;
  orgao?: string;
  orgaoCnpj?: string;
  municipio?: string;
  uf?: string;
  modalidade?: string;
  dataPublicacao?: string;
  url?: string | null;
  encontradoPor?: string | null;
  status: 'MENCAO_NAO_CONFIRMADA';
}

export interface PncpQueryLog {
  termo: string;
  tipo: string;
  ok: boolean;
  status?: number | null;
  /** Nem chegou a ser tentada: o orçamento de tempo da rota acabou antes. */
  naoIniciada?: boolean;
  total?: number;
  retornados?: number;
  erro?: string;
}

export interface PncpSummary {
  ok: boolean;
  status?: number;
  sourceStatus?: SourceQueryStatus;
  erro?: string;
  aviso?: string;
  deadlineExceeded?: boolean;
  provider?: string;
  consultadoEm?: string;
  consultaParcial?: boolean;
  cnpjInvestigado?: string;
  variantesPesquisadas?: string[];
  consultas?: PncpQueryLog[];
  contratos?: PncpContract[];
  contratosDivergentes?: PncpContract[];
  contratosNaoVerificados?: PncpContract[];
  contratacoes?: PncpProcurement[];
  resumo?: {
    confirmados: number;
    divergentes: number;
    naoVerificados: number;
    contratacoesMencionadas: number;
    valorTotalConfirmado: number;
    orgaosDistintos: number;
  };
  limitacao?: string;
}
