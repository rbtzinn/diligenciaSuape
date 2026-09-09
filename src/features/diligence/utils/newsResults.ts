import type { AdverseMediaResult, AdverseMediaSummary } from '../types';

export function newsSubjects(item: AdverseMediaResult) {
  return [...new Set([item.subjectName, ...(item.relatedSubjects || []).map((s) => s.subjectName)].filter((s): s is string => Boolean(s)))];
}

export function safeNewsUrl(value?: string | null) {
  try {
    const url = new URL(value || '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

// A busca complementar nunca apaga uma matéria antiga ou uma revisão humana.
export function mergeNews(previous: AdverseMediaSummary | undefined, incoming: AdverseMediaSummary): AdverseMediaSummary {
  if (!incoming.ok) return previous || incoming;
  const key = (item: AdverseMediaResult) => item.canonicalUrl || item.url || item.id;
  const documents = new Map((previous?.results || []).map((item) => [key(item), item]));
  for (const item of incoming.results) {
    const old = documents.get(key(item));
    const related = new Map([...(old?.relatedSubjects || []), ...(item.relatedSubjects || [])].map((s) => [`${s.subjectType}:${s.subjectName}`, s]));
    const strength = { low: 0, medium: 1, high: 2 };
    documents.set(key(item), old ? {
      ...(strength[item.matchStrength] > strength[old.matchStrength] ? item : old),
      id: old.id,
      riskRelevant: Boolean(old.riskRelevant || item.riskRelevant),
      snippet: item.snippet.length > old.snippet.length ? item.snippet : old.snippet,
      status: old.status,
      queriesMatched: [...new Set([...old.queriesMatched, ...item.queriesMatched])],
      providerSources: [...new Set([...(old.providerSources || []), ...(item.providerSources || [])])],
      matchedTerms: [...new Set([...old.matchedTerms, ...item.matchedTerms])],
      relatedSubjects: [...related.values()],
    } : item);
  }
  const results = [...documents.values()];
  const queryKey = (q: NonNullable<AdverseMediaSummary['queriesExecuted']>[number]) => `${q.subjectType}:${q.subjectName}:${q.channel}:${q.query}`;
  const queries = new Map([...(previous?.queriesExecuted || []), ...(incoming.queriesExecuted || [])].map((q) => [queryKey(q), q]));
  const partial = Boolean(previous?.consultaParcial || incoming.consultaParcial);
  const subjects = [...new Map([...(previous?.subjects || []), ...(incoming.subjects || [])].map((s) => [s.name, s])).values()]
    .map((s) => ({ ...s, candidatesCount: results.filter((r) => newsSubjects(r).includes(s.name)).length }));
  return {
    ...previous, ...incoming, results,
    totalFound: results.length, candidatesCount: results.length,
    strongMatches: results.filter((r) => r.matchStrength === 'high').length,
    mediumMatches: results.filter((r) => r.matchStrength === 'medium').length,
    weakMatches: results.filter((r) => r.matchStrength === 'low').length,
    riskRelevantCount: results.filter((r) => r.riskRelevant !== false).length,
    generalMentionsCount: results.filter((r) => r.riskRelevant === false).length,
    confirmedMatches: results.filter((r) => r.entityMatch?.level === 'CONFIRMED').length,
    peopleRequested: Math.max(previous?.peopleRequested || 0, incoming.peopleRequested || 0),
    peopleSearched: subjects.filter((s) => s.searched).length,
    peopleWithCandidates: subjects.filter((s) => s.candidatesCount > 0).length,
    companyResultsCount: results.filter((r) => r.subjectType === 'company' || r.relatedSubjects?.some((s) => s.subjectType === 'company')).length,
    personResultsCount: results.filter((r) => r.subjectType === 'person' || r.relatedSubjects?.some((s) => s.subjectType === 'person')).length,
    providerSources: [...new Set([...(previous?.providerSources || []), ...(incoming.providerSources || [])])],
    queriesExecuted: [...queries.values()],
    subjects,
    consultaParcial: partial, coverageStatus: partial ? 'PARTIAL' : 'COMPLETE',
    aviso: partial ? 'Há fontes ou etapas pendentes. Os links já encontrados continuam disponíveis.' : incoming.aviso,
  };
}
