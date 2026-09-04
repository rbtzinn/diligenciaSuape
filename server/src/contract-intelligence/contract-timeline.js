// ==========================================================
// DILIGÊNCIA 360 — Linha do tempo do contrato
// ==========================================================
// Ordena os eventos que a Contract Intelligence já produziu e acrescenta o que
// outras fontes sustentam com data confiável: a licitação que originou o
// contrato, os empenhos associados e os processos de controle externo.
//
// Responde "o que aconteceu, e em que momento". Não responde "isso é regular?".
//
// O QUE ESTA CAMADA PROTEGE, E QUE UMA LINHA DO TEMPO INGÊNUA DESTRUIRIA:
//
// 1. A DIFERENÇA ENTRE DATA E APROXIMAÇÃO. O TCE-PE não publica a data de
//    assinatura do termo aditivo — publica a vigência dele. Escrever
//    "15/03/2025 — termo aditivo assinado" afirmaria um fato que documento
//    nenhum sustenta. Cada entrada carrega `datePrecision` e `dateSource` até a
//    tela, e a tela precisa mostrá-los.
//
// 2. A DIFERENÇA ENTRE VIGÊNCIA E EXECUÇÃO. Um contrato vigente de janeiro a
//    dezembro não foi, por isso, executado o ano inteiro. O intervalo publicado
//    é apresentado como vigência, jamais como período de execução.
//
// 3. A DIFERENÇA ENTRE ORDEM TÉCNICA E ORDEM CRONOLÓGICA. Dois eventos na mesma
//    data são desempatados de forma determinística só para a interface não
//    tremer entre execuções. Esse desempate NÃO é prova de precedência, e o
//    campo `orderWithinDateIsTechnical` diz isso.
//
// 4. A DIFERENÇA ENTRE AUSÊNCIA E DESCONHECIMENTO. Fonte EMPTY respondeu e nada
//    havia; fonte UNAVAILABLE não respondeu. As duas produzem lista vazia e
//    significam o oposto.
// ==========================================================

const { SOURCE_STATUS } = require('../domain/source-status');
const { RELATIONSHIP_TYPE } = require('../domain/relationship-type');
const {
  CONTRACT_EVENT_TYPE,
  ASSOCIATION_CONFIDENCE,
  DATE_PRECISION,
  DATE_CONFIDENCE,
  TIMELINE_ORDERING,
  resolveEventDate,
} = require('./contract.model');

/**
 * Ordem determinística entre eventos de mesma data. Serve à estabilidade da
 * interface e a nada mais: não afirma que o contrato precede o aditivo naquele
 * dia, apenas que a lista não muda de ordem entre duas execuções.
 */
const TYPE_ORDER = Object.freeze({
  LICITACAO: 0,
  [CONTRACT_EVENT_TYPE.CONTRACT_CREATED]: 1,
  [CONTRACT_EVENT_TYPE.ADDITIVE]: 2,
  EMPENHO: 3,
  PROCESSO: 4,
  [CONTRACT_EVENT_TYPE.CONTRACT_CLOSED]: 5,
  [CONTRACT_EVENT_TYPE.TERMINATION]: 6,
});

const PRECISION_RANK = Object.freeze({ EXACT: 0, APPROXIMATE: 1, YEAR_ONLY: 2, UNKNOWN: 3 });

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** "2026-06-09 00:00:00.0" e "09/06/2026" para "2026-06-09". */
function toIso(value) {
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

/**
 * Detecta discordância entre duas datas oficiais do mesmo evento.
 *
 * Não escolhe uma delas. Preserva as duas com as respectivas origens e marca o
 * conflito: resolver discordância documental exige ler o documento, e isso é
 * fase posterior.
 */
function detectTemporalConflict(event) {
  const declaredYear = text(event.anoTermoAditivo) || text(event.year);
  const derivedYear = event.eventYear;
  if (!declaredYear || !derivedYear || declaredYear === derivedYear) return null;
  return {
    temporalConflict: true,
    conflitos: [
      { valor: derivedYear, origem: event.dateSource ?? 'data do evento' },
      { valor: declaredYear, origem: 'ano declarado no registro' },
    ],
    nota: `O ano derivado da data (${derivedYear}) diverge do ano declarado no registro `
      + `(${declaredYear}). As duas informações são oficiais e foram preservadas; a divergência `
      + 'não é resolvida automaticamente.',
  };
}

/** Entrada da linha do tempo, com toda a proveniência que a sustenta. */
function buildEntry(base) {
  return {
    id: base.id,
    kind: base.kind,
    type: base.type,
    types: base.types ?? [base.type],
    label: base.label,
    description: base.description ?? null,
    eventDate: base.eventDate ?? null,
    eventYear: base.eventYear ?? null,
    sortKey: base.sortKey ?? null,
    datePrecision: base.datePrecision ?? DATE_PRECISION.UNKNOWN,
    dateConfidence: base.dateConfidence ?? DATE_CONFIDENCE.NONE,
    dateSource: base.dateSource ?? null,
    orderingBasis: base.orderingBasis ?? null,
    value: base.value ?? null,
    // Marca o valor como publicado pela fonte ou calculado pelo sistema. Nesta
    // fase nenhum valor é calculado, e o campo existe para que qualquer futuro
    // derivado não possa se passar por dado oficial.
    valueOrigin: base.value === null || base.value === undefined ? null : 'SOURCE',
    vigenciaInicial: base.vigenciaInicial ?? null,
    vigenciaFinal: base.vigenciaFinal ?? null,
    associationConfidence: base.associationConfidence ?? null,
    associationBasis: base.associationBasis ?? null,
    relationshipType: base.relationshipType ?? null,
    entityMatch: base.entityMatch ?? null,
    temporalConflict: base.temporalConflict ?? false,
    conflitos: base.conflitos ?? null,
    conflitoNota: base.nota ?? null,
    numeroTermoAditivo: base.numeroTermoAditivo ?? null,
    source: base.source ?? null,
    endpoint: base.endpoint ?? null,
    sourceUrl: base.sourceUrl ?? null,
    linkArquivo: base.linkArquivo ?? null,
    retrievedAt: base.retrievedAt ?? null,
    raw: base.raw ?? null,
  };
}

/** Eventos do próprio contrato, já produzidos pela Contract Intelligence. */
function contractEntries(profile) {
  return profile.eventos.map((event) => {
    const conflict = detectTemporalConflict(event);
    return buildEntry({
      ...event,
      ...(conflict || {}),
      kind: event.type === CONTRACT_EVENT_TYPE.CONTRACT_CREATED ? 'CONTRATO' : 'ADITIVO',
      label: event.type === CONTRACT_EVENT_TYPE.CONTRACT_CREATED
        ? `Contrato ${profile.contrato.numeroContrato ?? 's/n'}/${profile.contrato.anoContrato ?? 's/a'}`
        : `${event.numeroTermoAditivo ?? 's/n'}º termo aditivo`,
      associationConfidence: event.associationConfidence ?? ASSOCIATION_CONFIDENCE.CONFIRMED,
      associationBasis: event.associationBasis
        ?? 'Registro do próprio contrato publicado pelo TCE-PE.',
    });
  });
}

/**
 * A licitação que originou o contrato, quando associada por `codigoPL` e com
 * data publicada. Sem data confiável a licitação não entra: preencher a posição
 * dela com uma data inventada é exatamente o que esta camada evita.
 */
function bidEntries(profile) {
  const entries = [];
  for (const bid of profile.relacionamentos?.licitacoes ?? []) {
    if (bid.confidence !== ASSOCIATION_CONFIDENCE.CONFIRMED) continue;
    const temporal = resolveEventDate([
      { value: toIso(bid.dataPublicacaoHomologacao), precision: DATE_PRECISION.EXACT,
        source: 'dataPublicacaoHomologacao', basis: 'Data de publicação da homologação publicada pelo TCE-PE.' },
      { value: toIso(bid.dataSessaoAbertura), precision: DATE_PRECISION.EXACT,
        source: 'dataSessaoAbertura', basis: 'Data da sessão de abertura publicada pelo TCE-PE.' },
    ].map((candidate) => (candidate.value
      ? { ...candidate, value: candidate.value.split('-').reverse().join('/') }
      : null)));
    if (temporal.datePrecision === DATE_PRECISION.UNKNOWN) continue;

    entries.push(buildEntry({
      ...temporal,
      id: `bid:${bid.codigoPL}`,
      kind: 'LICITACAO',
      type: 'LICITACAO',
      label: `Licitação ${bid.modalidade ?? ''}`.trim(),
      description: bid.objeto ?? null,
      value: bid.valorAdjudicadoLicitante ?? null,
      associationConfidence: bid.confidence,
      associationBasis: bid.basis,
      relationshipType: bid.relationshipType ?? RELATIONSHIP_TYPE.UNKNOWN,
      source: 'TCE-PE — Dados Abertos',
      endpoint: 'LicitacoesDetalhes',
      sourceUrl: bid.sourceUrl ?? null,
      retrievedAt: bid.retrievedAt ?? null,
    }));
  }
  return entries;
}

/**
 * Empenhos associados. Entram na linha do tempo com a confiança da associação
 * declarada — hoje sempre UNCERTAIN, porque o dataset de despesas do TCE-PE não
 * publica o código do contrato.
 *
 * Empenhado, liquidado e pago são estágios do mesmo dinheiro e nunca são
 * somados: o evento carrega o valor empenhado e preserva os outros dois à parte.
 */
function expenseEntries(profile) {
  const entries = [];
  for (const expense of profile.relacionamentos?.despesas ?? []) {
    const temporal = resolveEventDate([
      { value: toIso(expense.dataEmpenho)?.split('-').reverse().join('/'), precision: DATE_PRECISION.EXACT,
        source: 'dataEmpenho', basis: 'Data do empenho publicada pelo TCE-PE.' },
      { value: expense.anoReferencia, precision: DATE_PRECISION.YEAR_ONLY,
        source: 'anoReferencia', basis: 'Somente o ano de referência do empenho é conhecido.' },
    ]);
    if (temporal.datePrecision === DATE_PRECISION.UNKNOWN) continue;

    entries.push(buildEntry({
      ...temporal,
      id: `expense:${expense.numeroEmpenho}:${expense.anoReferencia}`,
      kind: 'EMPENHO',
      type: 'EMPENHO',
      label: `Empenho ${expense.numeroEmpenho ?? 's/n'}`,
      description: 'Estágios da despesa preservados separadamente: empenhado, liquidado e pago '
        + 'são momentos do mesmo recurso e não se somam.',
      value: expense.valorEmpenhado ?? null,
      valorLiquidado: expense.valorLiquidado ?? null,
      valorPago: expense.valorPago ?? null,
      associationConfidence: expense.confidence,
      associationBasis: expense.basis,
      source: 'TCE-PE — Dados Abertos',
      endpoint: 'DespesasMunicipais',
      sourceUrl: expense.sourceUrl ?? null,
      retrievedAt: expense.retrievedAt ?? null,
    }));
  }
  return entries;
}

/**
 * Processos de controle externo relacionados.
 *
 * Falso positivo nunca entra: a identidade não se sustenta e o processo não é
 * da empresa. Relação incerta entra declarada como incerta — presença em
 * processo é fato a verificar, jamais indicador de risco.
 */
function processEntries(processes = []) {
  const entries = [];
  for (const process of processes) {
    if (process.relationshipType === RELATIONSHIP_TYPE.FALSE_POSITIVE) continue;
    if (process.relevantToEntity === false) continue;

    const temporal = resolveEventDate([
      { value: toIso(process.judgmentDate)?.split('-').reverse().join('/'), precision: DATE_PRECISION.EXACT,
        source: 'DataSessaoJulgamento', basis: 'Data da sessão de julgamento publicada pelo TCE-PE.' },
      { value: process.exercise ? String(process.exercise) : null, precision: DATE_PRECISION.YEAR_ONLY,
        source: 'exercício do processo', basis: 'Somente o exercício do processo é conhecido.' },
    ]);
    if (temporal.datePrecision === DATE_PRECISION.UNKNOWN) continue;

    const attributable = process.relationshipType === RELATIONSHIP_TYPE.CONTRACTOR
      || process.relationshipType === RELATIONSHIP_TYPE.PARTY;
    entries.push(buildEntry({
      ...temporal,
      id: `process:${process.processNumber}`,
      kind: 'PROCESSO',
      type: 'PROCESSO',
      label: `Processo ${process.processNumber ?? 's/n'}`,
      description: process.modality ?? process.type ?? null,
      relationshipType: process.relationshipType ?? RELATIONSHIP_TYPE.UNKNOWN,
      entityMatch: process.entityMatch ?? null,
      // Vínculo com a EMPRESA, não com o contrato: o TCE-PE não publica ligação
      // entre processo e contrato específico.
      associationConfidence: attributable
        ? ASSOCIATION_CONFIDENCE.PROBABLE
        : ASSOCIATION_CONFIDENCE.UNCERTAIN,
      associationBasis: attributable
        ? 'A empresa figura no processo com posição definida. O vínculo é com a empresa; '
          + 'o TCE-PE não publica ligação entre processo e contrato específico.'
        : 'A empresa é citada no processo sem posição definida. Vínculo a confirmar.',
      source: 'TCE-PE — API de Dados Abertos',
      endpoint: 'Processos',
      sourceUrl: process.processUrl ?? null,
      retrievedAt: process.retrievedAt ?? null,
      raw: process.raw ?? null,
    }));
  }
  return entries;
}

/** Ordena pela melhor evidência temporal, com desempate técnico declarado. */
function orderEntries(entries) {
  const dated = entries.filter((entry) => entry.sortKey);
  const undated = entries.filter((entry) => !entry.sortKey);

  const byTechnicalOrder = (left, right) => {
    const byPrecision = PRECISION_RANK[left.datePrecision] - PRECISION_RANK[right.datePrecision];
    if (byPrecision) return byPrecision;
    const byType = (TYPE_ORDER[left.type] ?? 99) - (TYPE_ORDER[right.type] ?? 99);
    if (byType) return byType;
    const leftTermo = Number(left.numeroTermoAditivo ?? 0);
    const rightTermo = Number(right.numeroTermoAditivo ?? 0);
    if (leftTermo !== rightTermo) return leftTermo - rightTermo;
    return String(left.id).localeCompare(String(right.id));
  };

  const ordered = [
    ...dated.sort((left, right) => (
      left.sortKey === right.sortKey ? byTechnicalOrder(left, right) : left.sortKey.localeCompare(right.sortKey)
    )),
    ...undated.sort(byTechnicalOrder),
  ];

  // Marca as entradas cuja posição relativa veio do desempate, e não de data.
  const sameKeyCounts = new Map();
  for (const entry of dated) sameKeyCounts.set(entry.sortKey, (sameKeyCounts.get(entry.sortKey) ?? 0) + 1);
  for (const entry of ordered) {
    entry.orderWithinDateIsTechnical = entry.sortKey
      ? (sameKeyCounts.get(entry.sortKey) ?? 0) > 1
      : true;
  }
  return ordered;
}

/**
 * Formulação da ausência, conforme o estado da fonte.
 * EMPTY e UNAVAILABLE produzem a mesma lista vazia e dizem o oposto.
 */
function describeAbsence(label, status) {
  if (status === SOURCE_STATUS.EMPTY) {
    return `Não foram encontrados registros de ${label} na consulta realizada.`;
  }
  if (status === SOURCE_STATUS.UNAVAILABLE || status === SOURCE_STATUS.ERROR) {
    return `Não foi possível verificar ${label} nesta consulta. A ausência na linha do tempo `
      + 'não significa que não existam.';
  }
  if (status === SOURCE_STATUS.PARTIAL) {
    return `A consulta de ${label} foi concluída apenas em parte. A linha do tempo pode estar incompleta.`;
  }
  if (status === SOURCE_STATUS.NOT_APPLICABLE) return `A fonte de ${label} não se aplica a esta entidade.`;
  return null;
}

/**
 * Monta a linha do tempo de um contrato.
 *
 * @param {object} profile `ContractProfile` da Contract Intelligence.
 * @param {object} [options]
 * @param {Array} [options.processes] processos do TCE-PE já resolvidos.
 */
function buildContractTimeline(profile, options = {}) {
  const entries = orderEntries([
    ...bidEntries(profile),
    ...contractEntries(profile),
    ...expenseEntries(profile),
    ...processEntries(options.processes ?? []),
  ]);

  const byPrecision = (precision) => entries.filter((entry) => entry.datePrecision === precision).length;
  const conflitos = entries.filter((entry) => entry.temporalConflict);
  const statuses = profile.sourceStatuses ?? {};

  const dated = entries.filter((entry) => entry.eventDate);
  const ordering = entries.length === 0
    ? TIMELINE_ORDERING.COMPLETE
    : dated.length === 0
      ? TIMELINE_ORDERING.UNKNOWN
      : dated.length < entries.length ? TIMELINE_ORDERING.PARTIAL : TIMELINE_ORDERING.COMPLETE;

  const notas = [
    describeAbsence('termos aditivos', statuses.aditivos),
    describeAbsence('licitações', statuses.licitacoes),
    describeAbsence('obras', statuses.obras),
    describeAbsence('despesas', statuses.despesas),
  ].filter(Boolean);

  return {
    contractId: profile.contrato.id,
    entries,
    ordering,
    // Vigência publicada — não é período de execução. A distinção é substantiva:
    // um contrato vigente pode não ter sido executado um único dia.
    vigencia: {
      inicial: profile.contrato.vigenciaInicial,
      final: profile.contrato.vigenciaFinal,
      nota: 'Intervalo de vigência publicado pelo TCE-PE. Vigência não é execução: '
        + 'a fonte não informa o que foi efetivamente executado no período.',
    },
    cobertura: {
      totalEventos: entries.length,
      eventosComDataExata: byPrecision(DATE_PRECISION.EXACT),
      eventosComDataAproximada: byPrecision(DATE_PRECISION.APPROXIMATE),
      eventosApenasComAno: byPrecision(DATE_PRECISION.YEAR_ONLY),
      eventosSemData: byPrecision(DATE_PRECISION.UNKNOWN),
      conflitosTemporais: conflitos.length,
      fontesSuccess: Object.values(statuses).filter((status) => status === SOURCE_STATUS.SUCCESS).length,
      fontesEmpty: Object.values(statuses).filter((status) => status === SOURCE_STATUS.EMPTY).length,
      fontesPartial: Object.values(statuses).filter((status) => status === SOURCE_STATUS.PARTIAL).length,
      fontesUnavailable: Object.values(statuses).filter((status) => (
        status === SOURCE_STATUS.UNAVAILABLE || status === SOURCE_STATUS.ERROR
      )).length,
    },
    notasDeCobertura: notas,
    aviso: byPrecision(DATE_PRECISION.UNKNOWN) > 0
      ? `${byPrecision(DATE_PRECISION.UNKNOWN)} evento(s) sem data na fonte. A posição deles na linha `
        + 'do tempo não é conhecida e não foi estimada.'
      : null,
    limitacao: 'Linha do tempo construída a partir dos dados oficiais efetivamente disponíveis e '
      + 'consultados. Não representa toda a história do contrato. O TCE-PE não publica data de '
      + 'assinatura de contrato nem de termo aditivo: as datas desses eventos derivam da vigência '
      + 'publicada e estão marcadas como aproximadas.',
  };
}

module.exports = {
  buildContractTimeline,
  orderEntries,
  detectTemporalConflict,
  describeAbsence,
  bidEntries,
  expenseEntries,
  processEntries,
  contractEntries,
  TYPE_ORDER,
};
