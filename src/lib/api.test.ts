import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./firebase', () => ({ getFirebaseIdToken: vi.fn(async () => 'fake-test-token') }));
import { getFirebaseIdToken } from './firebase';
import { request } from './api';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.mocked(getFirebaseIdToken).mockResolvedValue('fake-test-token'); });
describe('requisições autenticadas da IA', () => {
  it('envia token Firebase e rejeita resposta malformada', async () => {
    const fetchMock = vi.fn(async (_url: unknown, opts: RequestInit) => {
      expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer fake-test-token');
      return Response.json({});
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/api/ai/news-research/plan', { requireAuth: true })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('sessão ausente impede chamada e cota da IA não é consumida', async () => {
    vi.mocked(getFirebaseIdToken).mockResolvedValue(null);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(request('/api/ai/news-research/plan', { requireAuth: true })).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserva Retry-After para que o botão respeite o limite', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: false, erro: 'Cota', codigo: 'AI_RATE_LIMIT' }, { status: 429, headers: { 'Retry-After': '90' } })));
    await expect(request('/api/ai/news-research/plan', { requireAuth: true })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 90 });
  });
  it('Pausar pesquisa cancela fetch em andamento', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
      controller.abort();
    })));
    await expect(request('/api/ai/news-research/search', { requireAuth: true, signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('o limite inclui espera da autenticação e leitura do corpo', async () => {
    vi.mocked(getFirebaseIdToken).mockImplementationOnce(() => new Promise(() => {}));
    await expect(request('/api/ai/news-research/plan', { requireAuth: true, timeoutMs: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    await expect(request('/api/ai/news-research/plan', { requireAuth: true, timeoutMs: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
