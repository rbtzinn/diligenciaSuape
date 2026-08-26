// ==========================================================
// DILIGÊNCIA 360 — Serviço de Download e Metadados de Relatórios (Firebase Auth)
// ==========================================================

import { getFirebaseIdToken } from '../../../lib/firebase';
import { request, resolveApiUrl } from '../../../lib/api';

export interface DiligenceReportMetadata {
  id: string;
  diligenceId: string;
  version: number;
  reportNumber: string;
  fileName: string;
  hashValue: string;
  generatedAt: string;
  generatedBy?: { id: string; name: string };
}

async function downloadPdf(
  url: string,
  fallbackFileName: string,
  bodyData?: Record<string, unknown>
): Promise<{ fileName: string; hash: string }> {
  const idToken = await getFirebaseIdToken();
  const headers: Record<string, string> = { Accept: 'application/pdf' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (bodyData) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  try {
    const response = await fetch(url, {
      method: bodyData ? 'POST' : 'GET',
      headers,
      body: bodyData ? JSON.stringify(bodyData) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.erro || `Falha ao gerar o relatório (HTTP ${response.status})`);
    }

    const hash = response.headers.get('X-Report-Hash') || '';
    let fileName = fallbackFileName;
    const disposition = response.headers.get('Content-Disposition');
    if (disposition?.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match?.[1]) fileName = match[1];
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(downloadUrl);
    return { fileName, hash };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao gerar o relatório. Tente novamente.');
    }
    throw err;
  }
}

export const ReportService = {
  async downloadReport(diligenceId: string, isPreview = false, diligence?: unknown): Promise<{ fileName: string; hash: string }> {
    const url = resolveApiUrl(`/api/diligences/${diligenceId}/report${isPreview ? '?preview=true' : ''}`);
    const body = diligence ? { diligence, preview: isPreview } : undefined;
    return downloadPdf(url, `Dossie_${diligenceId}.pdf`, body);
  },

  async downloadEntityReport(diligenceId: string, entityId: string, diligence?: unknown): Promise<{ fileName: string; hash: string }> {
    const query = new URLSearchParams({ entityId });
    const url = resolveApiUrl(`/api/diligences/${diligenceId}/entity-report?${query.toString()}`);
    const body = diligence ? { diligence, entityId } : undefined;
    return downloadPdf(url, `Evidencias_entidade_${entityId}.pdf`, body);
  },

  async listReports(diligenceId: string): Promise<DiligenceReportMetadata[]> {
    try {
      const data = await request<{ ok: boolean; items: DiligenceReportMetadata[] }>(
        `/api/diligences/${diligenceId}/reports`
      );
      return data.ok && Array.isArray(data.items) ? data.items : [];
    } catch {
      return [];
    }
  },
};
