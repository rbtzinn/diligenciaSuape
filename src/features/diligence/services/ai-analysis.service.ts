// ==========================================================
// DILIGÊNCIA 360 — Serviço da análise consolidada por IA
// ==========================================================

import { request } from '../../../lib/api';
import type { AiAnalysisResult, AiProviderStatus, DiligenceItem } from '../types';

interface AiStatusResponse {
  ok: boolean;
  configurada: boolean;
  provedores: AiProviderStatus[];
  mensagem?: string;
}

export const AiAnalysisService = {
  async getStatus(): Promise<AiStatusResponse> {
    try {
      return await request<AiStatusResponse>('/api/ai/status');
    } catch {
      return { ok: false, configurada: false, provedores: [], mensagem: 'Não foi possível verificar os provedores de IA.' };
    }
  },

  /**
   * A leitura do dossiê inteiro depende do provedor gratuito responder,
   * então o tempo limite é maior que o padrão do cliente HTTP.
   */
  async analyze(diligence: DiligenceItem): Promise<AiAnalysisResult> {
    try {
      return await request<AiAnalysisResult>('/api/ai/dossier-analysis', {
        method: 'POST',
        body: JSON.stringify({ dossie: diligence }),
        timeoutMs: 120_000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha ao gerar a análise por IA.';
      return { ok: false, erro: message };
    }
  },
};
