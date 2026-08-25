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

export const ReportService = {
  async downloadReport(diligenceId: string, isPreview = false): Promise<{ fileName: string; hash: string }> {
    const url = resolveApiUrl(`/api/diligences/${diligenceId}/report${isPreview ? '?preview=true' : ''}`);
    const idToken = await getFirebaseIdToken();

    const headers: Record<string, string> = {
      Accept: 'application/pdf',
    };
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.erro || `Falha ao gerar o relatório (HTTP ${response.status})`);
    }

    const hash = response.headers.get('X-Report-Hash') || '';
    const reportNum = response.headers.get('X-Report-Number') || '';

    // Obtém o nome do arquivo a partir do header ou default
    let fileName = `Dossie_${reportNum || diligenceId}.pdf`;
    const disposition = response.headers.get('Content-Disposition');
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) fileName = match[1];
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);

    return { fileName, hash };
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
