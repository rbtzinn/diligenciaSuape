// ==========================================================
// DILIGÊNCIA 360 — Serviço de Consultas de Diligência
// Comunicação isolada com o backend Express
// ==========================================================

import { request } from '../../../lib/api';
import { CNPJ } from '../../../lib/cnpj';
import {
  CompanyData,
  SanctionsResult,
  PepPartnerResult,
  JudicialProcessResponse,
  AdverseMediaSummary,
  OfficialGazetteSummary,
  CorporateNetworkSummary,
  OffshoreSummary,
  Shareholder,
  GovernanceHistoryResult,
  FundNetworkSummary,
  RiskAssessment,
  PersonSanctionsSummary,
  PncpSummary,
  FederalExposureSummary,
  TcePeSummary,
  TceOpenDataSummary,
} from '../types';

interface CompanyApiResponse {
  ok: boolean;
  fonte?: string;
  consultadoEm?: string;
  erro?: string;
  data?: CompanyData;
}

export const DiligenceService = {
  /**
   * Consulta dados cadastrais e QSA da empresa
   */
  async getCompany(cnpj: string): Promise<CompanyApiResponse> {
    const cleaned = CNPJ.clean(cnpj);
    try {
      return await request<CompanyApiResponse>(`/api/empresa/${cleaned}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta cadastral';
      return { ok: false, erro: message };
    }
  },

  async expandCorporateNetwork(rootCompany: CompanyData): Promise<CorporateNetworkSummary> {
    try {
      return await request<CorporateNetworkSummary>('/api/empresa/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootCompany, maxDepth: 2, maxCompanies: 20 }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na expansão societária';
      return { ok: false, companies: [], relationships: [], erro: message, consultadoEm: new Date().toISOString() };
    }
  },

  async getGovernanceHistory(params: {
    cnpj: string;
    legalNature?: string;
  }): Promise<GovernanceHistoryResult> {
    const cleaned = CNPJ.clean(params.cnpj);
    try {
      return await request<GovernanceHistoryResult>('/api/empresa/governance-history', {
        method: 'POST',
        body: JSON.stringify({ cnpj: cleaned, legalNature: params.legalNature }),
        timeoutMs: 150_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta histórica de governança';
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 5 }, (_, index) => currentYear - 4 + index);
      // Mesma regra do fundo: falha de rede não afirma que a empresa está no
      // escopo do FRE/CVM. O que se sabe é que a consulta não foi concluída.
      return {
        ok: false,
        applicable: false,
        sourceStatus: 'UNAVAILABLE',
        provider: 'CVM — Formulário de Referência (FRE)',
        years,
        members: [],
        coverage: years.map((year) => ({ year, status: 'unavailable' })),
        coverageStatus: 'unavailable',
        erro: message,
        aviso: 'Não foi possível completar a consulta dos cinco exercícios nesta execução.',
      };
    }
  },

  async getFundNetwork(cnpj: string): Promise<FundNetworkSummary> {
    const cleaned = CNPJ.clean(cnpj);
    try {
      return await request<FundNetworkSummary>('/api/empresa/fund-network', {
        method: 'POST',
        body: JSON.stringify({ cnpj: cleaned }),
        timeoutMs: 150_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha no mapeamento regulatório do fundo';
      // A consulta falhou, então nada se sabe sobre a estrutura deste CNPJ.
      // `applicable: true` aqui afirmava existir fundo de investimento sempre
      // que a rede caía, e o motor de risco cobrava "beneficiário final não
      // visível" de uma LTDA com dois sócios pessoa física.
      return {
        ok: false,
        applicable: false,
        sourceStatus: 'UNAVAILABLE',
        provider: 'CVM — Cadastro de Fundos',
        entities: [],
        relationships: [],
        evidences: [],
        erro: message,
        aviso: 'Não foi possível consultar o cadastro de fundos da CVM. '
          + 'Não é possível afirmar, nem descartar, estrutura de fundo para este CNPJ.',
      };
    }
  },

  /**
   * Consulta sanções no CEIS (Inidôneas e Suspensas)
   */
  async getCEIS(cnpj: string): Promise<SanctionsResult> {
    const cleaned = CNPJ.clean(cnpj);
    try {
      return await request<SanctionsResult>(`/api/cgu/ceis/${cleaned}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta CEIS';
      return {
        ok: false,
        fonte: 'CGU / CEIS',
        encontrado: false,
        quantidade: 0,
        registros: [],
        erro: message,
      };
    }
  },

  /**
   * Consulta sanções no CNEP (Empresas Punidas / Anticorrupção)
   */
  async getCNEP(cnpj: string): Promise<SanctionsResult> {
    const cleaned = CNPJ.clean(cnpj);
    try {
      return await request<SanctionsResult>(`/api/cgu/cnep/${cleaned}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta CNEP';
      return {
        ok: false,
        fonte: 'CGU / CNEP',
        encontrado: false,
        quantidade: 0,
        registros: [],
        erro: message,
      };
    }
  },

  /**
   * Rastreia sócios pessoa física nos cadastros de sanção.
   * A busca é nominal porque o QSA público não traz o CPF completo.
   */
  async screenPersonSanctions(shareholders: Shareholder[]): Promise<PersonSanctionsSummary> {
    try {
      return await request<PersonSanctionsSummary>('/api/cgu/person-sanctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareholders }),
        timeoutMs: 90_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha no rastreio de sanções dos sócios';
      return {
        ok: false,
        peopleInQsa: shareholders.length,
        peopleSearched: 0,
        totalCandidates: 0,
        strongCandidates: 0,
        coverageStatus: 'UNAVAILABLE',
        erro: message,
        aviso: message,
        resultados: [],
      };
    }
  },

  /**
   * Consulta PEP de sócio/administrador por nome
   */
  async getPEP(name: string): Promise<PepPartnerResult> {
    const trimmed = name.trim();
    try {
      return await request<PepPartnerResult>(`/api/cgu/pep?nome=${encodeURIComponent(trimmed)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta PEP';
      return {
        nome: trimmed,
        ok: false,
        fonte: 'CGU / PEP',
        encontrado: false,
        quantidade: 0,
        registros: [],
        erro: message,
      };
    }
  },

  /**
   * Consulta e enriquece processo judicial no DataJud pelo número CNJ
   */
  async getProcessoJudicial(numeroCNJ: string): Promise<JudicialProcessResponse> {
    const cleaned = numeroCNJ.replace(/\D/g, '');
    try {
      return await request<JudicialProcessResponse>(`/api/judicial/processo/${cleaned}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao consultar processo no DataJud';
      return {
        ok: false,
        status: 500,
        erro: message,
      };
    }
  },

  /**
   * Pesquisa ocorrências e mídia adversa na web
   */
  async searchAdverseMedia(params: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    /** Âncoras geográficas da resolução de identidade; opcionais. */
    municipio?: string;
    uf?: string;
    shareholders?: Shareholder[];
    forceRefresh?: boolean;
    newsOnly?: boolean;
    subjectName?: string;
    queryOffset?: number;
  }): Promise<AdverseMediaSummary> {
    try {
      return await request<AdverseMediaSummary>('/api/adverse-media/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        timeoutMs: 65000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na pesquisa de mídia adversa';
      return {
        ok: false,
        totalFound: 0,
        candidatesCount: 0,
        strongMatches: 0,
        mediumMatches: 0,
        weakMatches: 0,
        companyResultsCount: 0,
        personResultsCount: 0,
        peopleSearched: 0,
        peopleWithCandidates: 0,
        personSearchCompleted: false,
        results: [],
        subjects: [],
        aviso: message,
        consultadoEm: new Date().toISOString(),
      };
    }
  },

  async searchOfficialGazettes(params: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    shareholders?: Shareholder[];
    territoryIds?: string[];
    publishedSince?: string;
  }): Promise<OfficialGazetteSummary> {
    try {
      return await request<OfficialGazetteSummary>('/api/official-gazettes/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        // O servidor tem orçamento próprio de 40 s e devolve resultado parcial
        // ao estourá-lo. O cliente espera um pouco mais do que isso: cortar
        // antes transformava uma consulta bem-sucedida em "timeout" na tela.
        timeoutMs: 55_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta de diários oficiais';
      return {
        ok: false,
        sourceStatus: 'UNAVAILABLE',
        totalFound: 0,
        returned: 0,
        results: [],
        erro: message,
        aviso: 'Não foi possível consultar os diários oficiais. A ausência de resultado não significa ausência de publicação.',
        consultadoEm: new Date().toISOString(),
      };
    }
  },

  async searchOffshore(params: {
    company: { cnpj: string; razaoSocial: string; nomeFantasia?: string };
    shareholders: Shareholder[];
  }): Promise<OffshoreSummary> {
    try {
      return await request<OffshoreSummary>('/api/offshore/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na reconciliação offshore';
      return { ok: false, totalQueries: 0, candidates: [], erro: message, consultadoEm: new Date().toISOString() };
    }
  },

  /**
   * Registra a classificação final definida pelo Compliance sem apagar
   * o cálculo automático nem as evidências que o originaram.
   */
  async overrideRisk(
    diligenceId: string,
    payload: { score: number; level: string; justification: string },
  ): Promise<RiskAssessment> {
    const response = await request<{ ok: boolean; data: RiskAssessment }>(
      `/api/diligences/${encodeURIComponent(diligenceId)}/risk`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return response.data;
  },

  /**
   * Consulta status de saúde do backend e chaves de API
   */
  async getStatus(): Promise<{
    status: string;
    cguConfigurada: boolean;
    buscaWebConfigurada: boolean;
    datajudConfigurada: boolean;
    internalSuape: { available: boolean; people: number; referencePeriod?: string | null };
    database: { connected: boolean; provider: string; message?: string };
    versao: string;
  }> {
    return await request('/api/status');
  },

  /**
   * Contratos publicos no PNCP. Fonte direta, sem depender de buscador.
   * A busca do portal casa o nome no texto do documento; a confirmacao por
   * CNPJ do fornecedor acontece no backend.
   */
  async getPncpContracts(params: { cnpj: string; razaoSocial?: string; nomeFantasia?: string }): Promise<PncpSummary> {
    try {
      return await request<PncpSummary>('/api/pncp/contratos', {
        method: 'POST',
        body: JSON.stringify({
          cnpj: CNPJ.clean(params.cnpj),
          razaoSocial: params.razaoSocial,
          nomeFantasia: params.nomeFantasia,
        }),
        // O servidor tem orçamento de 45 s e a função serverless morre em 60 s.
        // Esperar 90 s aqui só garantia que o cliente veria a função ser
        // encerrada — "Failed to fetch" — em vez de uma resposta parcial.
        timeoutMs: 55_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta ao PNCP';
      return {
        ok: false,
        sourceStatus: 'UNAVAILABLE',
        erro: message,
        aviso: 'Não foi possível consultar o PNCP. A ausência de contrato na tela não autoriza '
          + 'concluir que a empresa não possui contrato público.',
        contratos: [],
        contratacoes: [],
        consultadoEm: new Date().toISOString(),
      };
    }
  },

  /** Contratos e pagamentos do Executivo Federal, confirmados pelo CNPJ. */
  async getFederalExposure(cnpj: string): Promise<FederalExposureSummary> {
    try {
      return await request<FederalExposureSummary>(`/api/cgu/federal-exposure/${CNPJ.clean(cnpj)}`, {
        timeoutMs: 90_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta ao Portal da Transparência';
      return {
        ok: false,
        erro: message,
        contratos: [],
        recursos: null,
        consultadoEm: new Date().toISOString(),
      };
    }
  },

  /** Processos oficiais do TCE-PE em que o nome empresarial consta como interessado. */
  async searchTcePe(params: { cnpj: string; razaoSocial?: string; nomeFantasia?: string }): Promise<TcePeSummary> {
    try {
      return await request<TcePeSummary>('/api/judicial/tce-pe', {
        method: 'POST',
        body: JSON.stringify({
          cnpj: CNPJ.clean(params.cnpj),
          razaoSocial: params.razaoSocial,
          nomeFantasia: params.nomeFantasia,
        }),
        // Eram 90 s numa função que a Vercel encerra aos 60: os últimos
        // 30 s nunca chegavam a existir, e o que o navegador recebia era
        // conexão cortada, não resposta. Agora o servidor tem orçamento
        // de 40 s e devolve o que apurou; o cliente espera um pouco mais
        // do que isso e menos do que a função vive.
        timeoutMs: 55_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta ao TCE-PE';
      return { ok: false, erro: message, processos: [], consultadoEm: new Date().toISOString() };
    }
  },

  /**
   * Dados abertos do TCE-PE: contratos, aditivos, licitações, obras e despesas.
   * Todos os datasets filtram por CPF/CNPJ, e a identidade de cada registro é
   * confirmada pelo documento que a própria fonte publica.
   */
  async getTcePeOpenData(params: { cnpj: string; razaoSocial?: string; nomeFantasia?: string; municipio?: string; uf?: string }): Promise<TceOpenDataSummary> {
    try {
      return await request<TceOpenDataSummary>('/api/judicial/tce-pe/dados-abertos', {
        method: 'POST',
        body: JSON.stringify({ ...params, cnpj: CNPJ.clean(params.cnpj) }),
        // O servidor tem orçamento de 45 s e devolve resultado parcial ao estourá-lo.
        timeoutMs: 55_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta aos dados abertos do TCE-PE';
      return {
        ok: false,
        sourceStatus: 'UNAVAILABLE',
        providers: [],
        contratos: [],
        aditivos: [],
        licitacoes: [],
        obras: [],
        obrasContratacao: [],
        despesas: [],
        fornecedores: [],
        descartados: [],
        erro: message,
        limitacao: 'Não foi possível consultar os dados abertos do TCE-PE. A ausência de registros na '
          + 'tela não significa que a empresa não possua contratos, obras ou despesas no Tribunal.',
        consultadoEm: new Date().toISOString(),
      };
    }
  },
};
