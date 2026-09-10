// ==========================================================
// DILIGÊNCIA 360 — Utilitário de Fetch com Timeout e User-Agent
// ==========================================================

const TIMEOUT_MS = 15000;

async function safeFetch(url, opts = {}) {
  const { timeoutMs = TIMEOUT_MS, signal, ...fetchOptions } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Diligencia360-SUAPE/2.0',
    ...(fetchOptions.headers || {}),
  };

  try {
    const res = await fetch(url, { ...fetchOptions, headers, signal: signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e.name === 'AbortError' ? new Error('Tempo limite de consulta esgotado (timeout)') : e;
  }
}

module.exports = { safeFetch };
