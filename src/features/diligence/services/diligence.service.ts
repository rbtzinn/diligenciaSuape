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
  }): Promise<AdverseMediaSummary> {
    try {
      return await request<AdverseMediaSummary>('/api/adverse-media/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
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
        results: [],
        aviso: message,
        consultadoEm: new Date().toISOString(),
      };
    }
  },

  async searchOfficialGazettes(params: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
  }): Promise<OfficialGazetteSummary> {
    try {
      return await request<OfficialGazetteSummary>('/api/official-gazettes/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na consulta de diários oficiais';
      return { ok: false, totalFound: 0, returned: 0, results: [], erro: message, consultadoEm: new Date().toISOString() };
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
};
