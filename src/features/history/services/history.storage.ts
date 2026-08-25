// ==========================================================
// DILIGÊNCIA 360 — Storage Adapter de Histórico Permanente
// Persistência no PostgreSQL com fallback resiliente
// ==========================================================

import { DiligenceItem } from '../../diligence/types';
import { request } from '../../../lib/api';

const STORAGE_KEY = 'diligencia360_history_items';

interface DiligencesListResponse {
  ok: boolean;
  count: number;
  items: DiligenceItem[];
}

interface DiligenceDetailResponse {
  ok: boolean;
  data: DiligenceItem;
}

interface SaveDiligenceResponse {
  ok: boolean;
  id: string;
  persisted?: boolean;
  aviso?: string;
  egos?: DiligenceItem['egos'];
  risco?: DiligenceItem['risco'];
}

export const HistoryStorage = {
  /**
   * Obtém todas as diligências salvas no backend ou fallback local
   */
  async getAll(): Promise<DiligenceItem[]> {
    try {
      const res = await request<DiligencesListResponse>('/api/diligences');
      if (res.ok && Array.isArray(res.items)) {
        return res.items;
      }
    } catch {
      // Fallback em memória/localStorage
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Salva a diligência completa no banco permanente com verificação explícita
   */
  async save(item: DiligenceItem): Promise<DiligenceItem> {
    let isPersisted = false;
    let persistenceNotice: string | undefined;
    let egosResult = item.egos;
    let riskResult = item.risco;

    try {
      const res = await request<SaveDiligenceResponse>('/api/diligences', {
        method: 'POST',
        body: JSON.stringify(item),
      });
      if (res && res.persisted) {
        isPersisted = true;
        egosResult = res.egos || item.egos;
        riskResult = res.risco || item.risco;
      } else {
        persistenceNotice = res.aviso || 'Banco de dados PostgreSQL indisponível. Dossiê salvo em rascunho local.';
      }
    } catch {
      persistenceNotice = 'Servidor de banco de dados offline. Dossiê em rascunho local — não sincronizado.';
    }

    const itemWithStatus: DiligenceItem = {
      ...item,
      egos: egosResult,
      risco: riskResult,
      persisted: isPersisted,
      avisoPersistencia: persistenceNotice,
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const all: DiligenceItem[] = raw ? JSON.parse(raw) : [];
      const index = all.findIndex((x) => x.id === item.id);
      if (index >= 0) {
        all[index] = itemWithStatus;
      } else {
        all.unshift(itemWithStatus);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Ignora erro de localStorage
    }

    return itemWithStatus;
  },

  /**
   * Busca dossiê completo por ID no backend
   */
  async getById(id: string): Promise<DiligenceItem | null> {
    try {
      const res = await request<DiligenceDetailResponse>(`/api/diligences/${id}`);
      if (res.ok && res.data) {
        return res.data;
      }
    } catch {
      // Fallback local
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const all: DiligenceItem[] = raw ? JSON.parse(raw) : [];
      return all.find((x) => x.id === id) || null;
    } catch {
      return null;
    }
  },

  /**
   * Retorna a quantidade total de diligências
   */
  async count(): Promise<number> {
    const all = await this.getAll();
    return all.length;
  },

  /**
   * Exclui uma diligência do backend e do armazenamento local
   */
  async delete(id: string): Promise<boolean> {
    try {
      await request(`/api/diligences/${id}`, { method: 'DELETE' });
    } catch {
      // Continua para remover do localStorage
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const all: DiligenceItem[] = JSON.parse(raw);
        const filtered = all.filter((x) => x.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
    } catch {
      // Ignora erro de localStorage
    }

    return true;
  },

  /**
   * Gera um ID único para a diligência
   */
  generateId(): string {
    return `dil_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  },
};
