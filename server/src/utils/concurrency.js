// ==========================================================
// DILIGÊNCIA 360 — Execução com concorrência limitada
// ==========================================================
// Seis serviços declaram a própria cópia desta função (mídia, diários,
// PNCP, sanções de pessoa, governança CVM e rede societária). Este é o
// lugar para ela; código novo importa daqui, e as cópias existentes
// podem migrar uma a uma, sem pressa e sem risco de regressão num
// caminho que já funciona.
// ==========================================================

/**
 * Aplica `worker` a cada item com no máximo `concurrency` execuções
 * simultâneas, preservando a ordem do resultado.
 *
 * Não engole exceção: se o `worker` lançar, a promessa rejeita. Quem
 * precisa de tolerância a falha por item trata dentro do próprio
 * `worker` — é assim que os chamadores distinguem "a fonte recusou"
 * de "o serviço quebrou".
 */
async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const output = new Array(list.length);
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < list.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      output[currentIndex] = await worker(list[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: limit }, runWorker));
  return output;
}

module.exports = { mapWithConcurrency };
