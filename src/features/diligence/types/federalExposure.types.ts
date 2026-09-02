// ==========================================================
// DILIGÊNCIA 360 — Exposição ao Executivo Federal (CGU)
// ==========================================================

export interface FederalContract {
  origem: 'PORTAL_TRANSPARENCIA';
  id?: number;
  numeroContrato?: string;
  numeroProcesso?: string;
  numeroCompra?: string;
  objeto?: string;
  situacao?: string;
  modalidade?: string;
  orgao?: string;
  orgaoCodigo?: string;
  orgaoCnpj?: string;
  orgaoVinculado?: string;
  orgaoVinculadoCodigo?: string;
  orgaoSuperior?: string;
  fornecedorNome?: string;
  fornecedorCnpj?: string;
  fornecedorCnpjFmt?: string;
  cnpjConfirmado: boolean;
  valorInicial?: number;
  valorFinal?: number;
  dataAssinatura?: string;
  dataPublicacao?: string;
  vigenciaInicio?: string;
  vigenciaFim?: string;
  url?: string;
}

export interface FederalResourceAgency {
  codigo?: string;
  nome: string;
  orgaoSuperiorCodigo?: string;
  orgaoSuperior?: string;
  valorTotal: number;
  meses: string[];
  unidades: string[];
}

export interface FederalExposureSummary {
  ok: boolean;
  status?: number;
  erro?: string;
  semChave?: boolean;
  provider?: string;
  sourceUrl?: string;
  consultadoEm?: string;
  cnpjInvestigado?: string;
  consultaParcial?: boolean;
  falhas?: string[];
  contratos: FederalContract[];
  recursos: {
    quantidadeRegistros: number;
    valorTotal: number;
    orgaos: FederalResourceAgency[];
    anos: Array<{ ano: string; valor: number }>;
    periodoInicio?: string;
    periodoFim?: string;
    anosComFalha?: string[];
  } | null;
  resumo?: {
    contratosConfirmados: number;
    valorContratos: number;
    recursosRecebidos: number;
    orgaosContratantes: number;
    orgaosPagadores: number;
  };
  limitacao?: string;
}
