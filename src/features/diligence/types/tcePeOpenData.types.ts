// ==========================================================
// DILIGÊNCIA 360 — Dados abertos do TCE-PE (contratos, aditivos, obras)
// ==========================================================
// Contrapartida dos normalizadores de `server/src/services/tce-pe/`.
//
// Todo registro carrega `entityMatch` e `relationshipType`: a pergunta "este
// registro é mesmo desta empresa?" acompanha o dado e não é respondida na tela.
// Nenhum campo aqui expressa risco — a coleta produz fato, e a leitura jurídica
// pertence à análise humana.
// ==========================================================

import type { EntityMatch } from './adverseMedia.types';
import type { SourceQueryStatus } from './sourceStatus.types';
import type { TcePeRelationshipType } from './tcePe.types';
import type { ContractIntelligenceSummary } from './contractIntelligence.types';
import type { DocumentIntelligenceSummary } from './documentIntelligence.types';

/** Proveniência obrigatória de todo registro coletado. */
export interface TceOpenDataEvidence {
  source: string;
  provider: string;
  endpoint: string;
  query: string;
  params: Record<string, string>;
  sourceUrl: string;
  retrievedAt: string;
}

interface TceOpenDataRecord extends TceOpenDataEvidence {
  entityMatch?: EntityMatch;
  relationshipType?: TcePeRelationshipType;
  dedupeKey?: string;
  duplicatesMerged?: number;
  raw?: unknown;
}

export interface TceContract extends TceOpenDataRecord {
  tipo: 'CONTRATO';
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
  cpfCnpj: string;
  cpfCnpjNormalizado: string | null;
  razaoSocial: string | null;
  objeto: string | null;
  vigencia: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  valor: number | null;
  estagio: string | null;
  situacao: string | null;
  linkArquivo: string | null;
}

export interface TceAdditive extends TceOpenDataRecord {
  tipo: 'TERMO_ADITIVO';
  numeroTermoAditivo: string | null;
  anoTermoAditivo: string | null;
  numeroContrato: string | null;
  anoContrato: string | null;
  codigoContrato: string | null;
  unidadeGestora: string | null;
  esfera: string | null;
  esferaNome: string | null;
  municipio: string | null;
  cpfCnpj: string;
  razaoSocial: string | null;
  objetoAditivo: string | null;
  /** Texto tal como a fonte publicou, inclusive com acentos corrompidos. */
  justificativaTermoAditivo: string | null;
  /** Valor bruto com sinal. Negativo indica supressão na origem. */
  valorTermoAditivo: number | null;
  vigencia: string | null;
  estagio: string | null;
  situacao: string | null;
  linkArquivo: string | null;
}

export interface TceBid extends TceOpenDataRecord {
  tipo: 'LICITACAO';
  codigoPL: string | null;
  numeroProcesso: string | null;
  anoProcesso: string | null;
  modalidade: string | null;
  natureza: string | null;
  situacao: string | null;
  estagio: string | null;
  unidadeGestora: string | null;
  objeto: string | null;
  cpfCnpj: string;
  razaoSocial: string | null;
  resultadoHabilitacao: string | null;
  adjudicada: string | null;
  valorAdjudicadoLicitante: number | null;
  valorAdjudicadoLicitacao: number | null;
  valorOrcamentoEstimativo: number | null;
  quantidadeLicitantes: number | null;
  dataSessaoAbertura: string | null;
  dataPublicacaoHomologacao: string | null;
}

export interface TceWork extends TceOpenDataRecord {
  tipo: 'OBRA';
  codigoObra: string | null;
  titulo: string | null;
  municipio: string | null;
  localExecucao: string | null;
  unidadeGestora: string | null;
  naturezaIntervencao: string | null;
  anoInicial: string | null;
  dataInicial: string | null;
  dataUltimaAuditoria: string | null;
  /** Prazo original e prazo aditado, publicados separadamente pela fonte. */
  prazo: number | null;
  prazoAditado: number | null;
}

export interface TceWorkContracting extends TceOpenDataRecord {
  tipo: 'OBRA_CONTRATACAO';
  codigoObra: string | null;
  contratado: string | null;
  cpfCnpj: string;
  municipio: string | null;
}

export interface TceExpense extends TceOpenDataRecord {
  tipo: 'DESPESA';
  esfera: string;
  esferaNome: string;
  unidadeGestora: string | null;
  unidadeOrcamentaria: string | null;
  credor: string | null;
  cpfCnpj: string;
  numeroEmpenho: string | null;
  anoReferencia: string | null;
  dataEmpenho: string | null;
  /** Três estágios distintos. Somá-los contaria o mesmo dinheiro três vezes. */
  valorEmpenhado: number | null;
  valorLiquidado: number | null;
  valorPago: number | null;
  funcao: string | null;
  historico: string | null;
}

export interface TceSupplier extends TceOpenDataRecord {
  tipo: 'FORNECEDOR';
  cpfCnpj: string;
  nome: string | null;
  tipoCredor: string | null;
}

/** Relatório de execução de um provider, consumido pela cobertura. */
export interface TceProviderReport {
  provider: string;
  providerLabel: string;
  endpoint: string;
  category: string;
  status: SourceQueryStatus;
  quantidade: number;
  descartados: number;
  totalLinhasNaFonte: number | null;
  truncado: boolean;
  erros: string[];
  warnings: string[];
  retrievedAt: string;
  queriesExecutadas?: Array<{
    endpoint: string;
    url: string;
    ok: boolean;
    linhas: number;
    totalLinhas: number;
    truncado: boolean;
    erro?: string;
  }>;
}

export interface TceDiscardedRecord {
  tipo: string;
  provider: string;
  razaoSocial: string | null;
  cpfCnpj: string | null;
  numeroContrato: string | null;
  level: string;
  basis: string | null;
  sourceUrl: string | null;
}

export interface TceOpenDataSummary {
  ok: boolean;
  status?: number;
  sourceStatus?: SourceQueryStatus;
  provider?: string;
  sourceUrl?: string;
  consultadoEm?: string;
  entity?: {
    entityId: string;
    cnpj: string | null;
    cnpjNormalizado?: string;
    razaoSocial: string | null;
    municipio?: string | null;
    uf?: string | null;
  };
  providers: TceProviderReport[];
  contratos: TceContract[];
  aditivos: TceAdditive[];
  licitacoes: TceBid[];
  obras: TceWork[];
  obrasContratacao: TceWorkContracting[];
  despesas: TceExpense[];
  fornecedores: TceSupplier[];
  descartados: TceDiscardedRecord[];
  matrizDePesquisa?: {
    planejadas: number;
    consultas: Array<{
      query: string;
      category: string;
      priority: string;
      providers: string[];
      status: string;
      reason: string;
    }>;
  };
  resumo?: {
    contratos: number;
    aditivos: number;
    licitacoes: number;
    obras: number;
    obrasContratacao: number;
    despesas: number;
    fornecedores: number;
    descartados: number;
    valorEmpenhado: number;
    valorLiquidado: number;
    valorPago: number;
    providersConsultados: number;
    providersIndisponiveis: number;
  };
  /** Perfis contratuais construídos sobre esta mesma coleta, sem nova consulta. */
  contractIntelligence?: ContractIntelligenceSummary;
  /** Declara que o dossiê guarda um recorte, e de quanto. */
  projecao?: {
    aplicada: boolean;
    rawRemovido: boolean;
    omissoes: string[];
    nota: string;
  };
  /** Catálogo dos documentos publicados, construído sobre esta mesma coleta. */
  documentIntelligence?: DocumentIntelligenceSummary;
  erro?: string;
  limitacao?: string;
}
