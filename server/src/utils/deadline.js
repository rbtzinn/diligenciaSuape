// Covers connection AND body parsing; callers pass the signal to their I/O.
async function withDeadline(timeoutMs, work, outerSignal) {
  const controller = new AbortController();
  const timeout = new Error('Tempo limite da etapa esgotado.');
  timeout.status = 504;
  timeout.code = 'TIMEOUT';
  let timer;
  let onAbort;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        onAbort = () => { controller.abort(); reject(outerSignal.reason || timeout); };
        if (outerSignal?.aborted) return onAbort();
        outerSignal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(timeout); }, Math.max(1, timeoutMs));
      }),
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return work(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

module.exports = { withDeadline };
