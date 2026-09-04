// ==========================================================
// DILIGÊNCIA 360 — Estado de consulta de uma fonte (espelho do backend)
// ==========================================================
// Contrapartida de `server/src/domain/source-status.js`. Os dois arquivos
// precisam declarar exatamente os mesmos seis estados: é o vocabulário que
// separa "consultamos e não há nada" de "não conseguimos consultar".
//
// O campo é opcional em todos os resumos porque dossiê gravado antes desta
// camada não o possui. Quem lê deve tratar `undefined` como desconhecido, e
// nunca como sucesso.
// ==========================================================

export type SourceQueryStatus =
  | 'SUCCESS'
  | 'EMPTY'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'ERROR'
  | 'NOT_APPLICABLE';

/**
 * Estados em que a fonte de fato entregou informação. Só eles podem alimentar
 * uma regra de risco — ausência de dado nunca é evidência de nada.
 */
export const RISK_BEARING_STATUSES: readonly SourceQueryStatus[] = ['SUCCESS', 'PARTIAL'];

export function contributesToRisk(status?: SourceQueryStatus): boolean {
  return status !== undefined && RISK_BEARING_STATUSES.includes(status);
}

/** A fonte deixou lacuna de cobertura que precisa ser declarada no dossiê. */
export function isCoverageGap(status?: SourceQueryStatus): boolean {
  return status === 'PARTIAL' || status === 'UNAVAILABLE' || status === 'ERROR';
}

export const SOURCE_STATUS_LABEL: Record<SourceQueryStatus, string> = {
  SUCCESS: 'Consultada, com ocorrências',
  EMPTY: 'Consultada, sem ocorrências',
  PARTIAL: 'Consultada parcialmente',
  UNAVAILABLE: 'Não foi possível consultar',
  ERROR: 'Erro interno na consulta',
  NOT_APPLICABLE: 'Não se aplica a esta entidade',
};
