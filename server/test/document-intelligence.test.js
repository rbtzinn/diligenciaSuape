const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DocumentIntelligenceService,
  documentsFromProfile,
  absenceFor,
} = require('../src/document-intelligence/document-intelligence.service');
const {
  DOCUMENT_TYPE,
  DOCUMENT_STATUS,
  EXTRACTION_STATUS,
  LINK_CONFIDENCE,
  DATE_PRECISION,
  buildDocument,
  applyAvailability,
  dedupeDocuments,
  documentDedupeKey,
} = require('../src/document-intelligence/document.model');
const { detectTextLayer } = require('../src/document-intelligence/document-availability');
const { ContractIntelligenceService } = require('../src/contract-intelligence/contract-intelligence.service');
const {
  normalizeContract,
  normalizeAdditive,
  normalizeBid,
} = require('../src/services/tce-pe/tce-pe.adapters');
const { buildEntityProfile } = require('../src/entity-resolution/entity-resolution');
const { SOURCE_STATUS } = require('../src/domain/source-status');

// ==========================================================
// Fixture GUERRA CONSTRUCOES LTDA / 10.811.370/0001-62
// ==========================================================

const GUERRA = { cnpj: '10.811.370/0001-62', razaoSocial: 'GUERRA CONSTRUCOES LTDA', municipio: 'Recife', uf: 'PE' };
const profile = buildEntityProfile(GUERRA);

const contrato = (overrides = {}) => normalizeContract({
  CodigoContrato: '437869',
  NumeroContrato: '073',
  AnoContrato: '2024',
  CodigoPL: '203515',
  NumeroProcesso: '54',
  UnidadeGestora: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
  CodigoUG: '782',
  Esfera: 'E ',
  Municipio: 'Recife',
  NumeroDocumentoAjustado: '10811370000162',
  RazaoSocial: 'Guerra Construções Ltda',
  Objeto: 'Obra de urbanização',
  Vigencia: '19/03/2024 a 19/12/2024',
  Valor: '798881.01',
  Situacao: 'Regular',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/licon/contrato/782/LICON_Contrato_073.pdf',
  ...overrides,
}, profile, { params: {} });

const aditivo = (overrides = {}) => normalizeAdditive({
  CodigoContrato: '437869',
  NumeroContrato: '073',
  AnoContrato: '2024',
  NumeroTermoAditivo: '001',
  AnoTermoAditivo: '2024',
  ValorTermoAditivo: '301312.26',
  Vigencia: '10/06/2024 a 10/09/2024',
  ObjetoAditivo: 'Obra de urbanização',
  JustificativaTermoAditivo: 'acr?scimo de valor quantitativo',
  NumeroDocumentoAjustado: '10811370000162',
  UnidadeGestora: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
  CodigoUG: '782',
  Esfera: 'E ',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/licon/aditivo/782/LICON_TA_001.pdf',
  ...overrides,
}, profile, { params: {} });

const licitacao = (overrides = {}) => normalizeBid({
  NUMERODOCUMENTOAJUSTADO: '10811370000162',
  CODIGOPL: '203515',
  NUMEROPROCESSO: '54',
  NOMEMODALIDADE: 'Concorrência',
  ADJUDICADA: 'Sim',
  DATAPUBLICACAOHOMOLOGACAO: '2024-03-01 00:00:00.0',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/licon/licitacao/782/LICON_PL_203515.pdf',
  ...overrides,
}, profile, { params: {} });

const providers = (overrides = {}) => Object.entries({
  'tce-pe-contratos': 'SUCCESS',
  'tce-pe-aditivos': 'SUCCESS',
  'tce-pe-licitacoes': 'SUCCESS',
  ...overrides,
}).map(([provider, status]) => ({ provider, status, quantidade: status === 'SUCCESS' ? 1 : 0, erros: [], warnings: [] }));

function tceResult(overrides = {}) {
  return {
    entity: { uf: 'PE', entityId: profile.entityId, cnpj: profile.cnpj, razaoSocial: profile.razaoSocial },
    contratos: [contrato()],
    aditivos: [],
    licitacoes: [],
    despesas: [],
    obras: [],
    providers: providers(),
    ...overrides,
  };
}

async function catalogar(overrides = {}, processes = [], options = {}) {
  const tce = tceResult(overrides);
  const ci = ContractIntelligenceService.analyze(tce, { processes });
  return DocumentIntelligenceService.collect(
    { tceResult: tce, contractIntelligence: ci, processes },
    options,
  );
}

const porTipo = (resultado, tipo) => resultado.documentos.filter((d) => d.documentType === tipo);

// ==========================================================
// URL, disponibilidade e estados
// ==========================================================

test('1 — documento com URL oficial é catalogado como REFERENCIADO', async () => {
  const resultado = await catalogar();
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.CONTRACT);

  assert.ok(documento.officialUrl, 'a URL publicada precisa ser preservada');
  assert.match(documento.officialUrl, /^https:\/\//, 'a URL é normalizada para HTTPS pela camada TCE-PE');
  // Ter o endereço não é ter o conteúdo.
  assert.equal(documento.contentStatus, DOCUMENT_STATUS.REFERENCED);
  assert.equal(documento.extractionStatus, EXTRACTION_STATUS.NOT_ATTEMPTED);
});

test('2 — conteúdo obtido marca o documento como DISPONÍVEL', async () => {
  const resultado = await catalogar();
  const documento = applyAvailability(porTipo(resultado, DOCUMENT_TYPE.CONTRACT)[0], {
    status: DOCUMENT_STATUS.AVAILABLE,
    contentType: 'application/pdf',
    bytes: 2348848,
    textLayer: true,
    checkedAt: '2026-09-04T12:00:00.000Z',
    evidence: 'HTTP 200, application/pdf, 2348848 bytes',
  });

  assert.equal(documento.contentStatus, DOCUMENT_STATUS.AVAILABLE);
  assert.equal(documento.contentType, 'application/pdf');
  assert.equal(documento.contentBytes, 2348848);
  assert.ok(documento.availabilityEvidence, 'a verificação precisa deixar evidência');
});

test('3 — referenciado mas inacessível vira INDISPONÍVEL, preservando a URL', async () => {
  const resultado = await catalogar();
  const original = porTipo(resultado, DOCUMENT_TYPE.CONTRACT)[0];
  const documento = applyAvailability(original, {
    status: DOCUMENT_STATUS.UNAVAILABLE,
    checkedAt: '2026-09-04T12:00:00.000Z',
    erro: 'HTTP 404',
    evidence: 'A URL publicada pela fonte responde HTTP 404.',
  });

  assert.equal(documento.contentStatus, DOCUMENT_STATUS.UNAVAILABLE);
  assert.equal(documento.officialUrl, original.officialUrl, 'a URL nunca é apagada');
  assert.match(documento.extractionNote, /não significa que o documento não exista/i);
  // Indisponível jamais vira vazio.
  assert.notEqual(documento.contentStatus, DOCUMENT_STATUS.EMPTY);
});

test('4 — registro sem URL publicada é VAZIO, e não indisponível', async () => {
  const resultado = await catalogar({ contratos: [contrato({ LinkArquivo: '' })] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.CONTRACT);

  assert.equal(documento.officialUrl, null);
  assert.equal(documento.contentStatus, DOCUMENT_STATUS.EMPTY);
  assert.equal(documento.extractionStatus, EXTRACTION_STATUS.NOT_APPLICABLE);
  assert.match(documento.extractionNote, /não publicou documento/i);
});

test('5 — erro de obtenção fica registrado como ERRO', async () => {
  const resultado = await catalogar();
  const documento = applyAvailability(porTipo(resultado, DOCUMENT_TYPE.CONTRACT)[0], {
    status: DOCUMENT_STATUS.ERROR,
    checkedAt: '2026-09-04T12:00:00.000Z',
    erro: 'HTTP 500',
    evidence: 'A verificação respondeu HTTP 500.',
  });

  assert.equal(documento.contentStatus, DOCUMENT_STATUS.ERROR);
  assert.match(documento.extractionNote, /Erro técnico/i);
  assert.deepEqual(documento.extractedFacts, []);
});

test('6 — conteúdo obtido sem camada de texto exige OCR, e isso não é ausência', async () => {
  const resultado = await catalogar();
  const documento = applyAvailability(porTipo(resultado, DOCUMENT_TYPE.CONTRACT)[0], {
    status: DOCUMENT_STATUS.AVAILABLE,
    contentType: 'application/pdf',
    bytes: 2348848,
    textLayer: false,
    checkedAt: '2026-09-04T12:00:00.000Z',
    evidence: 'PDF sem fontes no cabeçalho.',
  });

  // O documento EXISTE e está acessível; nós é que não sabemos lê-lo.
  assert.equal(documento.contentStatus, DOCUMENT_STATUS.AVAILABLE);
  assert.equal(documento.extractionStatus, EXTRACTION_STATUS.OCR_REQUIRED);
  assert.match(documento.extractionNote, /imagem digitalizada/i);
  assert.deepEqual(documento.extractedFacts, [], 'OCR não executado não produz fato');
});

// ==========================================================
// Datas
// ==========================================================

test('7 — documento sem data não recebe data inventada', async () => {
  const resultado = await catalogar({ contratos: [contrato({ Vigencia: '', AnoContrato: '' })] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.CONTRACT);

  assert.equal(documento.documentDate, null);
  assert.equal(documento.datePrecision, DATE_PRECISION.UNKNOWN);
  assert.equal(documento.dateSource, null);
});

test('8 — data publicada pela fonte é EXATA', async () => {
  const resultado = await catalogar({ licitacoes: [licitacao()] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.TENDER);

  assert.equal(documento.datePrecision, DATE_PRECISION.EXACT);
  assert.equal(documento.dateSource, 'dataPublicacaoHomologacao');
  assert.ok(documento.publicationDate, 'a data de publicação é campo próprio');
});

test('9 — só o ano conhecido produz YEAR_ONLY, sem data', async () => {
  const resultado = await catalogar({ contratos: [contrato({ Vigencia: '', AnoContrato: '2024' })] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.CONTRACT);

  assert.equal(documento.datePrecision, DATE_PRECISION.YEAR_ONLY);
  assert.equal(documento.documentDate, null, 'ano conhecido não vira data');
  assert.equal(documento.documentYear, '2024');
});

test('10 — data derivada da vigência é APROXIMADA, nunca exata', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.ADDITIVE);

  assert.equal(documento.datePrecision, DATE_PRECISION.APPROXIMATE);
  assert.match(documento.dateSource, /vigencia/i);
  assert.match(documento.dateBasis, /não publica a data de assinatura/i);
  // Publicação, assinatura e vigência permanecem semanticamente distintas.
  assert.equal(documento.publicationDate, null, 'aditivo não tem data de publicação própria');
});

// ==========================================================
// Vínculos
// ==========================================================

test('11 e 12 — contrato com vários documentos e vários aditivos', async () => {
  const resultado = await catalogar({
    aditivos: ['001', '002', '003'].map((numero) => aditivo({
      NumeroTermoAditivo: numero,
      LinkArquivo: `http://sistemas.tcepe.tc.br/licon/aditivo/782/TA_${numero}.pdf`,
    })),
    licitacoes: [licitacao()],
  });

  assert.equal(porTipo(resultado, DOCUMENT_TYPE.CONTRACT).length, 1);
  assert.equal(porTipo(resultado, DOCUMENT_TYPE.ADDITIVE).length, 3, 'cada termo tem documento próprio');
  assert.equal(porTipo(resultado, DOCUMENT_TYPE.TENDER).length, 1);
  assert.equal(resultado.resumo.total, 5);
});

test('13 — vínculo por identificador oficial é CONFIRMED', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()], licitacoes: [licitacao()] });

  const contratoDoc = porTipo(resultado, DOCUMENT_TYPE.CONTRACT)[0];
  assert.equal(contratoDoc.linkConfidence, LINK_CONFIDENCE.CONFIRMED);

  const aditivoDoc = porTipo(resultado, DOCUMENT_TYPE.ADDITIVE)[0];
  assert.equal(aditivoDoc.linkConfidence, LINK_CONFIDENCE.CONFIRMED);
  assert.equal(aditivoDoc.relatedContract.codigoContrato, '437869');

  // codigoPL coincidente liga licitação e contrato.
  const licitacaoDoc = porTipo(resultado, DOCUMENT_TYPE.TENDER)[0];
  assert.equal(licitacaoDoc.linkConfidence, LINK_CONFIDENCE.CONFIRMED);
  assert.match(licitacaoDoc.linkBasis, /código do processo licitatório coincide/i);
});

test('14 — vínculo apenas provável é preservado como provável', async () => {
  // Termo sem código do contrato: a associação cai para chave composta.
  const resultado = await catalogar({ aditivos: [aditivo({ CodigoContrato: '' })] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.ADDITIVE);

  assert.equal(documento.linkConfidence, LINK_CONFIDENCE.PROBABLE);
  assert.notEqual(documento.linkConfidence, LINK_CONFIDENCE.CONFIRMED);
  assert.match(documento.linkBasis, /Número, ano e unidade gestora/i);
});

test('15 — documento sem associação confirmada não é descartado', async () => {
  // Licitação da entidade que nenhum contrato coletado referencia.
  const resultado = await catalogar({ licitacoes: [licitacao({ CODIGOPL: '999999' })] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.TENDER);

  assert.ok(documento, 'o documento existe mesmo sem vínculo confirmado');
  assert.equal(documento.linkConfidence, LINK_CONFIDENCE.CONTEXTUAL);
  assert.equal(documento.relatedContract, null);
  assert.match(documento.linkBasis, /nenhum contrato coletado a referencia/i);
});

// ==========================================================
// Proveniência
// ==========================================================

test('16 e 17 — o raw e a URL original são preservados', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()] });

  for (const documento of resultado.documentos) {
    assert.ok(documento.source, `documento sem fonte: ${documento.title}`);
    assert.ok(documento.endpoint, 'o endpoint que originou o registro precisa constar');
    assert.ok(documento.retrievedAt);
    assert.ok(documento.raw, 'o registro bruto acompanha o documento');
    assert.ok(documento.sourceUrl, 'a URL do registro na API é distinta da URL do documento');
  }
  const [contratoDoc] = porTipo(resultado, DOCUMENT_TYPE.CONTRACT);
  assert.notEqual(contratoDoc.sourceUrl, contratoDoc.officialUrl, 'registro e documento têm URLs distintas');
});

test('cada metadado publicado declara o campo de origem e a regra', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.ADDITIVE);

  assert.ok(documento.publishedMetadata.length > 0);
  for (const item of documento.publishedMetadata) {
    assert.ok(item.field, 'o campo original precisa ser nomeado');
    assert.ok(item.rule, 'a regra de extração precisa ser declarada');
    assert.equal(item.origin, 'PUBLISHED_METADATA');
  }
  // A justificativa é preservada como a fonte a gravou, com o "?" corrompido.
  const justificativa = documento.publishedMetadata.find((item) => item.field === 'justificativaTermoAditivo');
  assert.match(justificativa.value, /acr\?scimo/);
});

// ==========================================================
// Ausência × indisponibilidade
// ==========================================================

test('18 e 19 — ausência de documento e indisponibilidade da fonte são distintas', () => {
  const vazio = absenceFor(SOURCE_STATUS.EMPTY);
  const indisponivel = absenceFor(SOURCE_STATUS.UNAVAILABLE);

  assert.equal(vazio.documentStatus, DOCUMENT_STATUS.EMPTY);
  assert.match(vazio.nota, /respondeu e não publicou/i);

  assert.equal(indisponivel.documentStatus, DOCUMENT_STATUS.UNAVAILABLE);
  assert.match(indisponivel.nota, /não significa que não existam/i);
  assert.notEqual(vazio.documentStatus, indisponivel.documentStatus);
});

test('fonte UNAVAILABLE não vira "sem documentos" no catálogo', async () => {
  const resultado = await catalogar({ providers: providers({ 'tce-pe-licitacoes': 'UNAVAILABLE' }) });
  const ausencia = resultado.ausencias.find((item) => item.documentType === 'TENDER');

  assert.ok(ausencia, 'a fonte indisponível precisa ser declarada');
  assert.equal(ausencia.documentStatus, DOCUMENT_STATUS.UNAVAILABLE);
  assert.match(ausencia.nota, /não significa que não existam documentos publicados/i);
  assert.equal(/não publicou documento/i.test(ausencia.nota), false);
});

test('fonte EMPTY é declarada como consulta concluída sem documento', async () => {
  const resultado = await catalogar({ providers: providers({ 'tce-pe-licitacoes': 'EMPTY' }) });
  const ausencia = resultado.ausencias.find((item) => item.documentType === 'TENDER');

  assert.equal(ausencia.documentStatus, DOCUMENT_STATUS.EMPTY);
  assert.match(ausencia.nota, /respondeu e não publicou/i);
});

// ==========================================================
// Extração
// ==========================================================

test('20 — a extração não cria fatos nesta fase', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()], licitacoes: [licitacao()] });

  assert.equal(resultado.resumo.comFatosExtraidos, 0);
  for (const documento of resultado.documentos) {
    assert.deepEqual(documento.extractedFacts, [], `${documento.title} não pode ter fato extraído`);
  }
});

test('21 — conteúdo indisponível nunca gera extractedFacts', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()] });
  for (const original of resultado.documentos) {
    for (const status of [DOCUMENT_STATUS.UNAVAILABLE, DOCUMENT_STATUS.ERROR]) {
      const documento = applyAvailability(original, { status, checkedAt: 'x', erro: 'falha' });
      assert.deepEqual(documento.extractedFacts, []);
    }
  }
});

test('metadado publicado não se confunde com fato extraído do documento', async () => {
  const resultado = await catalogar();
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.CONTRACT);

  // Os metadados existem sem que ninguém tenha aberto o PDF.
  assert.ok(documento.publishedMetadata.length > 0);
  assert.deepEqual(documento.extractedFacts, []);
  assert.equal(
    documento.publishedMetadata.every((item) => item.origin === 'PUBLISHED_METADATA'),
    true,
    'a origem precisa dizer que o fato veio do registro, não do documento',
  );
});

test('nenhuma classificação de risco é produzida', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()], licitacoes: [licitacao()] });
  const serializado = JSON.stringify(
    JSON.parse(JSON.stringify(resultado), (key, value) => (key === 'raw' || key === 'entityMatch' ? undefined : value)),
  ).toLowerCase();

  for (const proibido of ['risco', 'score', 'fraude', 'irregular', 'suspeit', 'corrup', 'severidade']) {
    assert.equal(serializado.includes(proibido), false, `a camada não pode produzir "${proibido}"`);
  }
});

// ==========================================================
// Deduplicação
// ==========================================================

test('22 — o mesmo documento não é catalogado duas vezes', async () => {
  const resultado = await catalogar({ aditivos: [aditivo(), aditivo()] });
  const aditivos = porTipo(resultado, DOCUMENT_TYPE.ADDITIVE);

  assert.equal(aditivos.length, 1);
  assert.equal(resultado.resumo.total, 2, 'contrato + um aditivo');
});

test('23 — documentos distintos com o mesmo título não são deduplicados', () => {
  const base = {
    type: DOCUMENT_TYPE.OTHER,
    record: { source: 'TCE-PE', endpoint: 'X', retrievedAt: 'agora' },
    url: null,
    links: {},
  };
  const documentos = dedupeDocuments([
    buildDocument({ ...base, title: 'Termo aditivo' }),
    buildDocument({ ...base, title: 'Termo aditivo' }),
  ]);

  // Sem identificador, os dois são preservados e sinalizados.
  assert.equal(documentos.length, 2, 'título igual não é prova de duplicidade');
  assert.equal(documentos.every((item) => item.possibleDuplicate), true);
  assert.match(documentos[0].possibleDuplicateNote, /Ambos foram preservados/i);
});

test('a chave de deduplicação prioriza o identificador oficial', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()] });
  const [documento] = porTipo(resultado, DOCUMENT_TYPE.ADDITIVE);

  assert.match(documentDedupeKey(documento), /^URL:https:\/\//);
});

// ==========================================================
// Regressão das fases anteriores
// ==========================================================

test('24 a 29 — as fases anteriores permanecem intactas', async () => {
  const { resolveEntityMatch, MATCH_LEVEL } = require('../src/entity-resolution/entity-resolution');
  const { resolveSourceStatus } = require('../src/domain/source-status');
  const { generateSearchMatrix } = require('../src/search-matrix/search-query-generator');
  const { TcePeIntelligenceService } = require('../src/services/tce-pe/tce-pe.intelligence');

  // 24 — Entity Resolution: o falso positivo da Síria continua descartado.
  assert.equal(
    resolveEntityMatch(profile, { text: 'A guerra na Síria destruiu patrimônios.' }).level,
    MATCH_LEVEL.FALSE_POSITIVE,
  );
  // 25 — Source Status: EMPTY e UNAVAILABLE continuam distintos.
  assert.equal(resolveSourceStatus({ attempted: 1, succeeded: 1, resultCount: 0 }), SOURCE_STATUS.EMPTY);
  assert.equal(resolveSourceStatus({ attempted: 1, succeeded: 0, resultCount: 0 }), SOURCE_STATUS.UNAVAILABLE);
  // 26 — Search Matrix: consultas nascem planejadas.
  assert.equal(generateSearchMatrix(profile).queries.every((query) => query.status === 'PLANNED'), true);
  // 27 — TCE-PE Intelligence: os providers continuam declarados.
  assert.ok(Object.keys(TcePeIntelligenceService.TCE_PROVIDERS).length >= 7);

  const tce = tceResult({ aditivos: [aditivo()] });
  const ci = ContractIntelligenceService.analyze(tce);
  // 28 — Contract Intelligence: valorAtualizado continua não sendo inventado.
  assert.equal(ci.contratos[0].contrato.valorAtualizado, null);
  assert.equal(ci.contratos[0].aditivos.length, 1);
  // 29 — Contract Timeline: continua funcionando e declarando a aproximação.
  const timeline = ci.contratos[0].timelineDetalhada;
  assert.ok(timeline.entries.length >= 2);
  assert.match(timeline.limitacao, /não publica data de assinatura/i);
});

test('a Timeline continua funcionando quando não há conteúdo documental', async () => {
  const tce = tceResult({ contratos: [contrato({ LinkArquivo: '' })], aditivos: [aditivo({ LinkArquivo: '' })] });
  const ci = ContractIntelligenceService.analyze(tce);
  const resultado = await DocumentIntelligenceService.collect({ tceResult: tce, contractIntelligence: ci });

  assert.equal(ci.contratos[0].timelineDetalhada.entries.length >= 2, true);
  assert.equal(resultado.resumo.comUrlOficial, 0);
  assert.equal(resultado.resumo.vazios, 2);
});

// ==========================================================
// Rede
// ==========================================================

test('30 — o catálogo não faz chamada de rede', async () => {
  const originalFetch = global.fetch;
  let chamadas = 0;
  global.fetch = async () => { chamadas += 1; throw new Error('rede não permitida'); };
  try {
    await catalogar({ aditivos: [aditivo()], licitacoes: [licitacao()] });
    assert.equal(chamadas, 0, 'catalogar não é baixar');
  } finally {
    global.fetch = originalFetch;
  }
});

test('a verificação de disponibilidade é opcional e desligada por padrão', async () => {
  const resultado = await catalogar({ aditivos: [aditivo()] });

  assert.equal(resultado.resumo.disponibilidadeVerificada, 0);
  assert.equal(resultado.resumo.disponibilidadeNaoVerificada, resultado.documentos.length);
  assert.equal(resultado.resumo.referenciados, resultado.documentos.length);
});

// ==========================================================
// Unidades
// ==========================================================

test('a detecção de camada de texto não conclui além do que a amostra permite', () => {
  assert.equal(detectTextLayer(Buffer.from('%PDF-1.4 /Font /Type1'), 'application/pdf'), true);
  // Ausência de /Font em 512 bytes não prova que o PDF é digitalizado.
  assert.equal(detectTextLayer(Buffer.from('%PDF-1.4 nada aqui'), 'application/pdf'), null);
  assert.equal(detectTextLayer(Buffer.from('<html>'), 'text/html'), true);
  assert.equal(detectTextLayer(null, 'application/pdf'), null);
});

test('perfil sem aditivos produz apenas o documento do contrato', () => {
  const tce = tceResult();
  const ci = ContractIntelligenceService.analyze(tce);
  const documentos = documentsFromProfile(ci.contratos[0], tce.entity);

  assert.equal(documentos.length, 1);
  assert.equal(documentos[0].documentType, DOCUMENT_TYPE.CONTRACT);
  assert.equal(documentos[0].relatedEntity.cnpj, profile.cnpj);
});

test('entrada vazia produz catálogo válido sem inventar documento', async () => {
  const resultado = await DocumentIntelligenceService.collect({});

  assert.deepEqual(resultado.documentos, []);
  assert.equal(resultado.resumo.total, 0);
  assert.ok(resultado.limitacao);
  assert.match(resultado.limitacao, /não é lido nesta fase/i);
});
