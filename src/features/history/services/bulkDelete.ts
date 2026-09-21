// ==========================================================
// DILIGÊNCIA 360 — Remoção em lote
//
// Remover vários dossiês de uma vez tem duas armadilhas, e as duas
// aparecem só quando algo dá errado no meio.
//
// A primeira é disparar tudo em paralelo. A API tem limite por origem,
// e vinte exclusões simultâneas viram uma rajada recusada pela metade —
// com o analista sem saber quais saíram.
//
// A segunda é abortar na primeira falha. O que já foi removido não
// volta, então parar no meio deixa a lista num estado que ninguém
// pediu e sem explicação de onde parou.
//
// Por isso: uma de cada vez, todas tentadas, e cada falha volta
// nomeada.
// ==========================================================

export interface BulkDeleteFailure {
  id: string;
  motivo: string;
}

export interface BulkDeleteOutcome {
  removidos: number;
  falhas: BulkDeleteFailure[];
}

/**
 * Executa `remover` para cada id, em série, sem interromper em erro.
 *
 * @param ids identificadores a remover, na ordem em que o analista vê
 * @param remover operação de remoção de um único dossiê
 */
export async function removeInSeries(
  ids: readonly string[],
  remover: (id: string) => Promise<unknown>,
): Promise<BulkDeleteOutcome> {
  const falhas: BulkDeleteFailure[] = [];
  let removidos = 0;

  for (const id of ids) {
    try {
      await remover(id);
      removidos += 1;
    } catch (error) {
      falhas.push({
        id,
        motivo: error instanceof Error ? error.message : 'falha não identificada',
      });
    }
  }

  return { removidos, falhas };
}
