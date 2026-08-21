// ==========================================================
// DILIGÊNCIA 360 — Serviço de Workflow e Transições
// ==========================================================

import { request } from '../../../lib/api';

export interface WorkflowTransitionResponse {
  ok: boolean;
  status: string;
  reviewer?: string;
  justification?: string;
}

export const WorkflowService = {
  async submitForReview(diligenceId: string): Promise<WorkflowTransitionResponse> {
    return await request<WorkflowTransitionResponse>(`/api/workflow/${diligenceId}/submit`, {
      method: 'POST',
    });
  },

  async startReview(diligenceId: string): Promise<WorkflowTransitionResponse> {
    return await request<WorkflowTransitionResponse>(`/api/workflow/${diligenceId}/start-review`, {
      method: 'POST',
    });
  },

  async returnForAdjustments(
    diligenceId: string,
    justification: string
  ): Promise<WorkflowTransitionResponse> {
    return await request<WorkflowTransitionResponse>(`/api/workflow/${diligenceId}/return`, {
      method: 'POST',
      body: JSON.stringify({ justification }),
    });
  },

  async approveAndComplete(diligenceId: string): Promise<WorkflowTransitionResponse> {
    return await request<WorkflowTransitionResponse>(`/api/workflow/${diligenceId}/approve`, {
      method: 'POST',
    });
  },
};
