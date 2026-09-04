// ==========================================================
// DILIGÊNCIA 360 — Estado de consulta de uma fonte
// ==========================================================
// Vocabulário único para "o que aconteceu quando perguntamos a esta fonte".
//
// A distinção que este módulo protege é uma só, e é a que sustenta ou derruba
// um dossiê: consultamos e não há nada (EMPTY) não é a mesma coisa que não
// conseguimos consultar (UNAVAILABLE). As duas terminam com uma lista vazia na
// tela e significam o oposto — a primeira sustenta uma decisão, a segunda é uma
// lacuna que precisa ser declarada.
//
// Pela mesma razão, NOT_APPLICABLE não é ERROR: uma LTDA não estar no cadastro
// de fundos da CVM é resposta correta da fonte, não falha técnica. Tratar as
// duas como iguais foi o que fez uma queda de rede virar achado de risco.
//
// Antes de criar este módulo foi verificado o que já existia: `coverageStatus`
// em mídia (COMPLETE/PARTIAL/UNAVAILABLE), `coverageStatus` em governança
// (complete_public/partial/unavailable/not_applicable) e o `SourceStatus` da
// tela de cobertura. Nenhum cobria os seis estados, e cada um usava a sua
// grafia. Este é o canônico; os demais são mapeados para ele, não substituídos,
// para não quebrar dossiê já gravado.
// ==========================================================

const SOURCE_STATUS = Object.freeze({
  /** Consulta concluída e há pelo menos uma ocorrência. */
  SUCCESS: 'SUCCESS',
  /** Consulta concluída corretamente e não há nenhuma ocorrência. */
  EMPTY: 'EMPTY',
  /** Parte da consulta foi concluída; o restante não. */
  PARTIAL: 'PARTIAL',
  /** A fonte não pôde ser consultada (rede, timeout, indisponibilidade). */
  UNAVAILABLE: 'UNAVAILABLE',
  /** Erro interno inesperado do próprio Diligência 360. */
  ERROR: 'ERROR',
  /** A fonte não se aplica a esta entidade. */
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

/**
 * Estados que representam informação efetivamente colhida. Só eles podem
 * alimentar uma regra de risco: os demais descrevem ausência de dado, e
 * ausência de dado nunca é evidência de nada.
 */
const RISK_BEARING_STATUSES = Object.freeze([SOURCE_STATUS.SUCCESS, SOURCE_STATUS.PARTIAL]);

/** Estados em que a fonte deixou lacuna de cobertura a declarar. */
const COVERAGE_GAP_STATUSES = Object.freeze([
  SOURCE_STATUS.PARTIAL,
  SOURCE_STATUS.UNAVAILABLE,
  SOURCE_STATUS.ERROR,
]);

function contributesToRisk(status) {
  return RISK_BEARING_STATUSES.includes(status);
}

function isCoverageGap(status) {
  return COVERAGE_GAP_STATUSES.includes(status);
}

/**
 * Deriva o estado a partir do que a consulta de fato fez.
 *
 * @param {object} outcome
 * @param {boolean} [outcome.applicable=true] a fonte se aplica à entidade.
 * @param {number} outcome.attempted quantas subconsultas foram tentadas.
 * @param {number} outcome.succeeded quantas concluíram.
 * @param {number} outcome.resultCount quantas ocorrências foram retidas.
 * @param {boolean} [outcome.internalError] falha do próprio sistema, não da fonte.
 * @returns {string} um valor de SOURCE_STATUS.
 */
function resolveSourceStatus(outcome = {}) {
  const {
    applicable = true,
    attempted = 0,
    succeeded = 0,
    resultCount = 0,
    internalError = false,
  } = outcome;

  if (!applicable) return SOURCE_STATUS.NOT_APPLICABLE;
  if (internalError) return SOURCE_STATUS.ERROR;
  // Nenhuma tentativa concluiu: a fonte não foi consultada, e a lista vazia que
  // isso produz não autoriza dizer que não existe ocorrência.
  if (attempted > 0 && succeeded === 0) return SOURCE_STATUS.UNAVAILABLE;
  if (attempted === 0) return SOURCE_STATUS.UNAVAILABLE;
  if (succeeded < attempted) return SOURCE_STATUS.PARTIAL;
  return resultCount > 0 ? SOURCE_STATUS.SUCCESS : SOURCE_STATUS.EMPTY;
}

/** Frase pronta para o dossiê, o log e o PDF. */
function describeSourceStatus(status, sourceName = 'A fonte') {
  switch (status) {
    case SOURCE_STATUS.SUCCESS:
      return `${sourceName} respondeu e retornou ocorrências.`;
    case SOURCE_STATUS.EMPTY:
      return `${sourceName} respondeu e não retornou nenhuma ocorrência para a entidade investigada.`;
    case SOURCE_STATUS.PARTIAL:
      return `${sourceName} respondeu parcialmente. A cobertura desta execução está incompleta.`;
    case SOURCE_STATUS.UNAVAILABLE:
      return `${sourceName} não pôde ser consultada. A ausência de resultado não significa ausência de ocorrência.`;
    case SOURCE_STATUS.ERROR:
      return `Houve erro interno ao consultar ${sourceName}. O resultado não é conclusivo.`;
    case SOURCE_STATUS.NOT_APPLICABLE:
      return `${sourceName} não se aplica a esta entidade.`;
    default:
      return `Estado de consulta desconhecido para ${sourceName}.`;
  }
}

module.exports = {
  SOURCE_STATUS,
  RISK_BEARING_STATUSES,
  COVERAGE_GAP_STATUSES,
  contributesToRisk,
  isCoverageGap,
  resolveSourceStatus,
  describeSourceStatus,
};
