import type { AiLeadQuery, AiLeadsResult } from '../types';
import { safeNewsUrl } from '../utils/newsResults';

export interface NewsSession {
  result: AiLeadsResult;
  pending: AiLeadQuery[];
  round: number;
}

export const emptyNewsSession = (): NewsSession => ({
  result: { ok: false, resultados: [], consultasExecutadas: [] }, pending: [], round: 0,
});

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
