import { request } from '../../../lib/api';
import type {
  AssistedEvidence,
  EvidenceCenter,
  EgosSnapshot,
} from '../types';

export type EvidenceMutationInput = Partial<Omit<AssistedEvidence, 'id' | 'diligenceId' | 'createdAt' | 'updatedAt' | 'history'>> & {
  changeNote?: string;
};

interface EvidenceMutationResponse {
  ok: boolean;
  data: AssistedEvidence;
  evidenceCenter: EvidenceCenter;
  egos: EgosSnapshot;
}

export const EvidenceCenterApi = {
  async create(diligenceId: string, input: EvidenceMutationInput) {
    return await request<EvidenceMutationResponse>(`/api/diligences/${encodeURIComponent(diligenceId)}/evidences`, {
      method: 'POST',
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    });
  },

  async update(diligenceId: string, evidenceId: string, input: EvidenceMutationInput) {
    return await request<EvidenceMutationResponse>(
      `/api/diligences/${encodeURIComponent(diligenceId)}/evidences/${encodeURIComponent(evidenceId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
        timeoutMs: 30_000,
      },
    );
  },
};
