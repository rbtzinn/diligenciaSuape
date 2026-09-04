// ==========================================================
// DILIGÊNCIA 360 — Natureza do vínculo entre a entidade e um registro
// ==========================================================
// Extraído de `tce-pe.service.js`, onde nasceu junto da atribuição de processos.
// A extração acontece agora porque três camadas passaram a precisar do mesmo
// vocabulário — os adaptadores de dados abertos, a matriz de pesquisa e o
// serviço de processos — e a matriz vinha importando um serviço só para ler
// seis strings, invertendo a direção da dependência.
//
// Duplicar as strings resolveria o import e criaria um problema pior: dois
// conjuntos iguais divergem na primeira alteração, e a divergência apareceria
// como um vínculo que a interface não sabe classificar.
//
// A distinção que estes valores preservam é a que separa evidência de acusação:
// aparecer num processo do controle externo não é ser parte dele, e ser parte
// não é ser responsável.
// ==========================================================

const RELATIONSHIP_TYPE = Object.freeze({
  /** A entidade é a contratada cujo instrumento está sob exame. */
  CONTRACTOR: 'CONTRACTOR',
  /** A entidade figura formalmente como parte ou interessada. */
  PARTY: 'PARTY',
  /** O nome aparece no corpo do documento, sem posição definida. */
  MENTIONED: 'MENTIONED',
  /** Vínculo indireto — sócio, empresa do grupo — ainda a confirmar. */
  RELATED: 'RELATED',
  /** Não foi possível determinar o papel a partir da fonte. */
  UNKNOWN: 'UNKNOWN',
  /** A identidade não se sustenta: o registro não é desta entidade. */
  FALSE_POSITIVE: 'FALSE_POSITIVE',
});

/** Vínculos em que a entidade é efetivamente sujeito do registro. */
const ATTRIBUTABLE_RELATIONSHIPS = Object.freeze([
  RELATIONSHIP_TYPE.CONTRACTOR,
  RELATIONSHIP_TYPE.PARTY,
]);

/**
 * O registro pode ser atribuído à entidade como fato dela.
 * MENTIONED e RELATED continuam visíveis, mas como contexto a confirmar.
 */
function isAttributable(relationshipType) {
  return ATTRIBUTABLE_RELATIONSHIPS.includes(relationshipType);
}

module.exports = { RELATIONSHIP_TYPE, ATTRIBUTABLE_RELATIONSHIPS, isAttributable };
