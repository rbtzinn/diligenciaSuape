import type { AiLeadQuery, AiLeadsResult } from '../types';
import { safeNewsUrl } from '../utils/newsResults';

export interface NewsSession {
  result: AiLeadsResult;
  pending: AiLeadQuery[];
  round: number;
}

const STORAGE_PREFIX = 'diligencia360:ai-news:v1';
const MAX_STORED_RESULTS = 200;
const MAX_STORED_QUERIES = 128;

export const emptyNewsSession = (): NewsSession => ({
  result: { ok: false, resultados: [], consultasExecutadas: [] }, pending: [], round: 0,
});

export function newsSessionStorageKey(diligenceId: string, subject: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(diligenceId)}:${encodeURIComponent(subject.trim() || 'empresa')}`;
}

export function browserNewsStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function validSession(value: unknown): value is NewsSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<NewsSession>;
  return Boolean(
    session.result && typeof session.result === 'object'
      && Array.isArray(session.result.resultados)
      && Array.isArray(session.result.consultasExecutadas)
      && Array.isArray(session.pending)
      && session.pending.every((query) => query && typeof query.termo === 'string')
      && typeof session.round === 'number'
      && Number.isFinite(session.round)
      && session.round >= 0,
  );
}

export function loadNewsSession(storage: Pick<Storage, 'getItem'> | undefined, key: string): NewsSession {
  if (!storage) return emptyNewsSession();
  try {
    const raw = storage.getItem(key);
    if (!raw) return emptyNewsSession();
    const parsed: unknown = JSON.parse(raw);
    return validSession(parsed) ? parsed : emptyNewsSession();
  } catch {
    return emptyNewsSession();
  }
}

export function saveNewsSession(storage: Pick<Storage, 'setItem'> | undefined, key: string, session: NewsSession): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({
      ...session,
      pending: session.pending.slice(0, 8),
      result: {
        ...session.result,
        resultados: (session.result.resultados || []).slice(-MAX_STORED_RESULTS),
        consultasExecutadas: (session.result.consultasExecutadas || []).slice(-MAX_STORED_QUERIES),
      },
    }));
  } catch {
    // Storage can be unavailable or full. The live session still keeps working.
  }
}

export function queryKey(query: AiLeadQuery): string {
  return query.termo.trim().toLocaleLowerCase('pt-BR');
}

// An unsuccessful response still contains valuable diagnostics and may contain
// links from other sources. Never replace earlier rounds with the last response.
export function mergeNewsResult(previous: AiLeadsResult, incoming: AiLeadsResult): AiLeadsResult {
  const links = new Map((previous.resultados || []).map((item) => [item.url, item]));
  for (const item of incoming.resultados || []) {
    const safe = safeNewsUrl(item.url);
    if (!safe) continue;
    const url = new URL(safe);
    url.hash = '';
    if (!links.has(url.href)) links.set(url.href, { ...item, url: url.href });
  }
  const queries = new Map((previous.consultasExecutadas || []).map((q) => [queryKey(q), q]));
  for (const q of incoming.consultasExecutadas || []) {
    const old = queries.get(queryKey(q));
    if (!old?.ok || q.ok) queries.set(queryKey(q), q);
  }
  const allQueries = [...queries.values()];
  return { ...previous, ...incoming, ok: allQueries.some((q) => q.ok),
    resultados: [...links.values()], consultasExecutadas: allQueries,
    partial: allQueries.some((q) => !q.ok || q.partial),
    provedor: incoming.provedor || previous.provedor, modelo: incoming.modelo || previous.modelo,
  };
}
