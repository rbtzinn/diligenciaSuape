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
  constructor(message: string, public status?: number) {
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

type RequestOptions = RequestInit & { timeoutMs?: number };

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const idToken = await getFirebaseIdToken();

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

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const msg = getErrorMessageForStatus(response.status, data?.erro);
      throw new ApiError(msg, response.status);
    }

    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('Tempo limite da requisição esgotado (timeout).');
    }
    const message = err instanceof Error ? err.message : 'Falha na comunicação com o servidor.';
    throw new ApiError(message);
  }
}
