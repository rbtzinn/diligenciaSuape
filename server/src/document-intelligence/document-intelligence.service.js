// ==========================================================
// DILIGÊNCIA 360 — Inteligência documental
// ==========================================================
// Cataloga os documentos que as fontes já publicaram, a partir do que as
// camadas TCE-PE e Contract Intelligence coletaram. Não consulta a rede para
// montar o catálogo; a verificação de disponibilidade é opcional e explícita.
//
// FRONTEIRA COM A CENTRAL DE EVIDÊNCIAS: são coisas diferentes e não se
// sobrepõem. A Central registra o que uma pessoa acrescenta e valida; esta
// camada cataloga o que a fonte oficial publicou. Nada aqui escreve lá.
//
// O QUE ESTA CAMADA NÃO FAZ: não lê o conteúdo de PDF, não infere o que o
// documento diz, não classifica risco e não converte ausência de leitura em
// ausência de documento. Um contrato cujo PDF ninguém abriu é um documento
// REFERENCIADO — não um documento inexistente, e não um documento analisado.
// ==========================================================

const { SOURCE_STATUS } = require('../domain/source-status');
const {
  DOCUMENT_TYPE,
  DOCUMENT_STATUS,
  EXTRACTION_STATUS,
  LINK_CONFIDENCE,
  buildDocument,
  applyAvailability,
  dedupeDocuments,
} = require('./document.model');
const { probeDocuments } = require('./document-availability');

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** Referência ao contrato, para o vínculo do documento. */
function contractRef(contract) {
  if (!contract) return null;
  return {
    contractId: contract.id ?? null,
    codigoContrato: contract.codigoContrato ?? null,
    numeroContrato: contract.numeroContrato ?? null,
    anoContrato: contract.anoContrato ?? null,
    unidadeGestora: contract.unidadeGestora ?? null,
  };
}

/**
 * Documentos de um perfil contratual: o instrumento e cada termo aditivo.
 *
 * O vínculo do contrato consigo mesmo é CONFIRMED por definição. O do termo
 * herda a confiança que a Contract Intelligence já apurou ao associá-lo — se lá
 * o vínculo era provável, aqui não vira confirmado.
 */
function documentsFromProfile(profile, entity) {
  const documents = [];
  const contract = profile.contrato;
  const reference = contractRef(contract);

  if (contract) {
    documents.push(buildDocument({
      type: DOCUMENT_TYPE.CONTRACT,
      record: contract,
      url: contract.linkArquivo,
      title: `Contrato ${contract.numeroContrato ?? 's/n'}/${contract.anoContrato ?? 's/a'}`,
      entity,
      links: {
        contract: reference,
        confidence: LINK_CONFIDENCE.CONFIRMED,
        basis: 'O documento é o instrumento publicado no próprio registro do contrato.',
      },
    }));
  }

  for (const additive of profile.aditivos ?? []) {
    const heranca = additive.associationConfidence === 'CONFIRMED'
      ? LINK_CONFIDENCE.CONFIRMED
      : additive.associationConfidence === 'PROBABLE'
        ? LINK_CONFIDENCE.PROBABLE
        : LINK_CONFIDENCE.UNKNOWN;

    documents.push(buildDocument({
      type: DOCUMENT_TYPE.ADDITIVE,
      record: additive,
      url: additive.linkArquivo,
      title: `${additive.numeroTermoAditivo ?? 's/n'}º termo aditivo ao contrato `
        + `${contract?.numeroContrato ?? 's/n'}/${contract?.anoContrato ?? 's/a'}`,
      entity,
      links: {
        contract: reference,
        additive: {
          numeroTermoAditivo: additive.numeroTermoAditivo ?? null,
          anoTermoAditivo: additive.anoTermoAditivo ?? null,
        },
        confidence: heranca,
        basis: additive.associationBasis
          ?? 'Vínculo herdado da associação apurada pela camada de inteligência contratual.',
      },
    }));
  }
  return documents;
}

/**
 * Documentos de licitação. O vínculo com o contrato é confirmado quando o
 * `codigoPL` coincide, e apenas contextual quando a licitação pertence à
 * entidade sem que nenhum contrato coletado a referencie.
 */
function documentsFromBids(bids, profiles, entity) {
  const byCodigoPL = new Map();
  for (const profile of profiles) {
    const codigo = text(profile.contrato?.codigoPL);
    if (codigo) byCodigoPL.set(codigo, profile.contrato);
  }

  return (bids ?? [])
    .filter((bid) => bid.relationshipType !== 'FALSE_POSITIVE')
    .map((bid) => {
      const contract = byCodigoPL.get(text(bid.codigoPL)) ?? null;
      return buildDocument({
        type: DOCUMENT_TYPE.TENDER,
        record: bid,
        url: bid.linkArquivo,
        title: `Licitação ${bid.modalidade ?? ''} ${bid.numeroProcesso ?? ''}`.replace(/\s+/g, ' ').trim(),
        entity,
        links: {
          contract: contractRef(contract),
          tender: { codigoPL: bid.codigoPL ?? null, numeroProcesso: bid.numeroProcesso ?? null },
          confidence: contract ? LINK_CONFIDENCE.CONFIRMED : LINK_CONFIDENCE.CONTEXTUAL,
          basis: contract
            ? `O código do processo licitatório coincide com o do contrato (${bid.codigoPL}).`
            : 'A licitação está vinculada à entidade, mas nenhum contrato coletado a referencia. '
              + 'O documento é preservado com vínculo contextual.',
        },
      });
    });
}

/**
 * Documentos de processos de controle externo: os autos e a decisão.
 *
 * Falso positivo não entra — não é processo da empresa. O vínculo é com a
 * entidade, nunca com um contrato: o TCE-PE não publica essa ligação.
 */
function documentsFromProcesses(processes, entity) {
  const documents = [];
  for (const process of processes ?? []) {
    if (process.relationshipType === 'FALSE_POSITIVE' || process.relevantToEntity === false) continue;

    const links = {
      process: {
        processNumber: process.processNumber ?? null,
        exercise: process.exercise ?? null,
        relationshipType: process.relationshipType ?? null,
      },
      confidence: process.relationshipType === 'CONTRACTOR' || process.relationshipType === 'PARTY'
        ? LINK_CONFIDENCE.PROBABLE
        : LINK_CONFIDENCE.CONTEXTUAL,
      basis: 'O vínculo é com a entidade. O TCE-PE não publica ligação entre processo e contrato específico.',
    };

    if (process.processUrl) {
      documents.push(buildDocument({
        type: DOCUMENT_TYPE.PROCESS,
        record: process,
        url: process.processUrl,
        title: `Processo ${process.processNumber ?? 's/n'}`,
        entity,
        links,
      }));
    }
    if (process.decisionUrl) {
      documents.push(buildDocument({
        type: DOCUMENT_TYPE.DECISION,
        record: process,
        url: process.decisionUrl,
        title: `Decisão do processo ${process.processNumber ?? 's/n'}`
          + (process.decisionNumber ? ` — ${process.decisionNumber}` : ''),
        entity,
        links,
      }));
    }
  }
  return documents;
}

/**
 * Estado documental de uma fonte cuja consulta não trouxe documento.
 *
 * Aqui mora a distinção que o dossiê inteiro depende: a fonte respondeu e não
 * publicou documento (EMPTY) é conclusão; a fonte não respondeu (UNAVAILABLE) é
 * lacuna. As duas produzem a mesma lista vazia na tela.
 */
function absenceFor(sourceStatus) {
  if (sourceStatus === SOURCE_STATUS.UNAVAILABLE || sourceStatus === SOURCE_STATUS.ERROR) {
    return {
      documentStatus: DOCUMENT_STATUS.UNAVAILABLE,
      nota: 'A fonte não pôde ser consultada nesta execução. A ausência de documentos na tela não '
        + 'significa que não existam documentos publicados.',
    };
  }
  if (sourceStatus === SOURCE_STATUS.EMPTY) {
    return {
      documentStatus: DOCUMENT_STATUS.EMPTY,
      nota: 'A fonte respondeu e não publicou documento para os registros consultados.',
    };
  }
  if (sourceStatus === SOURCE_STATUS.PARTIAL) {
    return {
      documentStatus: DOCUMENT_STATUS.REFERENCED,
      nota: 'A consulta foi concluída apenas em parte. Podem existir documentos não catalogados.',
    };
  }
  if (sourceStatus === SOURCE_STATUS.NOT_APPLICABLE) {
    return { documentStatus: DOCUMENT_STATUS.EMPTY, nota: 'A fonte não se aplica a esta entidade.' };
  }
  return { documentStatus: DOCUMENT_STATUS.EMPTY, nota: null };
}

const ContractIntelligenceDocumentSources = Object.freeze({
  CONTRACT: 'tce-pe-contratos',
  ADDITIVE: 'tce-pe-aditivos',
  TENDER: 'tce-pe-licitacoes',
});

const DocumentIntelligenceService = {
  /**
   * Cataloga os documentos da entidade.
   *
   * @param {object} input
   * @param {object} input.tceResult retorno de `TcePeIntelligenceService.collect`.
   * @param {object} input.contractIntelligence retorno de `ContractIntelligenceService.analyze`.
   * @param {Array} [input.processes] processos do TCE-PE já resolvidos.
   * @param {object} [options]
   * @param {boolean} [options.checkAvailability=false] verifica se cada URL
   *   responde. Desligado por padrão: catalogar não é baixar.
   */
  async collect(input = {}, options = {}) {
    const generatedAt = new Date().toISOString();
    const { tceResult = {}, contractIntelligence = {}, processes = [] } = input;
    const entity = tceResult.entity ?? contractIntelligence.entity ?? null;
    const profiles = Array.isArray(contractIntelligence.contratos) ? contractIntelligence.contratos : [];
    const coverage = contractIntelligence.cobertura ?? {};

    const documents = dedupeDocuments([
      ...profiles.flatMap((profile) => documentsFromProfile(profile, entity)),
      ...documentsFromBids(tceResult.licitacoes, profiles, entity),
      ...documentsFromProcesses(processes, entity),
    ]);

    // Verificação opcional. Sem ela, todo documento com URL permanece
    // REFERENCED — que é a verdade: existe endereço, ninguém o abriu.
    let probeReport = { verificados: 0, naoVerificados: documents.length, truncado: false };
    let catalogo = documents;
    if (options.checkAvailability) {
      const { results, ...report } = await probeDocuments(
        documents.map((document) => document.officialUrl).filter(Boolean),
        options,
      );
      probeReport = report;
      catalogo = documents.map((document) => (
        document.officialUrl && results.has(document.officialUrl)
          ? applyAvailability(document, results.get(document.officialUrl))
          : document
      ));
    }

    const porStatus = (status) => catalogo.filter((document) => document.contentStatus === status).length;
    const porTipo = {};
    for (const document of catalogo) {
      porTipo[document.documentType] = (porTipo[document.documentType] ?? 0) + 1;
    }

    // Ausência por fonte, com a formulação que o estado da consulta exige.
    const ausencias = Object.entries(ContractIntelligenceDocumentSources)
      .map(([tipo, provider]) => {
        const status = coverage[provider]?.status ?? null;
        const temDocumento = catalogo.some((document) => document.documentType === tipo && document.officialUrl);
        if (temDocumento || !status) return null;
        const { documentStatus, nota } = absenceFor(status);
        return nota ? { documentType: tipo, provider, sourceStatus: status, documentStatus, nota } : null;
      })
      .filter(Boolean);

    return {
      generatedAt,
      entity,
      documentos: catalogo,
      ausencias,
      resumo: {
        total: catalogo.length,
        porTipo,
        // Referenciado, disponível e indisponível são três estados distintos e
        // permanecem separados: colapsá-los apagaria a diferença entre "não
        // olhamos" e "não conseguimos".
        referenciados: porStatus(DOCUMENT_STATUS.REFERENCED),
        disponiveis: porStatus(DOCUMENT_STATUS.AVAILABLE),
        indisponiveis: porStatus(DOCUMENT_STATUS.UNAVAILABLE),
        vazios: porStatus(DOCUMENT_STATUS.EMPTY),
        comErro: porStatus(DOCUMENT_STATUS.ERROR),
        comUrlOficial: catalogo.filter((document) => document.officialUrl).length,
        exigemOcr: catalogo.filter((document) => document.extractionStatus === EXTRACTION_STATUS.OCR_REQUIRED).length,
        // Nenhum fato foi lido de dentro de documento nesta fase.
        comFatosExtraidos: catalogo.filter((document) => document.extractedFacts.length > 0).length,
        vinculoConfirmado: catalogo.filter((document) => document.linkConfidence === LINK_CONFIDENCE.CONFIRMED).length,
        vinculoProvavel: catalogo.filter((document) => document.linkConfidence === LINK_CONFIDENCE.PROBABLE).length,
        vinculoContextual: catalogo.filter((document) => document.linkConfidence === LINK_CONFIDENCE.CONTEXTUAL).length,
        possiveisDuplicatas: catalogo.filter((document) => document.possibleDuplicate).length,
        disponibilidadeVerificada: probeReport.verificados,
        disponibilidadeNaoVerificada: probeReport.naoVerificados,
        verificacaoTruncada: Boolean(probeReport.truncado),
      },
      limitacao: 'Catálogo dos documentos que as fontes publicaram, com origem, vínculo e disponibilidade '
        + 'declarados. O conteúdo dos documentos não é lido nesta fase: os contratos e termos aditivos do '
        + 'TCE-PE são PDFs digitalizados, sem camada de texto, e a leitura exigiria OCR. Os fatos exibidos '
        + 'vêm dos metadados que a própria fonte publica no registro, e não do interior do documento. '
        + 'Documento sem conteúdo obtido é documento referenciado, não documento inexistente.',
    };
  },
};

module.exports = {
  DocumentIntelligenceService,
  documentsFromProfile,
  documentsFromBids,
  documentsFromProcesses,
  absenceFor,
};
