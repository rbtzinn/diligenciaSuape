// ==========================================================
// DILIGÊNCIA 360 — Modelo documental
// ==========================================================
// Organiza os documentos que as fontes já publicaram, com origem, vínculo e
// disponibilidade declarados. Opera sobre registros já coletados: não consulta
// a rede e não cria coletor novo.
//
// A DISTINÇÃO QUE ESTE ARQUIVO EXISTE PARA PROTEGER
//
// Uma URL publicada não é um documento lido. O TCE-PE publica o endereço do PDF
// de todo contrato e de quase todo termo aditivo — mas publicar o endereço não
// é entregar o conteúdo, e ter o endereço não autoriza afirmar o que o
// documento diz.
//
// Por isso há dois campos separados, e eles nunca se confundem:
//
//   `publishedMetadata` — fatos que a API publicou no registro. São reais,
//                         observáveis e existem mesmo sem abrir o PDF.
//   `extractedFacts`    — fatos lidos DE DENTRO do documento. Só existem quando
//                         o conteúdo foi obtido e efetivamente processado.
//
// Documento cujo conteúdo não foi obtido tem `extractedFacts` vazio. Sempre.
// Preencher esse campo com metadado da API faria a interface exibir "extraído
// do documento" para algo que ninguém leu.
//
// Nada aqui classifica risco. Tipo documental é natureza do papel, não juízo
// sobre a empresa: não existe `FRAUD_REPORT` nem `IRREGULARITY`.
// ==========================================================

const crypto = require('crypto');
const { DATE_PRECISION, DATE_CONFIDENCE, resolveEventDate } = require('../contract-intelligence/contract.model');

/** Naturezas documentais sustentadas pelas fontes atuais. */
const DOCUMENT_TYPE = Object.freeze({
  /** Instrumento contratual publicado pelo LICON/TCE-PE. */
  CONTRACT: 'CONTRACT',
  /** Termo aditivo ao contrato. */
  ADDITIVE: 'ADDITIVE',
  /** Peça do processo licitatório. */
  TENDER: 'TENDER',
  /** Autos do processo de controle externo. */
  PROCESS: 'PROCESS',
  /** Acórdão ou parecer do processo. */
  DECISION: 'DECISION',
  /** Documento cuja natureza a fonte não permite determinar. */
  OTHER: 'OTHER',
});

/**
 * Estado do CONTEÚDO do documento — não do registro que o referencia.
 *
 * `REFERENCED` e `EMPTY` são opostos que uma lista vazia esconderia: no
 * primeiro existe documento e não o buscamos; no segundo a fonte respondeu e
 * não publicou documento algum.
 */
const DOCUMENT_STATUS = Object.freeze({
  /** A fonte publicou a URL. O conteúdo não foi obtido. */
  REFERENCED: 'REFERENCED',
  /** O conteúdo foi obtido e pode ser processado. */
  AVAILABLE: 'AVAILABLE',
  /** Havia referência, mas o conteúdo não pôde ser obtido. */
  UNAVAILABLE: 'UNAVAILABLE',
  /** A fonte respondeu corretamente e não publicou documento. */
  EMPTY: 'EMPTY',
  /** Erro técnico ao obter ou processar. */
  ERROR: 'ERROR',
});

/** Estado da extração de fatos de dentro do documento. */
const EXTRACTION_STATUS = Object.freeze({
  /** Não foi tentada. Estado inicial de todo documento apenas referenciado. */
  NOT_ATTEMPTED: 'NOT_ATTEMPTED',
  /** Concluída, com fatos extraídos do conteúdo. */
  SUCCESS: 'SUCCESS',
  /** O conteúdo foi obtido, mas a leitura falhou. Não é ausência de documento. */
  ERROR: 'ERROR',
  /**
   * O conteúdo é imagem digitalizada, sem camada de texto. Extrair exigiria OCR,
   * que não faz parte desta fase. O documento existe e está disponível — o que
   * falta é a capacidade de lê-lo.
   */
  OCR_REQUIRED: 'OCR_REQUIRED',
  /** Não há conteúdo a extrair. */
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

/**
 * Força do vínculo entre o documento e o objeto a que ele se refere.
 * Documento com vínculo incerto continua existindo: descartá-lo perderia um
 * registro oficial por causa de uma limitação nossa, não da fonte.
 */
const LINK_CONFIDENCE = Object.freeze({
  /** Identificador oficial liga documento e objeto. */
  CONFIRMED: 'CONFIRMED',
  /** Chave composta oficial coincide. */
  PROBABLE: 'PROBABLE',
  /** Há indício documental, sem identificador que comprove. */
  CONTEXTUAL: 'CONTEXTUAL',
  /** Não foi possível determinar o vínculo. */
  UNKNOWN: 'UNKNOWN',
});

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableId(...parts) {
  return crypto.createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex')
    .slice(0, 24);
}

/**
 * Um fato publicado pela fonte, com o campo original preservado.
 *
 * `field` é o nome do campo na API e `value` é o valor como veio. A
 * interpretação nunca substitui o original: quem revisa precisa poder conferir
 * o que o Tribunal publicou, e não apenas o que este sistema entendeu.
 */
function fact(field, value, rule) {
  const normalized = typeof value === 'number' ? value : text(value);
  if (normalized === '' || normalized === null || normalized === undefined) return null;
  return { field, value: normalized, rule, origin: 'PUBLISHED_METADATA' };
}

/**
 * Fatos que a fonte publicou no registro — não no documento.
 *
 * Existem independentemente de o PDF ter sido aberto, e por isso ficam em campo
 * próprio. Cada um declara de qual campo da API veio e por qual regra.
 */
function publishedMetadataFor(record, type) {
  const facts = [];
  const push = (field, value, rule) => {
    const item = fact(field, value, rule);
    if (item) facts.push(item);
  };

  if (type === DOCUMENT_TYPE.CONTRACT) {
    push('numeroContrato', record.numeroContrato, 'Número do contrato publicado no dataset Contratos.');
    push('anoContrato', record.anoContrato, 'Ano do contrato publicado no dataset Contratos.');
    push('codigoContrato', record.codigoContrato, 'Código do contrato no LICON.');
    push('objeto', record.objeto, 'Objeto publicado no registro do contrato.');
    push('valor', record.valorInicial ?? record.valor, 'Valor do contrato publicado pela fonte.');
    push('vigencia', record.vigencia, 'Intervalo de vigência publicado pela fonte.');
    push('unidadeGestora', record.unidadeGestora, 'Unidade gestora publicada no registro.');
    push('razaoSocial', record.razaoSocial, 'Razão social do contratado publicada no registro.');
    push('cpfCnpj', record.cnpj ?? record.cpfCnpj, 'CPF/CNPJ do contratado publicado no registro.');
    push('numeroProcesso', record.numeroProcesso, 'Número do processo publicado no registro.');
    push('situacao', record.situacao, 'Situação do contrato publicada pela fonte.');
  } else if (type === DOCUMENT_TYPE.ADDITIVE) {
    push('numeroTermoAditivo', record.numeroTermoAditivo, 'Número do termo aditivo publicado no dataset TermoAditivo.');
    push('anoTermoAditivo', record.anoTermoAditivo, 'Ano do termo aditivo publicado pela fonte.');
    push('numeroContrato', record.numeroContrato, 'Contrato ao qual o termo se refere, publicado no registro.');
    push('objetoAditivo', record.objetoAditivo, 'Objeto do termo publicado pela fonte.');
    // Preservada com o "?" que a fonte grava no lugar dos acentos.
    push('justificativaTermoAditivo', record.justificativa ?? record.justificativaTermoAditivo,
      'Justificativa publicada pelo órgão, preservada como a fonte a gravou.');
    push('valorTermoAditivo', record.value ?? record.valorTermoAditivo,
      'Valor do termo publicado pela fonte, com o sinal original.');
    push('vigencia', record.vigencia, 'Vigência do termo publicada pela fonte.');
    push('situacao', record.situacao, 'Situação do termo publicada pela fonte.');
  } else if (type === DOCUMENT_TYPE.TENDER) {
    push('codigoPL', record.codigoPL, 'Código do processo licitatório no LICON.');
    push('modalidade', record.modalidade, 'Modalidade da licitação publicada pela fonte.');
    push('objeto', record.objeto, 'Objeto da licitação publicado pela fonte.');
    push('situacao', record.situacao, 'Situação da licitação publicada pela fonte.');
    push('numeroProcesso', record.numeroProcesso, 'Número do processo licitatório publicado pela fonte.');
    push('valorAdjudicadoLicitante', record.valorAdjudicadoLicitante,
      'Valor adjudicado ao licitante publicado pela fonte.');
  } else if (type === DOCUMENT_TYPE.PROCESS || type === DOCUMENT_TYPE.DECISION) {
    push('processNumber', record.processNumber, 'Número do processo publicado pelo TCE-PE.');
    push('modality', record.modality, 'Modalidade do processo publicada pela fonte.');
    push('organization', record.organization, 'Unidade jurisdicionada publicada pela fonte.');
    push('outcome', record.outcome, 'Resultado do processo publicado pela fonte.');
    push('decisionNumber', record.decisionNumber, 'Número do acórdão ou parecer publicado pela fonte.');
  }
  return facts;
}

/**
 * Resolve a data do documento a partir do que a fonte publica.
 *
 * As naturezas de data permanecem distintas: publicação, assinatura, vigência e
 * coleta são coisas diferentes, e o TCE-PE não publica data de assinatura de
 * contrato nem de termo aditivo. Quando a data vem da vigência, a precisão é
 * APPROXIMATE e `dateSource` diz de onde ela veio.
 */
function resolveDocumentDate(record, type) {
  const candidates = [];

  if (type === DOCUMENT_TYPE.TENDER) {
    candidates.push({
      value: record.dataPublicacaoHomologacao, precision: DATE_PRECISION.EXACT,
      source: 'dataPublicacaoHomologacao',
      basis: 'Data de publicação da homologação publicada pelo TCE-PE.',
    });
  }
  if (type === DOCUMENT_TYPE.PROCESS || type === DOCUMENT_TYPE.DECISION) {
    candidates.push({
      value: record.judgmentDate, precision: DATE_PRECISION.EXACT,
      source: 'DataSessaoJulgamento', basis: 'Data da sessão de julgamento publicada pelo TCE-PE.',
    });
  }
  candidates.push({
    value: record.vigenciaInicial ?? record.vigenciaInicio, precision: DATE_PRECISION.APPROXIMATE,
    source: type === DOCUMENT_TYPE.ADDITIVE ? 'vigenciaInicio do termo aditivo' : 'vigenciaInicial do contrato',
    basis: 'Início de vigência publicado pelo TCE-PE. A fonte não publica a data de assinatura do documento.',
  });
  candidates.push({
    value: record.anoTermoAditivo ?? record.anoContrato ?? record.anoProcesso
      ?? (record.exercise ? String(record.exercise) : null),
    precision: DATE_PRECISION.YEAR_ONLY,
    source: 'ano publicado no registro', basis: 'Somente o ano do registro é conhecido.',
  });

  return resolveEventDate(candidates);
}

/**
 * Constrói o documento a partir de um registro já normalizado.
 *
 * @param {object} input
 * @param {string} input.type natureza documental.
 * @param {object} input.record registro normalizado da fonte.
 * @param {string|null} input.url URL oficial publicada, quando houver.
 * @param {object} input.links vínculos com contrato, aditivo, licitação, processo.
 * @param {object} [input.entity] entidade investigada.
 */
function buildDocument({ type, record, url, links = {}, entity = null, title = null }) {
  const officialUrl = text(url) || null;
  const temporal = resolveDocumentDate(record, type);

  return {
    documentId: stableId('document', type, officialUrl || record.id || JSON.stringify(links)),
    documentType: type,
    title: title || `${type} ${text(record.numeroTermoAditivo || record.numeroContrato || record.processNumber || '')}`.trim(),

    // Proveniência: de onde este documento veio.
    source: record.source ?? null,
    provider: record.provider ?? null,
    endpoint: record.endpoint ?? null,
    query: record.query ?? null,
    params: record.params ?? null,
    /** Estado da CONSULTA que trouxe o registro — vocabulário da Fase 2. */
    sourceStatus: record.sourceStatus ?? null,
    /** URL do registro na API, que não é o documento. */
    sourceUrl: record.sourceUrl ?? null,
    /** URL do documento em si, publicada pela fonte. */
    officialUrl,
    retrievedAt: record.retrievedAt ?? null,

    // Vínculos, cada um com a força declarada.
    relatedEntity: entity
      ? { entityId: entity.entityId ?? null, cnpj: entity.cnpj ?? null, razaoSocial: entity.razaoSocial ?? null }
      : null,
    relatedContract: links.contract ?? null,
    relatedAdditive: links.additive ?? null,
    relatedTender: links.tender ?? null,
    relatedProcess: links.process ?? null,
    linkConfidence: links.confidence ?? LINK_CONFIDENCE.UNKNOWN,
    linkBasis: links.basis ?? 'Vínculo não determinado a partir dos dados disponíveis.',

    // Datas, com precisão e origem preservadas.
    publicationDate: type === DOCUMENT_TYPE.TENDER ? (text(record.dataPublicacaoHomologacao) || null) : null,
    documentDate: temporal.eventDate,
    documentYear: temporal.eventYear,
    dateSource: temporal.dateSource,
    datePrecision: temporal.datePrecision,
    dateConfidence: temporal.dateConfidence,
    dateBasis: temporal.orderingBasis,

    // Conteúdo. Referenciado quando há URL e nada foi buscado; vazio quando a
    // fonte respondeu e não publicou documento algum.
    contentStatus: officialUrl ? DOCUMENT_STATUS.REFERENCED : DOCUMENT_STATUS.EMPTY,
    contentType: null,
    contentBytes: null,
    availabilityCheckedAt: null,
    availabilityEvidence: null,

    // Extração de dentro do documento. Nada foi lido ainda.
    extractionStatus: officialUrl ? EXTRACTION_STATUS.NOT_ATTEMPTED : EXTRACTION_STATUS.NOT_APPLICABLE,
    extractionNote: officialUrl
      ? 'O conteúdo do documento não foi obtido nesta execução.'
      : 'A fonte não publicou documento para este registro.',
    /** Fatos lidos DE DENTRO do documento. Vazio até que o conteúdo seja lido. */
    extractedFacts: [],
    /** Fatos publicados pela fonte no registro. Existem sem abrir o documento. */
    publishedMetadata: publishedMetadataFor(record, type),

    raw: record.raw ?? null,
  };
}

/**
 * Aplica o resultado da verificação de disponibilidade a um documento.
 *
 * Nunca converte indisponível em vazio: um documento que existe e não pôde ser
 * obtido é lacuna, e a URL permanece preservada para conferência manual.
 */
function applyAvailability(document, probe) {
  if (!probe) return document;

  if (probe.status === DOCUMENT_STATUS.AVAILABLE) {
    // Conteúdo obtido. Se for imagem digitalizada, a leitura exige OCR — que
    // não pertence a esta fase. O documento está disponível; nós é que ainda
    // não sabemos lê-lo, e a distinção precisa aparecer.
    const scanned = probe.textLayer === false;
    return {
      ...document,
      contentStatus: DOCUMENT_STATUS.AVAILABLE,
      contentType: probe.contentType ?? null,
      contentBytes: probe.bytes ?? null,
      availabilityCheckedAt: probe.checkedAt ?? null,
      availabilityEvidence: probe.evidence ?? null,
      extractionStatus: scanned ? EXTRACTION_STATUS.OCR_REQUIRED : EXTRACTION_STATUS.NOT_ATTEMPTED,
      extractionNote: scanned
        ? 'O documento é imagem digitalizada e não possui camada de texto. A leitura exigiria OCR, '
          + 'que não integra esta fase. O documento existe e está acessível pela URL oficial.'
        : 'O conteúdo está acessível. A leitura do texto não foi executada nesta fase.',
      extractedFacts: [],
    };
  }

  if (probe.status === DOCUMENT_STATUS.UNAVAILABLE || probe.status === DOCUMENT_STATUS.ERROR) {
    return {
      ...document,
      contentStatus: probe.status,
      availabilityCheckedAt: probe.checkedAt ?? null,
      availabilityEvidence: probe.evidence ?? null,
      extractionStatus: EXTRACTION_STATUS.NOT_ATTEMPTED,
      extractionNote: probe.status === DOCUMENT_STATUS.UNAVAILABLE
        ? 'A URL oficial foi publicada pela fonte, mas o conteúdo não pôde ser obtido nesta execução. '
          + 'Isso não significa que o documento não exista.'
        : `Erro técnico ao verificar o documento: ${probe.erro ?? 'causa não registrada'}.`,
      // Conteúdo indisponível nunca produz fato extraído.
      extractedFacts: [],
    };
  }

  return document;
}

/**
 * Chave de deduplicação. Prioriza identificador oficial; a URL do documento é
 * o identificador mais forte disponível, porque o LICON a compõe com órgão,
 * ano, número e um sufixo único.
 */
function documentDedupeKey(document) {
  if (document.officialUrl) return `URL:${document.officialUrl}`;
  const parts = [
    document.documentType,
    document.relatedContract?.codigoContrato ?? document.relatedContract?.numeroContrato ?? '',
    document.relatedAdditive?.numeroTermoAditivo ?? '',
    document.relatedAdditive?.anoTermoAditivo ?? '',
    document.relatedTender?.codigoPL ?? '',
    document.relatedProcess?.processNumber ?? '',
  ];
  return parts.some(Boolean) ? `ID:${parts.join('|')}` : null;
}

/**
 * Deduplica por identificador oficial.
 *
 * Sem identificador suficiente, os dois documentos são preservados e marcados
 * como possível duplicidade — apagar um deles em silêncio, por semelhança de
 * título, perderia um registro oficial sem que ninguém soubesse.
 */
function dedupeDocuments(documents) {
  const byKey = new Map();
  const semChave = [];

  for (const document of documents) {
    const key = documentDedupeKey(document);
    if (!key) {
      semChave.push({ ...document, dedupeKey: null, duplicatesMerged: 0 });
      continue;
    }
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...document, dedupeKey: key, duplicatesMerged: 0 });
      continue;
    }
    current.duplicatesMerged += 1;
  }

  // Títulos iguais sem identificador não são fundidos: viram duplicidade
  // possível, sinalizada para revisão humana.
  const porTitulo = new Map();
  for (const document of semChave) {
    const titulo = text(document.title).toUpperCase();
    porTitulo.set(titulo, [...(porTitulo.get(titulo) ?? []), document]);
  }
  for (const grupo of porTitulo.values()) {
    if (grupo.length > 1) {
      for (const document of grupo) {
        document.possibleDuplicate = true;
        document.possibleDuplicateNote = 'Há outro documento com o mesmo título e sem identificador '
          + 'oficial que permita distingui-los. Ambos foram preservados para conferência.';
      }
    }
  }

  return [...byKey.values(), ...semChave];
}

module.exports = {
  DOCUMENT_TYPE,
  DOCUMENT_STATUS,
  EXTRACTION_STATUS,
  LINK_CONFIDENCE,
  DATE_PRECISION,
  DATE_CONFIDENCE,
  buildDocument,
  applyAvailability,
  publishedMetadataFor,
  resolveDocumentDate,
  documentDedupeKey,
  dedupeDocuments,
  fact,
};
