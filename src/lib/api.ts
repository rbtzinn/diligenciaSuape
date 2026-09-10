// ==========================================================
// DILIGÊNCIA 360 — Cliente HTTP Base com Injeção de ID Token Firebase
// ==========================================================

import { getFirebaseIdToken } from './firebase';

const TIMEOUT_MS = 15000;
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export function resolveApiUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (!API_BASE_URL) return endpoint;
  return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

export class ApiError extends Error {
  constructor(message: string, public status?: number, public code?: string, public retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function getErrorMessageForStatus(status: number, serverError?: string): string {
  if (serverError && typeof serverError === 'string' && serverError.trim()) {
    return serverError;
  }
  switch (status) {
    case 401:
      return 'E-mail ou senha inválidos.';
    case 403:
      return 'Seu usuário não possui autorização para acessar o Diligência 360.';
    case 404:
      return 'Serviço de autenticação não encontrado.';
    case 429:
      return 'Muitas tentativas de acesso. Aguarde alguns minutos.';
    case 500:
    case 502:
    case 503:
      return 'Não foi possível acessar o sistema no momento.';
    default:
      return `Erro na comunicação (HTTP ${status}).`;
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number; requireAuth?: boolean };

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Abortado', 'AbortError'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = TIMEOUT_MS, requireAuth = false, signal, ...fetchOptions } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const idToken = await abortable(getFirebaseIdToken(), controller.signal);
    if (requireAuth && !idToken) throw new ApiError('Sua sessão terminou. Entre novamente para continuar a pesquisa.', 401, 'SESSION_REQUIRED');

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...((fetchOptions.headers as Record<string, string>) || {}),
    };

    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(resolveApiUrl(endpoint), {
      ...fetchOptions,
      signal: controller.signal,
      headers,
    });

    const data = await abortable(response.json().catch(() => ({})), controller.signal);
    if (controller.signal.aborted) throw new DOMException('Abortado', 'AbortError');

    if (!response.ok) {
      const msg = getErrorMessageForStatus(response.status, data?.erro);
      const rawRetryAfter = data?.retryAfterSeconds || response.headers.get('Retry-After');
      const numericWait = Number(rawRetryAfter);
      const retryAfter = (Number.isFinite(numericWait) ? Math.max(0, numericWait)
        : Math.max(0, Math.ceil((Date.parse(String(rawRetryAfter)) - Date.now()) / 1000))) || undefined;
      throw new ApiError(msg, response.status, data?.codigo, retryAfter);
    }
    if (requireAuth && typeof data?.ok !== 'boolean') throw new ApiError('O servidor devolveu uma resposta inválida. Tente retomar a etapa.', 502, 'INVALID_RESPONSE');

    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(signal?.aborted ? 'Pesquisa pausada.' : 'Tempo limite da etapa esgotado. Você pode continuar a pesquisa.', undefined, signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
    }
    // `fetch` rejeita com TypeError("Failed to fetch") para qualquer falha de
    // rede, CORS ou função encerrada antes de responder. A mensagem crua não
    // diz nada a quem opera e ainda aparecia no dossiê; aqui ela vira uma
    // descrição do que de fato aconteceu.
    if (err instanceof TypeError) {
      throw new ApiError(
        'Não foi possível falar com o servidor do Diligência 360 (falha de rede ou consulta encerrada antes de responder).',
      );
    }
    const message = err instanceof Error ? err.message : 'Falha na comunicação com o servidor.';
    throw new ApiError(message);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}
