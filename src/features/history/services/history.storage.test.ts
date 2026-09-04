// ==========================================================
// DILIGÊNCIA 360 — Armazenamento local do histórico
// ==========================================================
// O defeito que estes testes travam: o navegador guardava o dossiê inteiro,
// todos numa chave só, e o `catch` vazio escondia o estouro da cota. Com ~2 MB
// por dossiê e 5 MB de cota, o terceiro sumia sem aviso.
//
// A regra agora: o Google Sheets é o banco; o navegador guarda o índice, e o
// dossiê íntegro só quando ele não chegou ao banco.
// ==========================================================

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DiligenceItem } from '../../diligence/types';

// `lib/api` puxa a configuração do Firebase, que não existe no ambiente de
// teste. O mock também deixa as respostas explícitas, em vez de simular HTTP.
class FakeApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}
const request = vi.fn();
vi.mock('../../../lib/api', () => ({
  request: (...args: unknown[]) => request(...args),
  ApiError: FakeApiError,
}));

const INDEX_KEY = 'diligencia360_history_index';
const DRAFTS_KEY = 'diligencia360_history_drafts';
const LEGACY_KEY = 'diligencia360_history_items';

/** Armazenamento de mentira, com cota configurável. */
function installStorage(quotaBytes = Infinity) {
  const data = new Map<string, string>();
  const store = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const total = [...data.entries()]
        .filter(([existing]) => existing !== key)
        .reduce((sum, [, item]) => sum + item.length, 0) + value.length;
      if (total > quotaBytes) {
        const error = new Error('exceeded the quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      data.set(key, value);
    },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  vi.stubGlobal('localStorage', store);
  return { data, store };
}

/** Dossiê pesado, como o de uma empresa com carteira grande. */
function dossie(id: string, persisted: boolean, pesoKb = 200): DiligenceItem {
  return {
    id,
    cnpj: '10811370000162',
    cnpjFmt: '10.811.370/0001-62',
    razaoSocial: 'GUERRA CONSTRUCOES LTDA',
    nomeFantasia: 'GUERRA',
    dataAnalise: '2026-09-04T12:00:00.000Z',
    status: 'completed',
    persisted,
    risco: { score: 42, nivel: 'Atenção Elevada', cor: 'high', decisao: 'Aprofundar', detalhes: [] },
    createdBy: { id: 'u1', name: 'Analista' },
    empresa: { cnpj: '10811370000162', razao_social: 'GUERRA CONSTRUCOES LTDA' },
    socios: [],
    pepResults: [],
    timeline: [],
    // O volume que estourava a cota.
    adverseMedia: { results: [{ snippet: 'x'.repeat(pesoKb * 1024) }] },
  } as unknown as DiligenceItem;
}

async function carregarStorage() {
  vi.resetModules();
  return (await import('./history.storage')).HistoryStorage;
}

/** Backend fora do ar: o caminho em que o armazenamento local importa. */
function backendIndisponivel() {
  request.mockRejectedValue(new Error('offline'));
}

beforeEach(() => { vi.unstubAllGlobals(); request.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('o navegador guarda índice, não dossiê', () => {
  it('dossiê persistido no Sheets não é copiado inteiro para o navegador', async () => {
    const { data } = installStorage();
    backendIndisponivel();
    const HistoryStorage = await carregarStorage();

    // Persistido pelo backend (simulado pelo retorno), então só o resumo fica.
    request.mockResolvedValue({ ok: true, id: 'd1', persisted: true });

    await HistoryStorage.save(dossie('d1', true, 300));

    expect(data.get(DRAFTS_KEY) ?? '[]').toBe('[]');
    const index = JSON.parse(data.get(INDEX_KEY) as string);
    expect(index).toHaveLength(1);
    // O índice é minúsculo perto do dossiê de 300 kB.
    expect((data.get(INDEX_KEY) as string).length).toBeLessThan(2000);
  });

  it('o índice guarda só o que a lista precisa', async () => {
    const { data } = installStorage();
    request.mockResolvedValue({ ok: true, id: 'd1', persisted: true });
    const HistoryStorage = await carregarStorage();

    await HistoryStorage.save(dossie('d1', true));
    const [entry] = JSON.parse(data.get(INDEX_KEY) as string);

    expect(entry.razaoSocial).toBe('GUERRA CONSTRUCOES LTDA');
    expect(entry.risco.score).toBe(42);
    // O peso do dossiê não acompanha o índice.
    expect(entry.adverseMedia).toBeUndefined();
    expect(entry.empresa).toBeUndefined();
    expect(entry.socios).toBeUndefined();
  });
});

describe('rascunho: só o que não chegou ao banco', () => {
  it('dossiê que o Sheets recusou fica íntegro no navegador', async () => {
    const { data } = installStorage();
    request.mockResolvedValue({ ok: false, id: 'd1', persisted: false, aviso: 'Sheets fora do ar' });
    const HistoryStorage = await carregarStorage();

    const salvo = await HistoryStorage.save(dossie('d1', false, 10));

    expect(salvo.persisted).toBe(false);
    const drafts = JSON.parse(data.get(DRAFTS_KEY) as string);
    expect(drafts).toHaveLength(1);
    // Íntegro: é a única cópia que existe deste trabalho.
    expect(drafts[0].empresa).toBeDefined();
    expect(drafts[0].socios).toBeDefined();
  });

  it('os rascunhos são limitados aos mais recentes', async () => {
    const { data } = installStorage();
    request.mockResolvedValue({ ok: false, persisted: false });
    const HistoryStorage = await carregarStorage();

    for (const id of ['d1', 'd2', 'd3', 'd4', 'd5']) {
      await HistoryStorage.save(dossie(id, false, 5));
    }
    const drafts = JSON.parse(data.get(DRAFTS_KEY) as string);

    expect(drafts).toHaveLength(3);
    expect(drafts.map((d: DiligenceItem) => d.id)).toEqual(['d5', 'd4', 'd3']);
  });
});

describe('a cota deixou de falhar em silêncio', () => {
  it('estouro de cota vira aviso no dossiê, não sumiço', async () => {
    installStorage(50); // cota minúscula: qualquer escrita estoura
    request.mockResolvedValue({ ok: false, persisted: false });
    const HistoryStorage = await carregarStorage();

    const salvo = await HistoryStorage.save(dossie('d1', false, 5));

    expect(salvo.avisoPersistencia).toBeDefined();
    expect(salvo.avisoPersistencia).toMatch(/armazenamento local do navegador está cheio/i);
    // O aviso do Sheets continua lá: são duas informações distintas.
    expect(salvo.avisoPersistencia).toMatch(/Google Sheets/i);
  });

  it('a diligência não é derrubada por falha de armazenamento local', async () => {
    installStorage(50);
    request.mockResolvedValue({ ok: true, id: 'd1', persisted: true });
    const HistoryStorage = await carregarStorage();

    const salvo = await HistoryStorage.save(dossie('d1', true, 5));

    // Persistiu no banco; o navegador é acessório.
    expect(salvo.persisted).toBe(true);
    expect(salvo.id).toBe('d1');
  });
});

describe('migração da chave antiga', () => {
  it('converte dossiês inteiros em índice e apaga a chave que ocupava megabytes', async () => {
    const { data } = installStorage();
    data.set(LEGACY_KEY, JSON.stringify([dossie('antigo1', true, 50), dossie('antigo2', true, 50)]));
    backendIndisponivel();
    const HistoryStorage = await carregarStorage();

    const items = await HistoryStorage.getAll();

    expect(data.get(LEGACY_KEY)).toBeUndefined();
    expect(items).toHaveLength(2);
    expect((items[0] as { empresa?: unknown }).empresa).toBeUndefined();
  });

  it('preserva como rascunho o que nunca chegou ao Sheets', async () => {
    const { data } = installStorage();
    data.set(LEGACY_KEY, JSON.stringify([dossie('naoSalvo', false, 10), dossie('salvo', true, 10)]));
    backendIndisponivel();
    const HistoryStorage = await carregarStorage();

    await HistoryStorage.getAll();
    const drafts = JSON.parse(data.get(DRAFTS_KEY) as string);

    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe('naoSalvo');
    expect(drafts[0].empresa).toBeDefined();
  });
});

describe('leitura', () => {
  it('o dossiê completo vem do Sheets', async () => {
    installStorage();
    request.mockResolvedValue({ ok: true, data: dossie('d1', true, 1) });
    const HistoryStorage = await carregarStorage();

    const full = await HistoryStorage.getById('d1');
    expect(full?.empresa).toBeDefined();
  });

  it('sem o Sheets e sem rascunho, devolve nulo em vez de meio dossiê', async () => {
    installStorage();
    backendIndisponivel();
    const HistoryStorage = await carregarStorage();

    // Nada é inventado: quem chama decide o que dizer ao usuário.
    expect(await HistoryStorage.getById('inexistente')).toBeNull();
  });

  it('sem o Sheets, a listagem cai para o índice local', async () => {
    const { data } = installStorage();
    data.set(INDEX_KEY, JSON.stringify([{ id: 'd1', cnpj: '1', razaoSocial: 'X', dataAnalise: 'hoje' }]));
    backendIndisponivel();
    const HistoryStorage = await carregarStorage();

    const items = await HistoryStorage.getAll();
    expect(items).toHaveLength(1);
    expect(items[0].razaoSocial).toBe('X');
  });
});
