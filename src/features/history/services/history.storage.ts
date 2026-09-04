// ==========================================================
// DILIGÊNCIA 360 — Storage Adapter de Histórico Permanente
// ==========================================================
// O banco é o Google Sheets. O navegador guarda apenas o índice.
//
// POR QUE MUDOU: a versão anterior gravava o dossiê inteiro no `localStorage`,
// todos numa chave só e sem compressão. Um dossiê mede cerca de 2 MB e a cota
// típica do navegador é 5 MB — o terceiro estourava, e o `catch` vazio fazia
// isso acontecer em silêncio. O analista perdia o rascunho sem nunca saber.
//
// O DESENHO AGORA, E POR QUE ELE É ASSIM:
//
//   ÍNDICE (`…_index`)   — doze campos por diligência, o mesmo resumo que o
//                          backend devolve na listagem. É o que a tela de
//                          histórico precisa, e custa alguns kB para centenas
//                          de registros.
//
//   RASCUNHOS (`…_drafts`) — o dossiê íntegro, e SÓ para o que não conseguiu ser
//                          gravado no Sheets. É o único caso em que perder a
//                          cópia local significa perder trabalho de verdade.
//                          Limitado aos mais recentes.
//
// Dossiê já persistido não é copiado para o navegador: ele está no Sheets, e
// `getById` o busca de lá. Guardar duas vezes o mesmo dado é o que estourava a
// cota.
// ==========================================================

import { DiligenceItem } from '../../diligence/types';
import { request, ApiError } from '../../../lib/api';

const INDEX_KEY = 'diligencia360_history_index';
const DRAFTS_KEY = 'diligencia360_history_drafts';
/** Chave da versão anterior, que guardava dossiês inteiros. Migrada e removida. */
const LEGACY_KEY = 'diligencia360_history_items';

/** Quantos dossiês não persistidos ficam no navegador. */
const MAX_DRAFTS = 3;
/** Teto do índice. Centenas de resumos ainda cabem em poucas centenas de kB. */
const MAX_INDEX = 200;

/**
 * Resumo de uma diligência. Mesma forma que `listDiligences` devolve no backend,
 * acrescida do que o cartão do histórico exibe.
 */
export interface DiligenceSummary {
  id: string;
  cnpj: string;
  cnpjFmt?: string;
  razaoSocial: string;
  nomeFantasia?: string;
  dataAnalise: string;
  status?: string;
  risco?: DiligenceItem['risco'];
  createdBy?: DiligenceItem['createdBy'];
  completedAt?: string;
  updatedAt?: string;
  persisted?: boolean;
  avisoPersistencia?: string;
}

interface DiligencesListResponse {
  ok: boolean;
  count: number;
  items: Array<DiligenceSummary & { score?: number; nivel?: string; decisao?: string }>;
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

/** Erro de cota do navegador, nas duas grafias que os navegadores usam. */
function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || /quota/i.test(error.message);
}

function readKey<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Grava e devolve o que impediu a gravação, quando algo impedir.
 * Nunca lança: falhar em guardar rascunho não pode derrubar a diligência.
 */
function writeKey(key: string, value: unknown): string | undefined {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return undefined;
  } catch (error) {
    if (isQuotaError(error)) {
      return 'O armazenamento local do navegador está cheio. O rascunho não foi guardado aqui; '
        + 'o histórico permanente do Google Sheets continua sendo a fonte de verdade.';
    }
    return 'Não foi possível usar o armazenamento local do navegador nesta sessão.';
  }
}

/** Extrai do dossiê apenas o que a tela de histórico precisa. */
function toSummary(item: DiligenceItem): DiligenceSummary {
  return {
    id: item.id,
    cnpj: item.cnpj,
    cnpjFmt: item.cnpjFmt,
    razaoSocial: item.razaoSocial,
    nomeFantasia: item.nomeFantasia,
    dataAnalise: item.dataAnalise,
    status: item.status,
    // Só os campos que o cartão exibe; o detalhamento vem do Sheets.
    risco: item.risco
      ? ({
        score: item.risco.score,
        nivel: item.risco.nivel,
        cor: item.risco.cor,
        decisao: item.risco.decisao,
      } as DiligenceItem['risco'])
      : undefined,
    createdBy: item.createdBy,
    persisted: item.persisted,
    avisoPersistencia: item.avisoPersistencia,
  };
}

/**
 * Migra a chave antiga, que guardava dossiês inteiros.
 *
 * Roda uma vez: converte o que houver em resumos, preserva como rascunho o que
 * nunca chegou ao Sheets e apaga a chave antiga — que é justamente a que
 * ocupava megabytes.
 */
function migrateLegacyStorage(): void {
  let legacy: DiligenceItem[];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    legacy = JSON.parse(raw) as DiligenceItem[];
  } catch {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* nada a fazer */ }
    return;
  }

  if (Array.isArray(legacy) && legacy.length > 0) {
    const index = readKey<DiligenceSummary>(INDEX_KEY);
    const conhecidos = new Set(index.map((entry) => entry.id));
    const migrados = legacy.filter((item) => item?.id && !conhecidos.has(item.id)).map(toSummary);
    if (migrados.length > 0) writeKey(INDEX_KEY, [...migrados, ...index].slice(0, MAX_INDEX));

    // Dossiê que nunca foi persistido é trabalho que se perderia.
    const rascunhos = legacy.filter((item) => item?.id && item.persisted === false).slice(0, MAX_DRAFTS);
    if (rascunhos.length > 0) writeKey(DRAFTS_KEY, rascunhos);
  }

  try { localStorage.removeItem(LEGACY_KEY); } catch { /* nada a fazer */ }
}

let migrated = false;
function ensureMigrated(): void {
  if (migrated) return;
  migrated = true;
  try { migrateLegacyStorage(); } catch { /* migração é oportunista */ }
}

export const HistoryStorage = {
  /**
   * Lista as diligências. O Sheets é a fonte; o índice local só responde
   * quando ele não responde.
   */
  async getAll(): Promise<DiligenceSummary[]> {
    ensureMigrated();
    try {
      const res = await request<DiligencesListResponse>('/api/diligences');
      if (res.ok && Array.isArray(res.items)) {
        // O backend envia score/nivel soltos; o cartão espera `risco`.
        const items = res.items.map((item) => ({
          ...item,
          risco: item.risco ?? ({
            score: item.score ?? 0,
            nivel: item.nivel || 'Atenção Baixa',
            decisao: item.decisao || '',
          } as DiligenceItem['risco']),
        }));
        writeKey(INDEX_KEY, items.slice(0, MAX_INDEX));
        return items;
      }
    } catch {
      // Sem o Sheets, resta o índice local.
    }
    return readKey<DiligenceSummary>(INDEX_KEY);
  },

  /**
   * Salva no histórico permanente.
   *
   * O dossiê íntegro fica no navegador apenas quando o Sheets recusou — é o
   * único caso em que a cópia local é a diferença entre ter e não ter o
   * trabalho. Quando persiste, o navegador guarda só o resumo.
   */
  async save(item: DiligenceItem): Promise<DiligenceItem> {
    ensureMigrated();
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
        persistenceNotice = res.aviso || 'Google Sheets indisponível. Dossiê salvo apenas como rascunho local.';
      }
    } catch (error) {
      // 413 tem causa própria e conserto próprio: o corpo excedeu o limite.
      persistenceNotice = error instanceof ApiError && error.status === 413
        ? 'O dossiê excedeu o limite de envio e não foi gravado no histórico permanente.'
        : 'Histórico do Google Sheets indisponível. Dossiê em rascunho local — não sincronizado.';
    }

    const itemWithStatus: DiligenceItem = {
      ...item,
      egos: egosResult,
      risco: riskResult,
      persisted: isPersisted,
      avisoPersistencia: persistenceNotice,
    };

    // Índice: sempre, e é barato.
    const index = readKey<DiligenceSummary>(INDEX_KEY).filter((entry) => entry.id !== item.id);
    const indexError = writeKey(INDEX_KEY, [toSummary(itemWithStatus), ...index].slice(0, MAX_INDEX));

    // Rascunho íntegro: só o que não chegou ao banco.
    let draftError: string | undefined;
    const drafts = readKey<DiligenceItem>(DRAFTS_KEY).filter((entry) => entry.id !== item.id);
    if (!isPersisted) {
      draftError = writeKey(DRAFTS_KEY, [itemWithStatus, ...drafts].slice(0, MAX_DRAFTS));
    } else if (drafts.length !== readKey<DiligenceItem>(DRAFTS_KEY).length) {
      // Persistiu: o rascunho deste dossiê deixa de ser necessário.
      writeKey(DRAFTS_KEY, drafts);
    }

    // A falha de armazenamento local deixou de ser silenciosa.
    const storageNotice = draftError || indexError;
    if (storageNotice) {
      itemWithStatus.avisoPersistencia = [itemWithStatus.avisoPersistencia, storageNotice]
        .filter(Boolean)
        .join(' ');
    }

    return itemWithStatus;
  },

  /** Busca o dossiê completo. O Sheets é o banco; o rascunho é a exceção. */
  async getById(id: string): Promise<DiligenceItem | null> {
    ensureMigrated();
    try {
      const res = await request<DiligenceDetailResponse>(`/api/diligences/${id}`);
      if (res.ok && res.data) return res.data;
    } catch {
      // Cai para o rascunho local, quando houver.
    }
    return readKey<DiligenceItem>(DRAFTS_KEY).find((entry) => entry.id === id) || null;
  },

  /** Dossiês que não chegaram ao Google Sheets e existem só neste navegador. */
  getPendingDrafts(): DiligenceItem[] {
    ensureMigrated();
    return readKey<DiligenceItem>(DRAFTS_KEY);
  },

  async count(): Promise<number> {
    const all = await this.getAll();
    return all.length;
  },

  async delete(id: string): Promise<boolean> {
    await request(`/api/diligences/${id}`, { method: 'DELETE' });

    writeKey(INDEX_KEY, readKey<DiligenceSummary>(INDEX_KEY).filter((entry) => entry.id !== id));
    writeKey(DRAFTS_KEY, readKey<DiligenceItem>(DRAFTS_KEY).filter((entry) => entry.id !== id));
    return true;
  },

  generateId(): string {
    return `dil_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  },
};
