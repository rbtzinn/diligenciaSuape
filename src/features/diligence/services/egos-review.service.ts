import { request } from '../../../lib/api';

interface ReviewResponse {
  ok: boolean;
  data: { id: string; newStatus: string };
}

export const EgosReviewService = {
  async reviewFinding(diligenceId: string, findingId: string, previousStatus: string, newStatus: 'confirmed' | 'discarded', justification: string) {
    return await request<ReviewResponse>(`/api/diligences/${diligenceId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'egos_finding',
        entityId: findingId,
        action: newStatus === 'confirmed' ? 'confirm_match' : 'discard_match',
        previousStatus,
        newStatus,
        justification,
      }),
    });
  },
};
