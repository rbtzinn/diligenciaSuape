import { describe, expect, it } from 'vitest';
import {
  emptyNewsSession,
  loadNewsSession,
  mergeNewsResult,
  newsSessionStorageKey,
  queryKey,
  saveNewsSession,
} from './ai-news-session';
import type { AiLeadQuery, AiLeadResult } from '../types';

const query: AiLeadQuery = { termo: 'Empresa Exemplo', canal: 'news', alvo: 'empresa', ok: true, resultCount: 1 };
const link: AiLeadResult = { title: 'Publicação', url: 'https://example.org/noticia', snippet: 'Trecho', domain: 'example.org', origemConsulta: query.termo };

describe('sessão da busca ampliada', () => {
  it('preserva links e consultas respondidas quando a próxima etapa falha', () => {
    const first = mergeNewsResult(emptyNewsSession().result, { ok: true, resultados: [link], consultasExecutadas: [query] });
    const next = mergeNewsResult(first, { ok: false, resultados: [], consultasExecutadas: [{ ...query, termo: 'Outra consulta', ok: false, erro: 'Timeout' }] });
    expect(next.resultados).toEqual([link]);
    expect(next.ok).toBe(true);
    expect(next.partial).toBe(true);
    expect(next.consultasExecutadas).toHaveLength(2);
  });
  it('retentativa substitui falha por resposta, sem duplicar link ou consulta', () => {
    const first = { ok: false, resultados: [link], consultasExecutadas: [{ ...query, ok: false }] };
    const next = mergeNewsResult(first, { ok: true, resultados: [{ ...link, url: `${link.url}#secao` }], consultasExecutadas: [query] });
    expect(next.resultados).toHaveLength(1);
    expect(next.consultasExecutadas).toEqual([query]);
    expect(next.partial).toBe(false);
  });
  it('descarta protocolos inseguros e não converte falhas em ausência de notícias', () => {
    const next = mergeNewsResult(emptyNewsSession().result, { ok: false, resultados: [{ ...link, url: 'javascript:alert(1)' }], consultasExecutadas: [{ ...query, ok: false }] });
    expect(next.resultados).toEqual([]);
    expect(next.ok).toBe(false);
    expect(queryKey({ ...query, termo: ' EMPRESA EXEMPLO ' })).toBe(queryKey(query));
  });
  it('salva e restaura sessões separadas para empresa e pessoa', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const companyKey = newsSessionStorageKey('diligencia-1', '');
    const personKey = newsSessionStorageKey('diligencia-1', 'Maria Silva');
    const saved = { result: mergeNewsResult(emptyNewsSession().result, { ok: true, resultados: [link], consultasExecutadas: [query] }), pending: [], round: 2 };
    saveNewsSession(storage, companyKey, saved);
    expect(loadNewsSession(storage, companyKey)).toEqual(saved);
    expect(loadNewsSession(storage, personKey)).toEqual(emptyNewsSession());
  });
  it('ignora conteúdo corrompido e falha de armazenamento sem derrubar a tela', () => {
    expect(loadNewsSession({ getItem: () => '{inválido' }, 'chave')).toEqual(emptyNewsSession());
    expect(() => saveNewsSession({ setItem: () => { throw new Error('quota'); } }, 'chave', emptyNewsSession())).not.toThrow();
  });
});
