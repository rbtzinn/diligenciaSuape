import { describe, it, expect } from 'vitest';
import type { AdverseMediaResult, AdverseMediaSummary } from '../types';
import { mergeNews, newsSubjects, safeNewsUrl } from './newsResults';

const article = (id: string): AdverseMediaResult => ({ id, title: 'Notícia de teste', url: `https://example.test/${id}`, domain: 'example.test', snippet: '', queriesMatched: [], matchedTerms: [], categories: [], matchStrength: 'medium', companyMatch: { corporateName: false, tradeName: false, cnpj: false }, status: 'candidate', searchedAt: '', subjectName: 'Empresa', subjectType: 'company' });
const summary = (results: AdverseMediaResult[]): AdverseMediaSummary => ({ ok: true, results, totalFound: results.length, candidatesCount: results.length, strongMatches: 0, mediumMatches: results.length, weakMatches: 0, consultadoEm: '' });

describe('publicações acumuladas', () => {
  it('preserva resultados anteriores e descartes ao ampliar a busca', () => {
    const old = { ...article('one'), status: 'discarded' as const };
    const newer = { ...article('one'), relatedSubjects: [{ subjectType: 'person' as const, subjectName: 'Ana Maria' }] };
    const merged = mergeNews(summary([old, article('two')]), summary([newer, article('three')]));
    expect(merged.totalFound).toBe(3);
    expect(merged.results[0].status).toBe('discarded');
    expect(newsSubjects(merged.results[0])).toContain('Ana Maria');
    expect(merged.personResultsCount).toBe(1);
  });
  it('não substitui evidências por uma consulta que falhou', () => {
    const old = summary([article('one')]);
    expect(mergeNews(old, { ...summary([]), ok: false })).toBe(old);
  });
  it('não converte cobertura anterior incompleta em completa', () => {
    expect(mergeNews({ ...summary([]), consultaParcial: true }, summary([])).coverageStatus).toBe('PARTIAL');
  });
  it('só oferece links HTTP e HTTPS', () => {
    expect(safeNewsUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeNewsUrl('https://example.test/noticia')).toBe('https://example.test/noticia');
  });
});
