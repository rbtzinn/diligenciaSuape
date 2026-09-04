// ==========================================================
// DILIGÊNCIA 360 — Modelo de contrato e de evento contratual
// ==========================================================
// Transforma os registros já normalizados pela camada TCE-PE em contrato com
// linha de eventos. Não consulta nada: opera sobre o que a Fase TCE-PE coletou.
//
// A pergunta desta camada é "o que aconteceu com este contrato?". Ela não é, e
// não deve virar, "este contrato é suspeito?".
//
// TRÊS LIMITES QUE ESTE ARQUIVO NÃO ATRAVESSA:
//
// 1. NÃO INTERPRETA. Um evento afirma o que a fonte publica — "o termo aditivo
//    registra valor de R$ 999.134,18", "a vigência do termo vai além da vigência
//    do contrato". Não existe aqui "acréscimo indevido" nem "acima do limite":
//    a leitura jurídica depende de objeto, fundamento e regime, e pertence à
//    análise humana e ao Pattern Engine.
//
// 2. NÃO CALCULA PERCENTUAL. O valor bruto de cada termo é preservado com o
//    sinal da fonte. Dividir um aditivo pelo valor inicial produziria um número
//    que se parece com o percentual legal sem o ser — reajuste, reequilíbrio e
//    acréscimo entram na conta de formas diferentes, e a base correta depende
//    de informação que estes datasets não publicam.
//
// 3. NÃO INVENTA DATA. Quando a fonte não publica data, o evento fica sem data
//    e a linha do tempo declara que a ordenação está incompleta.
// ==========================================================

const crypto = require('crypto');
const { RELATIONSHIP_TYPE } = require('../domain/relationship-type');

/**
 * Naturezas de evento contratual.
 *
 * Só são atribuídas quando um campo da própria fonte as sustenta: o sinal do
 * valor, as datas de vigência, a situação registrada ou uma palavra que o órgão
 * escreveu na justificativa. Nenhuma decorre de contagem, limite ou comparação.
 */
const CONTRACT_EVENT_TYPE = Object.freeze({
  /** O contrato foi firmado. Sustentado pelo próprio registro do contrato. */
  CONTRACT_CREATED: 'CONTRACT_CREATED',
  /** Existe termo aditivo. É o fato-base de todo aditivo. */
  ADDITIVE: 'ADDITIVE',
  /** O termo registra valor positivo. */
  VALUE_ADDITION: 'VALUE_ADDITION',
  /** O termo registra valor negativo — a própria fonte grava a redução. */
  VALUE_SUPPRESSION: 'VALUE_SUPPRESSION',
  /** A vigência do termo ultrapassa a vigência vigente do contrato. */
  TERM_EXTENSION: 'TERM_EXTENSION',
  /** A vigência do termo encerra antes da vigência vigente do contrato. */
  TERM_REDUCTION: 'TERM_REDUCTION',
  /** A justificativa do órgão menciona alteração quantitativa. */
  QUANTITATIVE_CHANGE: 'QUANTITATIVE_CHANGE',
  /** A justificativa do órgão menciona alteração qualitativa. */
  QUALITATIVE_CHANGE: 'QUALITATIVE_CHANGE',
  /**
   * A situação registrada indica encerramento normal — contrato concluído ou
   * com vigência finalizada. NÃO é rescisão: um contrato que chegou ao fim
   * cumpriu o que foi pactuado, e tratá-lo como rompimento inverteria o fato.
   */
  CONTRACT_CLOSED: 'CONTRACT_CLOSED',
  /**
   * A situação registrada indica ruptura do vínculo — rescisão, distrato,
   * cancelamento ou extinção antecipada. Exige que a fonte diga isso; "encerrado"
   * não basta.
   */
  TERMINATION: 'TERMINATION',
  /** Registro de despesa associado ao contrato por identificador oficial. */
  PAYMENT: 'PAYMENT',
  /** Termo cuja natureza a fonte não permite determinar. */
  OTHER: 'OTHER',
});

/**
 * Força do vínculo entre um contrato e um registro de outra natureza.
 *
 * Existe porque o mesmo CNPJ aparecer em dois registros não os liga: uma
 * despesa e um contrato da mesma empresa podem ser de objetos completamente
 * distintos. Sem identificador oficial em comum, a associação permanece
 * declaradamente incerta em vez de ser afirmada.
 */
const ASSOCIATION_CONFIDENCE = Object.freeze({
  /** Identificador oficial idêntico nos dois registros. */
  CONFIRMED: 'CONFIRMED',
  /** Chave composta oficial coincide (número + ano + unidade gestora). */
  PROBABLE: 'PROBABLE',
  /** Há indício documental, mas nenhum identificador comprova o vínculo. */
  UNCERTAIN: 'UNCERTAIN',
  /** Nada liga os registros além de pertencerem à mesma empresa. */
  NOT_ASSOCIATED: 'NOT_ASSOCIATED',
});

/** Estado da ordenação cronológica de uma linha de eventos. */
const TIMELINE_ORDERING = Object.freeze({
  /** Todos os eventos têm data e a ordem é integralmente conhecida. */
  COMPLETE: 'COMPLETE',
  /** Parte dos eventos não tem data; a ordem relativa deles é desconhecida. */
  PARTIAL: 'PARTIAL',
  /** Nenhum evento tem data. Não há ordenação cronológica possível. */
  UNKNOWN: 'UNKNOWN',
});

/**
 * Precisão da data de um evento.
 *
 * Existe porque o TCE-PE quase nunca publica a data do ato: publica a vigência
 * dele. Apresentar "15/03/2025 — termo aditivo assinado" quando a fonte só
 * permite saber "vigência do termo inicia em 15/03/2025" é afirmar um fato que
 * o documento não sustenta. A distinção precisa sobreviver até a tela.
 */
const DATE_PRECISION = Object.freeze({
  /** A fonte publica a data do próprio evento. */
  EXACT: 'EXACT',
  /** A data foi lida de um campo relacionado, tipicamente a vigência. */
  APPROXIMATE: 'APPROXIMATE',
  /** Só o ano é conhecido. */
  YEAR_ONLY: 'YEAR_ONLY',
  /** A fonte não publica informação temporal para este evento. */
  UNKNOWN: 'UNKNOWN',
});

/** Confiança na data, derivada da precisão. Não é confiança de identidade. */
const DATE_CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  NONE: 'NONE',
});

const PRECISION_CONFIDENCE = Object.freeze({
  EXACT: DATE_CONFIDENCE.HIGH,
  APPROXIMATE: DATE_CONFIDENCE.MEDIUM,
  YEAR_ONLY: DATE_CONFIDENCE.LOW,
  UNKNOWN: DATE_CONFIDENCE.NONE,
});

/**
 * Resolve a melhor evidência temporal disponível para um evento.
 *
 * Nunca inventa data. Quando nada sustenta uma data, devolve UNKNOWN — o evento
 * continua existindo e a linha do tempo declara que a posição dele é ignorada.
 *
 * @param {Array<{value: any, precision: string, source: string, basis: string}>} candidates
 *   candidatos em ordem de força.
 */
function resolveEventDate(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.precision === DATE_PRECISION.YEAR_ONLY) {
      const year = String(candidate.value ?? '').match(/^(\d{4})$/);
      if (!year) continue;
      return {
        eventDate: null,
        eventYear: year[1],
        // Chave de ordenação apenas: o ano é conhecido, o dia não. O sufixo
        // 00-00 nunca é apresentado como data.
        sortKey: `${year[1]}-00-00`,
        datePrecision: DATE_PRECISION.YEAR_ONLY,
        dateConfidence: PRECISION_CONFIDENCE.YEAR_ONLY,
        dateSource: candidate.source,
        orderingBasis: candidate.basis,
      };
    }
    const iso = toIsoDate(candidate.value);
    if (!iso) continue;
    return {
      eventDate: iso,
      eventYear: iso.slice(0, 4),
      sortKey: iso,
      datePrecision: candidate.precision,
      dateConfidence: PRECISION_CONFIDENCE[candidate.precision] ?? DATE_CONFIDENCE.NONE,
      dateSource: candidate.source,
      orderingBasis: candidate.basis,
    };
  }
  return {
    eventDate: null,
    eventYear: null,
    sortKey: null,
    datePrecision: DATE_PRECISION.UNKNOWN,
    dateConfidence: DATE_CONFIDENCE.NONE,
    dateSource: null,
    orderingBasis: "A fonte não publica informação temporal para este evento.",
  };
}

// Termos que o próprio órgão escreve na justificativa do termo aditivo. A
// classe `[C?]` e as vogais opcionais existem porque o TCE-PE publica este
// campo com "?" no lugar de cada caractere acentuado — "acr?scimo",
// "prorroga??o". A corrupção está no dado publicado, não na leitura.
const QUANTITATIVE_PATTERN = /QUANTITATIV/;
const QUALITATIVE_PATTERN = /QUALITATIV/;
// Ruptura do vínculo. A fonte precisa nomear o rompimento: "Rescindido por
// Acordo Entre as Partes" é rescisão; "Concluído" não é.
const TERMINATION_PATTERN = /RESCIS[A?][O0?]|RESCINDID|DISTRATO|CANCELAD|EXTIN[C?][A?][O0?]|EXTINT/;
// Encerramento regular do contrato, por conclusão ou fim de vigência.
const CLOSED_PATTERN = /CONCLU[I?]D|ENCERRAD|FINALIZAD|FIM DE VIG[E?]NCIA/;

function stableId(...parts) {
  return crypto.createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex')
    .slice(0, 24);
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Normalização apenas para comparar texto; preserva "?" da origem. */
function normalizeForMatch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
}

/** "18/12/2018" para "2018-12-18". Devolve `null` quando não há data legível. */
function toIsoDate(value) {
  const match = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : `${year}-${month}-${day}`;
}

/**
 * Proveniência de um registro da camada TCE-PE, repassada intacta.
 * O evento derivado precisa apontar para o mesmo registro oficial que o gerou.
 */
function evidenceFrom(record) {
  return {
    source: record.source ?? null,
    provider: record.provider ?? null,
    endpoint: record.endpoint ?? null,
    query: record.query ?? null,
    params: record.params ?? null,
    sourceUrl: record.sourceUrl ?? null,
    linkArquivo: record.linkArquivo ?? null,
    retrievedAt: record.retrievedAt ?? null,
    // Registro bruto do TCE-PE que originou o evento. Sem ele, um fato derivado
    // não poderia ser conferido contra o que a fonte publicou.
    raw: record.raw ?? null,
  };
}

/**
 * Chave composta oficial do contrato, usada quando o `codigoContrato` do LICON
 * não está presente. Número sozinho não serve: "069" se repete em todo órgão.
 */
function contractCompositeKey(record) {
  return [
    text(record.numeroContrato),
    text(record.anoContrato),
    text(record.codigoUG) || text(record.unidadeGestora),
  ].join('|');
}

/**
 * Contrato normalizado da camada de inteligência contratual.
 *
 * @param {object} record contrato já normalizado por `tce-pe.adapters`.
 * @param {object} [context]
 * @param {string} [context.uf] UF da jurisdição da fonte ou da entidade.
 */
function buildContract(record, context = {}) {
  const derivedFields = [];

  // O dataset de contratos do TCE-PE não publica UF: publica município e
  // esfera. A UF vem da jurisdição do próprio Tribunal, e o campo abaixo
  // registra que ela é derivada — não é dado do registro.
  let uf = null;
  if (context.uf) {
    uf = context.uf;
    derivedFields.push({
      field: 'uf',
      origem: 'CONTEXTO_DA_ENTIDADE',
      nota: 'O dataset de contratos do TCE-PE não publica UF. Valor derivado do perfil da entidade.',
    });
  }

  return {
    id: stableId('contract', record.provider, record.codigoContrato || contractCompositeKey(record)),
    codigoContrato: record.codigoContrato ?? null,
    numeroContrato: record.numeroContrato ?? null,
    anoContrato: record.anoContrato ?? null,
    codigoPL: record.codigoPL ?? null,
    numeroProcesso: record.numeroProcesso ?? null,
    anoProcesso: record.anoProcesso ?? null,
    tipoProcesso: record.tipoProcesso ?? null,
    unidadeGestora: record.unidadeGestora ?? null,
    unidadeOrcamentaria: record.unidadeOrcamentaria ?? null,
    siglaUG: record.siglaUG ?? null,
    codigoUG: record.codigoUG ?? null,
    esfera: record.esfera ?? null,
    esferaNome: record.esferaNome ?? null,
    municipio: record.municipio ?? null,
    uf,
    cnpj: record.cpfCnpj ?? null,
    cnpjNormalizado: record.cpfCnpjNormalizado ?? null,
    razaoSocial: record.razaoSocial ?? null,
    objeto: record.objeto ?? null,
    // `valor` do dataset é o valor do contrato tal como assinado.
    valorInicial: record.valor ?? null,
    // O TCE-PE não publica valor atualizado no dataset de contratos. Permanece
    // nulo de propósito: somar aditivos aqui produziria um número que parece
    // oficial sem ser — acréscimo, reajuste e reequilíbrio têm naturezas
    // distintas, e a consolidação é trabalho de fase posterior.
    valorAtualizado: null,
    valorAtualizadoDisponivel: false,
    vigenciaInicial: record.vigenciaInicio ?? null,
    vigenciaFinal: record.vigenciaFim ?? null,
    vigenciaInicialIso: toIsoDate(record.vigenciaInicio),
    vigenciaFinalIso: toIsoDate(record.vigenciaFim),
    situacao: record.situacao ?? null,
    estagio: record.estagio ?? null,
    relationshipType: record.relationshipType ?? RELATIONSHIP_TYPE.UNKNOWN,
    entityMatch: record.entityMatch ?? null,
    ...evidenceFrom(record),
    derivedFields,
    compositeKey: contractCompositeKey(record),
  };
}

/** Evento de assinatura. Sustentado pelo registro do contrato em si. */
function buildContractCreatedEvent(contract) {
  // O TCE-PE não publica data de assinatura do contrato: publica a vigência.
  // A data abaixo é, portanto, aproximada, e o campo `datePrecision` carrega
  // essa limitação até a tela.
  const temporal = resolveEventDate([
    { value: contract.vigenciaInicial, precision: DATE_PRECISION.APPROXIMATE,
      source: 'vigenciaInicial do contrato',
      basis: 'Início de vigência publicado pelo TCE-PE. A fonte não publica a data de assinatura.' },
    { value: contract.anoContrato, precision: DATE_PRECISION.YEAR_ONLY,
      source: 'anoContrato',
      basis: 'Somente o ano do contrato é conhecido.' },
  ]);
  const date = temporal.eventDate;
  return {
    id: stableId('event', contract.id, CONTRACT_EVENT_TYPE.CONTRACT_CREATED),
    contractId: contract.id,
    type: CONTRACT_EVENT_TYPE.CONTRACT_CREATED,
    types: [CONTRACT_EVENT_TYPE.CONTRACT_CREATED],
    sequence: 0,
    date,
    year: contract.anoContrato ?? temporal.eventYear,
    dateKnown: Boolean(date),
    ...temporal,
    description: `Contrato ${contract.numeroContrato ?? 's/n'}/${contract.anoContrato ?? 's/a'} `
      + `registrado na unidade gestora ${contract.unidadeGestora ?? 'não informada'}.`,
    value: contract.valorInicial,
    objeto: contract.objeto,
    justificativa: null,
    vigenciaInicial: contract.vigenciaInicial,
    vigenciaFinal: contract.vigenciaFinal,
    numeroTermoAditivo: null,
    anoTermoAditivo: null,
    source: contract.source,
    provider: contract.provider,
    endpoint: contract.endpoint,
    query: contract.query,
    params: contract.params,
    sourceUrl: contract.sourceUrl,
    linkArquivo: contract.linkArquivo,
    retrievedAt: contract.retrievedAt,
    raw: contract.raw,
  };
}

/**
 * Evento de desfecho do contrato, quando a situação publicada o nomeia.
 *
 * É aqui que a distinção mais importa. "Concluído" e "Rescindido por Acordo
 * Entre as Partes" são os dois desfechos que o TCE-PE publica, e são fatos
 * opostos: o primeiro é o contrato tendo cumprido o que foi pactuado, o segundo
 * é o vínculo tendo sido rompido antes disso. Colapsá-los num tipo só faria um
 * contrato bem executado aparecer como contrato rompido.
 *
 * Devolve `null` quando a situação não nomeia desfecho algum — "Regular" é
 * situação de contrato em curso, e não desfecho.
 */
function buildContractClosureEvent(contract) {
  const situacao = normalizeForMatch(contract.situacao);
  if (!situacao) return null;

  let type = null;
  let basis = null;
  if (TERMINATION_PATTERN.test(situacao)) {
    type = CONTRACT_EVENT_TYPE.TERMINATION;
    basis = `A situação do contrato nomeia ruptura do vínculo: "${contract.situacao}".`;
  } else if (CLOSED_PATTERN.test(situacao)) {
    type = CONTRACT_EVENT_TYPE.CONTRACT_CLOSED;
    basis = `A situação do contrato indica encerramento regular: "${contract.situacao}". `
      + 'Encerramento não é rescisão.';
  }
  if (!type) return null;

  // O TCE-PE não publica a data do desfecho: publica o fim da vigência.
  const temporal = resolveEventDate([
    { value: contract.vigenciaFinal, precision: DATE_PRECISION.APPROXIMATE,
      source: 'vigenciaFinal do contrato',
      basis: 'Fim de vigência publicado pelo TCE-PE. A fonte não publica a data do desfecho.' },
    { value: contract.anoContrato, precision: DATE_PRECISION.YEAR_ONLY,
      source: 'anoContrato', basis: 'Somente o ano do contrato é conhecido.' },
  ]);

  return {
    id: stableId('event', contract.id, type),
    contractId: contract.id,
    type,
    types: [type],
    typeBasis: [basis],
    // Número alto para o desfecho ficar por último entre eventos sem data.
    sequence: 9_000,
    date: temporal.eventDate,
    year: contract.anoContrato ?? temporal.eventYear,
    dateKnown: Boolean(temporal.eventDate),
    ...temporal,
    description: type === CONTRACT_EVENT_TYPE.TERMINATION
      ? `Contrato com situação "${contract.situacao}".`
      : `Contrato encerrado com situação "${contract.situacao}".`,
    value: null,
    objeto: contract.objeto,
    justificativa: null,
    vigenciaInicial: contract.vigenciaInicial,
    vigenciaFinal: contract.vigenciaFinal,
    numeroTermoAditivo: null,
    anoTermoAditivo: null,
    situacao: contract.situacao,
    estagio: contract.estagio,
    relationshipType: contract.relationshipType,
    entityMatch: contract.entityMatch,
    source: contract.source,
    provider: contract.provider,
    endpoint: contract.endpoint,
    query: contract.query,
    params: contract.params,
    sourceUrl: contract.sourceUrl,
    linkArquivo: contract.linkArquivo,
    retrievedAt: contract.retrievedAt,
    raw: contract.raw,
  };
}
/**
 * Classifica um termo aditivo nas naturezas que a fonte sustenta.
 *
 * Cada natureza abaixo tem um campo publicado que a suporta. Nenhuma decorre de
 * limite, contagem ou comparação com outros contratos.
 */
function classifyAdditive(additive, contract) {
  const types = [CONTRACT_EVENT_TYPE.ADDITIVE];
  const basis = [];

  const value = additive.valorTermoAditivo;
  if (typeof value === 'number' && value > 0) {
    types.push(CONTRACT_EVENT_TYPE.VALUE_ADDITION);
    basis.push('O termo registra valor positivo no campo ValorTermoAditivo.');
  } else if (typeof value === 'number' && value < 0) {
    // O sinal negativo é a própria fonte registrando redução; nada é inferido.
    types.push(CONTRACT_EVENT_TYPE.VALUE_SUPPRESSION);
    basis.push('O termo registra valor negativo no campo ValorTermoAditivo.');
  }

  // Vigência do termo comparada à do contrato. Só quando as duas datas existem.
  const termEnd = toIsoDate(additive.vigenciaFim);
  const contractEnd = contract?.vigenciaFinalIso ?? null;
  if (termEnd && contractEnd) {
    if (termEnd > contractEnd) {
      types.push(CONTRACT_EVENT_TYPE.TERM_EXTENSION);
      basis.push(`A vigência do termo (${additive.vigenciaFim}) ultrapassa a do contrato (${contract.vigenciaFinal}).`);
    } else if (termEnd < contractEnd) {
      types.push(CONTRACT_EVENT_TYPE.TERM_REDUCTION);
      basis.push(`A vigência do termo (${additive.vigenciaFim}) encerra antes da do contrato (${contract.vigenciaFinal}).`);
    }
  }

  const justification = normalizeForMatch(
    [additive.justificativaTermoAditivo, additive.objetoAditivo].filter(Boolean).join(' '),
  );
  if (QUANTITATIVE_PATTERN.test(justification)) {
    types.push(CONTRACT_EVENT_TYPE.QUANTITATIVE_CHANGE);
    basis.push('A justificativa registrada pelo órgão menciona alteração quantitativa.');
  }
  if (QUALITATIVE_PATTERN.test(justification)) {
    types.push(CONTRACT_EVENT_TYPE.QUALITATIVE_CHANGE);
    basis.push('A justificativa registrada pelo órgão menciona alteração qualitativa.');
  }
  // Rescisão e encerramento são fatos opostos e não podem colapsar num tipo só.
  // "Rescindido por Acordo Entre as Partes" é ruptura; "Concluído" é o contrato
  // tendo cumprido o que foi pactuado.
  const situacao = normalizeForMatch(additive.situacao);
  if (TERMINATION_PATTERN.test(situacao)) {
    types.push(CONTRACT_EVENT_TYPE.TERMINATION);
    basis.push(`A situação registrada nomeia ruptura do vínculo: "${additive.situacao}".`);
  } else if (CLOSED_PATTERN.test(situacao)) {
    types.push(CONTRACT_EVENT_TYPE.CONTRACT_CLOSED);
    basis.push(`A situação registrada indica encerramento regular: "${additive.situacao}". `
      + 'Encerramento não é rescisão.');
  }

  if (types.length === 1) basis.push('A fonte não publica campo que permita determinar a natureza do termo.');
  return { types, basis };
}

/**
 * Evento de termo aditivo. Cada termo é um evento próprio: o segundo aditivo
 * não substitui o primeiro, e o contrato original nunca é sobrescrito.
 */
function buildAdditiveEvent(additive, contract, sequence) {
  const { types, basis } = classifyAdditive(additive, contract);
  // Mesma limitação do contrato, e mais aguda: o TCE-PE não publica a data de
  // assinatura do termo aditivo em nenhum campo. A vigência é a melhor
  // aproximação existente, e é declarada como aproximação.
  const temporal = resolveEventDate([
    { value: additive.vigenciaInicio, precision: DATE_PRECISION.APPROXIMATE,
      source: 'vigenciaInicio do termo aditivo',
      basis: 'Início de vigência do termo publicado pelo TCE-PE. A fonte não publica a data de assinatura do aditivo.' },
    { value: additive.anoTermoAditivo, precision: DATE_PRECISION.YEAR_ONLY,
      source: 'anoTermoAditivo',
      basis: 'Somente o ano do termo aditivo é conhecido.' },
  ]);
  const date = temporal.eventDate;
  const numero = additive.numeroTermoAditivo ?? 's/n';

  return {
    id: stableId(
      'event',
      contract?.id ?? additive.codigoContrato ?? additive.numeroContrato,
      'ADITIVO',
      numero,
      additive.anoTermoAditivo ?? '',
    ),
    contractId: contract?.id ?? null,
    type: CONTRACT_EVENT_TYPE.ADDITIVE,
    // Um termo costuma acumular naturezas — prazo E valor no mesmo instrumento.
    // Guardar só uma perderia metade do fato.
    types,
    typeBasis: basis,
    sequence,
    date,
    year: additive.anoTermoAditivo ?? temporal.eventYear,
    dateKnown: Boolean(date),
    ...temporal,
    description: `${numero}º termo aditivo ao contrato `
      + `${additive.numeroContrato ?? 's/n'}/${additive.anoContrato ?? 's/a'}.`,
    // Valor bruto, com o sinal da fonte. Sem percentual e sem consolidação.
    value: additive.valorTermoAditivo ?? null,
    objeto: additive.objetoAditivo ?? null,
    justificativa: additive.justificativaTermoAditivo ?? null,
    vigenciaInicial: additive.vigenciaInicio ?? null,
    vigenciaFinal: additive.vigenciaFim ?? null,
    numeroTermoAditivo: additive.numeroTermoAditivo ?? null,
    anoTermoAditivo: additive.anoTermoAditivo ?? null,
    situacao: additive.situacao ?? null,
    estagio: additive.estagio ?? null,
    relationshipType: additive.relationshipType ?? RELATIONSHIP_TYPE.UNKNOWN,
    entityMatch: additive.entityMatch ?? null,
    ...evidenceFrom(additive),
  };
}

/**
 * Liga um termo aditivo ao contrato, por identificador oficial.
 *
 * O CNPJ em comum não é considerado: toda a carteira compartilha o mesmo CNPJ,
 * e usá-lo ligaria qualquer aditivo a qualquer contrato.
 */
function associateAdditive(additive, contracts) {
  const codigo = text(additive.codigoContrato);
  if (codigo) {
    const match = contracts.find((contract) => text(contract.codigoContrato) === codigo);
    if (match) {
      return {
        contract: match,
        confidence: ASSOCIATION_CONFIDENCE.CONFIRMED,
        basis: `Código do contrato no LICON coincide (${codigo}).`,
      };
    }
  }

  const composite = contractCompositeKey(additive);
  if (text(additive.numeroContrato) && text(additive.anoContrato)) {
    const match = contracts.find((contract) => contract.compositeKey === composite);
    if (match) {
      return {
        contract: match,
        confidence: ASSOCIATION_CONFIDENCE.PROBABLE,
        basis: `Número, ano e unidade gestora coincidem (${composite}).`,
      };
    }
  }

  // O contrato de origem não veio nesta coleta. O termo existe e é preservado
  // como órfão declarado; inventar um contrato para ele seria pior.
  return {
    contract: null,
    confidence: ASSOCIATION_CONFIDENCE.NOT_ASSOCIATED,
    basis: codigo
      ? `Nenhum contrato coletado possui o código ${codigo}.`
      : 'O termo não traz identificador que permita ligá-lo a um contrato desta coleta.',
  };
}

/**
 * Ordena eventos e declara a completude da ordenação.
 *
 * Evento sem data não é descartado nem recebe data inventada: vai para o fim,
 * mantendo a ordem de sequência, e a linha do tempo passa a PARTIAL.
 */
function buildTimeline(events) {
  const withDate = events.filter((event) => event.dateKnown);
  const withoutDate = events.filter((event) => !event.dateKnown);

  const ordered = [
    ...withDate.sort((left, right) => (
      left.date === right.date ? left.sequence - right.sequence : left.date.localeCompare(right.date)
    )),
    ...withoutDate.sort((left, right) => left.sequence - right.sequence),
  ];

  let ordering = TIMELINE_ORDERING.COMPLETE;
  if (withDate.length === 0 && events.length > 0) ordering = TIMELINE_ORDERING.UNKNOWN;
  else if (withoutDate.length > 0) ordering = TIMELINE_ORDERING.PARTIAL;

  return {
    events: ordered,
    ordering,
    eventosComData: withDate.length,
    eventosSemData: withoutDate.length,
    periodo: withDate.length > 0
      ? { inicio: ordered.find((event) => event.dateKnown)?.date ?? null, fim: withDate[withDate.length - 1].date }
      : null,
    aviso: ordering === TIMELINE_ORDERING.COMPLETE
      ? null
      : `${withoutDate.length} evento(s) não possuem data na fonte. A ordenação cronológica está incompleta `
        + 'e a posição desses eventos na linha do tempo não é conhecida.',
  };
}

/**
 * Chave de deduplicação de evento.
 *
 * Aditivo 1 e aditivo 2 do mesmo contrato são eventos distintos; o mesmo
 * aditivo devolvido duas vezes pela API é um só. Nunca por texto do objeto:
 * termos diferentes costumam repetir o mesmo objeto.
 */
function eventDedupeKey(event) {
  if (event.type === CONTRACT_EVENT_TYPE.CONTRACT_CREATED) {
    return `CONTRACT_CREATED:${event.contractId}`;
  }
  return [
    'ADDITIVE',
    event.contractId ?? 'sem-contrato',
    event.numeroTermoAditivo ?? 's/n',
    event.anoTermoAditivo ?? 's/a',
  ].join(':');
}

function dedupeEvents(events) {
  const merged = new Map();
  for (const event of events) {
    const key = eventDedupeKey(event);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...event, dedupeKey: key, duplicatesMerged: 0 });
      continue;
    }
    current.duplicatesMerged += 1;
  }
  return [...merged.values()];
}

module.exports = {
  CONTRACT_EVENT_TYPE,
  ASSOCIATION_CONFIDENCE,
  TIMELINE_ORDERING,
  DATE_PRECISION,
  DATE_CONFIDENCE,
  resolveEventDate,
  buildContract,
  buildContractCreatedEvent,
  buildContractClosureEvent,
  buildAdditiveEvent,
  classifyAdditive,
  associateAdditive,
  buildTimeline,
  dedupeEvents,
  eventDedupeKey,
  contractCompositeKey,
  toIsoDate,
  evidenceFrom,
};
