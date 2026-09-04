const test = require('node:test');
const assert = require('node:assert/strict');

const { ContractIntelligenceService } = require('../src/contract-intelligence/contract-intelligence.service');
const {
  buildContractTimeline,
  orderEntries,
  detectTemporalConflict,
  describeAbsence,
} = require('../src/contract-intelligence/contract-timeline');
const {
  CONTRACT_EVENT_TYPE,
  DATE_PRECISION,
  DATE_CONFIDENCE,
  ASSOCIATION_CONFIDENCE,
  buildContractClosureEvent,
  buildContract,
} = require('../src/contract-intelligence/contract.model');
const {
  normalizeContract,
  normalizeAdditive,
  normalizeBid,
  normalizeExpense,
} = require('../src/services/tce-pe/tce-pe.adapters');
const { buildEntityProfile } = require('../src/entity-resolution/entity-resolution');
const { RELATIONSHIP_TYPE } = require('../src/domain/relationship-type');
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
  Estagio: 'Em Execução',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/contrato.pdf',
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
  Situacao: 'Regular',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/aditivo.pdf',
  ...overrides,
}, profile, { params: {} });

const licitacao = (overrides = {}) => normalizeBid({
  NUMERODOCUMENTOAJUSTADO: '10811370000162',
  RAZAOSOCIAL: 'Guerra Construções Ltda',
  CODIGOPL: '203515',
  NOMEMODALIDADE: 'Concorrência',
  ADJUDICADA: 'Sim',
  TOTALADJUDICADOLICITANTE: '798881.01',
  DATAPUBLICACAOHOMOLOGACAO: '2024-03-01 00:00:00.0',
  DESCRICAOOBJETO: 'Obra de urbanização',
  ...overrides,
}, profile, { params: {} });

const despesa = (overrides = {}) => normalizeExpense({
  CPF_CNPJ: '10811370000162',
  NOMEUNIDADEGESTORA: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
  ID_UNIDADE_GESTORA: '782',
  HISTORICO: 'Pagamento referente ao contrato 073/2024 de urbanização',
  VALOREMPENHADO: '200000',
  VALORLIQUIDADO: '150000',
  VALORPAGO: '100000',
  NUMEROEMPENHO: '77',
  ANOREFERENCIA: '2024',
  DATAEMPENHO: '2024-07-15 00:00:00.0',
  ...overrides,
}, profile, { method: 'DespesasMunicipais' });

const providers = (overrides = {}) => Object.entries({
  'tce-pe-contratos': 'SUCCESS',
  'tce-pe-aditivos': 'SUCCESS',
  'tce-pe-licitacoes': 'SUCCESS',
  'tce-pe-obras': 'EMPTY',
  'tce-pe-despesas-municipais': 'SUCCESS',
  ...overrides,
}).map(([provider, status]) => ({ provider, status, quantidade: status === 'SUCCESS' ? 1 : 0, erros: [], warnings: [] }));

function analisar(input = {}, options = {}) {
  return ContractIntelligenceService.analyze({
    entity: { uf: 'PE', entityId: profile.entityId, cnpj: profile.cnpj, razaoSocial: profile.razaoSocial },
    contratos: [contrato()],
    aditivos: [],
    licitacoes: [],
    despesas: [],
    obras: [],
    providers: providers(),
    ...input,
  }, options);
}

const linha = (resultado) => resultado.contratos[0].timelineDetalhada;
const rotulos = (timeline) => timeline.entries.map((entry) => entry.label);

// ==========================================================
// Ordenação e datas
// ==========================================================

test('1 — a linha do tempo ordena cronologicamente', () => {
  const timeline = linha(analisar({
    aditivos: [
      aditivo({ NumeroTermoAditivo: '002', Vigencia: '15/09/2024 a 15/10/2024' }),
      aditivo({ NumeroTermoAditivo: '001', Vigencia: '10/06/2024 a 10/09/2024' }),
    ],
    licitacoes: [licitacao()],
  }));

  const datas = timeline.entries.filter((entry) => entry.eventDate).map((entry) => entry.eventDate);
  assert.deepEqual(datas, [...datas].sort(), 'as datas precisam estar em ordem crescente');
  assert.equal(timeline.entries[0].kind, 'LICITACAO', 'a licitação antecede o contrato');
  assert.equal(timeline.entries[1].kind, 'CONTRATO');
});

test('2 — eventos na mesma data recebem ordem técnica declarada como técnica', () => {
  const timeline = linha(analisar({
    aditivos: [
      aditivo({ NumeroTermoAditivo: '002', Vigencia: '10/06/2024 a 10/09/2024' }),
      aditivo({ NumeroTermoAditivo: '001', Vigencia: '10/06/2024 a 10/09/2024' }),
    ],
  }));
  const mesmaData = timeline.entries.filter((entry) => entry.eventDate === '2024-06-10');

  assert.equal(mesmaData.length, 2);
  // Desempate determinístico pelo número do termo, para a interface não tremer.
  assert.deepEqual(mesmaData.map((entry) => entry.numeroTermoAditivo), ['001', '002']);
  // E declarado como técnico: não é prova de precedência.
  assert.equal(mesmaData.every((entry) => entry.orderWithinDateIsTechnical), true);
});

test('3 — data publicada pela fonte é EXACT', () => {
  const timeline = linha(analisar({ licitacoes: [licitacao()] }));
  const entrada = timeline.entries.find((entry) => entry.kind === 'LICITACAO');

  assert.equal(entrada.datePrecision, DATE_PRECISION.EXACT);
  assert.equal(entrada.dateConfidence, DATE_CONFIDENCE.HIGH);
  assert.equal(entrada.dateSource, 'dataPublicacaoHomologacao');
});

test('4 e 7 — vigência usada como aproximação nunca aparece como data exata', () => {
  const timeline = linha(analisar({ aditivos: [aditivo()] }));
  const contratoEntry = timeline.entries.find((entry) => entry.kind === 'CONTRATO');
  const aditivoEntry = timeline.entries.find((entry) => entry.kind === 'ADITIVO');

  for (const entrada of [contratoEntry, aditivoEntry]) {
    assert.equal(entrada.datePrecision, DATE_PRECISION.APPROXIMATE);
    assert.equal(entrada.dateConfidence, DATE_CONFIDENCE.MEDIUM);
    assert.notEqual(entrada.datePrecision, DATE_PRECISION.EXACT);
    assert.match(entrada.dateSource, /vigencia/i);
    assert.match(entrada.orderingBasis, /não publica a data de assinatura/i);
  }
});

test('5 — só o ano conhecido produz YEAR_ONLY, sem data', () => {
  const timeline = linha(analisar({ aditivos: [aditivo({ Vigencia: '', AnoTermoAditivo: '2024' })] }));
  const entrada = timeline.entries.find((entry) => entry.kind === 'ADITIVO');

  assert.equal(entrada.datePrecision, DATE_PRECISION.YEAR_ONLY);
  assert.equal(entrada.eventDate, null, 'ano conhecido não vira data');
  assert.equal(entrada.eventYear, '2024');
  assert.equal(entrada.dateConfidence, DATE_CONFIDENCE.LOW);
});

test('6 — sem informação temporal o evento permanece, com UNKNOWN', () => {
  const timeline = linha(analisar({
    aditivos: [aditivo({ Vigencia: '', AnoTermoAditivo: '' })],
  }));
  const entrada = timeline.entries.find((entry) => entry.kind === 'ADITIVO');

  assert.ok(entrada, 'o evento sem data não pode desaparecer');
  assert.equal(entrada.datePrecision, DATE_PRECISION.UNKNOWN);
  assert.equal(entrada.eventDate, null);
  assert.equal(entrada.dateSource, null);
  assert.match(timeline.aviso, /não foi estimada/i);
});

test('8 e 9 — contrato antecede os aditivos, e cada aditivo permanece individual', () => {
  const timeline = linha(analisar({
    aditivos: ['001', '002', '003'].map((numero, index) => aditivo({
      NumeroTermoAditivo: numero,
      Vigencia: `1${index}/06/2024 a 10/09/2024`,
    })),
  }));

  assert.equal(timeline.entries[0].kind, 'CONTRATO');
  const aditivos = timeline.entries.filter((entry) => entry.kind === 'ADITIVO');
  assert.equal(aditivos.length, 3);
  assert.deepEqual(aditivos.map((entry) => entry.numeroTermoAditivo), ['001', '002', '003']);
});

// ==========================================================
// Valores
// ==========================================================

test('10 e 11 — acréscimo e supressão preservam o valor e o sinal da fonte', () => {
  const timeline = linha(analisar({
    aditivos: [
      aditivo({ NumeroTermoAditivo: '001', ValorTermoAditivo: '301312.26' }),
      aditivo({ NumeroTermoAditivo: '002', ValorTermoAditivo: '-100000', Vigencia: '15/09/2024 a 15/10/2024' }),
    ],
  }));
  const [adicao, supressao] = timeline.entries.filter((entry) => entry.kind === 'ADITIVO');

  assert.equal(adicao.value, 301312.26);
  assert.ok(adicao.types.includes(CONTRACT_EVENT_TYPE.VALUE_ADDITION));
  assert.equal(supressao.value, -100000);
  assert.ok(supressao.types.includes(CONTRACT_EVENT_TYPE.VALUE_SUPPRESSION));
  // Todo valor é da fonte; nenhum é calculado nesta fase.
  assert.equal(adicao.valueOrigin, 'SOURCE');
  assert.equal(supressao.valueOrigin, 'SOURCE');
});

test('nenhum valor acumulado ou percentual é produzido pela linha do tempo', () => {
  const timeline = linha(analisar({
    aditivos: [aditivo(), aditivo({ NumeroTermoAditivo: '002', Vigencia: '15/09/2024 a 15/10/2024' })],
  }));
  const serializado = JSON.stringify({ cobertura: timeline.cobertura, entries: timeline.entries.map((entry) => ({ ...entry, raw: null })) }).toLowerCase();

  for (const proibido of ['percentual', 'acumulad', 'valorfinal', 'valortotal']) {
    assert.equal(serializado.includes(proibido), false, `a linha do tempo não pode produzir "${proibido}"`);
  }
});

// ==========================================================
// Encerramento × rescisão
// ==========================================================

test('12 — contrato concluído gera CONTRACT_CLOSED, nunca TERMINATION', () => {
  const timeline = linha(analisar({ contratos: [contrato({ Situacao: 'Concluído' })] }));
  const desfecho = timeline.entries.find((entry) => entry.type === CONTRACT_EVENT_TYPE.CONTRACT_CLOSED);

  assert.ok(desfecho, 'o encerramento precisa aparecer');
  assert.equal(
    timeline.entries.some((entry) => entry.types.includes(CONTRACT_EVENT_TYPE.TERMINATION)),
    false,
    'contrato concluído não é contrato rescindido',
  );
});

test('13 — contrato rescindido gera TERMINATION', () => {
  const timeline = linha(analisar({
    contratos: [contrato({ Situacao: 'Rescindido por Acordo Entre as Partes' })],
  }));
  const desfecho = timeline.entries.find((entry) => entry.type === CONTRACT_EVENT_TYPE.TERMINATION);

  assert.ok(desfecho);
  assert.match(desfecho.description, /Rescindido por Acordo/);
  assert.equal(
    timeline.entries.some((entry) => entry.types.includes(CONTRACT_EVENT_TYPE.CONTRACT_CLOSED)),
    false,
  );
});

test('14 — "Fim de Vigência" e "Encerrado" nunca viram rescisão', () => {
  for (const situacao of ['Concluído', 'Encerrado', 'Fim de Vigência', 'Finalizado']) {
    const evento = buildContractClosureEvent(buildContract(contrato({ Situacao: situacao }), {}));
    assert.equal(evento.type, CONTRACT_EVENT_TYPE.CONTRACT_CLOSED, `"${situacao}" não é rescisão`);
    assert.match(evento.typeBasis[0], /Encerramento não é rescisão/);
  }
  for (const situacao of ['Rescindido por Acordo Entre as Partes', 'Contrato cancelado', 'Extinto']) {
    const evento = buildContractClosureEvent(buildContract(contrato({ Situacao: situacao }), {}));
    assert.equal(evento.type, CONTRACT_EVENT_TYPE.TERMINATION, `"${situacao}" é ruptura`);
  }
});

test('situação "Regular" não gera desfecho algum', () => {
  assert.equal(buildContractClosureEvent(buildContract(contrato({ Situacao: 'Regular' }), {})), null);
});

// ==========================================================
// Processos, despesas e obras
// ==========================================================

test('15 — processo relacionado com data confiável entra como fato, não como risco', () => {
  const timeline = linha(analisar({}, {
    processes: [{
      processNumber: '25100407-7',
      relationshipType: RELATIONSHIP_TYPE.PARTY,
      judgmentDate: '2024-11-20',
      modality: 'Auditoria Especial',
      relevantToEntity: true,
    }],
  }));
  const entrada = timeline.entries.find((entry) => entry.kind === 'PROCESSO');

  assert.ok(entrada);
  assert.equal(entrada.datePrecision, DATE_PRECISION.EXACT);
  assert.equal(entrada.relationshipType, RELATIONSHIP_TYPE.PARTY);
  // O vínculo é com a empresa, não com o contrato: o TCE-PE não publica essa ligação.
  assert.equal(entrada.associationConfidence, ASSOCIATION_CONFIDENCE.PROBABLE);
  assert.match(entrada.associationBasis, /não publica ligação entre processo e contrato/i);
  assert.equal(JSON.stringify(entrada).toLowerCase().includes('risco'), false);
});

test('16 — processo falso positivo não entra na linha do tempo principal', () => {
  const timeline = linha(analisar({}, {
    processes: [
      { processNumber: '99999999-9', relationshipType: RELATIONSHIP_TYPE.FALSE_POSITIVE, judgmentDate: '2024-05-01' },
      { processNumber: '88888888-8', relevantToEntity: false, relationshipType: RELATIONSHIP_TYPE.MENTIONED, judgmentDate: '2024-05-02' },
    ],
  }));

  assert.equal(timeline.entries.some((entry) => entry.kind === 'PROCESSO'), false);
});

test('processo citado sem posição definida entra como vínculo incerto', () => {
  const timeline = linha(analisar({}, {
    processes: [{
      processNumber: '25100409-9',
      relationshipType: RELATIONSHIP_TYPE.MENTIONED,
      judgmentDate: '2024-08-10',
      relevantToEntity: true,
    }],
  }));
  const entrada = timeline.entries.find((entry) => entry.kind === 'PROCESSO');

  assert.equal(entrada.associationConfidence, ASSOCIATION_CONFIDENCE.UNCERTAIN);
  assert.match(entrada.associationBasis, /sem posição definida/i);
});

test('17 e 18 — empenho associado entra como incerto, com os estágios separados', () => {
  const timeline = linha(analisar({ despesas: [despesa()] }));
  const entrada = timeline.entries.find((entry) => entry.kind === 'EMPENHO');

  assert.ok(entrada);
  assert.equal(entrada.datePrecision, DATE_PRECISION.EXACT);
  // A fonte não publica o código do contrato: o vínculo é documental.
  assert.equal(entrada.associationConfidence, ASSOCIATION_CONFIDENCE.UNCERTAIN);
  assert.equal(entrada.value, 200000, 'o evento carrega o empenhado');
  assert.match(entrada.description, /não se somam/i);
});

test('despesa que não cita o contrato não entra na linha do tempo', () => {
  const timeline = linha(analisar({
    despesas: [despesa({ HISTORICO: 'Pagamento de serviços diversos', ID_UNIDADE_GESTORA: '999' })],
  }));
  assert.equal(timeline.entries.some((entry) => entry.kind === 'EMPENHO'), false);
});

test('19 — obra nunca entra na linha do tempo do contrato', () => {
  const timeline = linha(analisar({
    obras: [{ tipo: 'OBRA', codigoObra: '304', titulo: 'Obra em Recife', municipio: 'Recife', anoInicial: '2024' }],
  }));

  assert.equal(timeline.entries.some((entry) => entry.kind === 'OBRA'), false);
  assert.match(
    ContractIntelligenceService.analyze({
      contratos: [contrato()], providers: providers(),
    }).contratos[0].relacionamentos.obrasLimitacao,
    /não publica identificador que ligue obra a contrato/i,
  );
});

// ==========================================================
// Source Status
// ==========================================================

test('20 — fonte PARTIAL é declarada como cobertura incompleta', () => {
  const timeline = linha(analisar({ providers: providers({ 'tce-pe-aditivos': 'PARTIAL' }) }));

  assert.equal(timeline.cobertura.fontesPartial, 1);
  assert.ok(timeline.notasDeCobertura.some((nota) => /concluída apenas em parte/i.test(nota)));
});

test('21 — aditivos UNAVAILABLE não vira "não existem aditivos"', () => {
  const timeline = linha(analisar({ providers: providers({ 'tce-pe-aditivos': 'UNAVAILABLE' }) }));
  const nota = timeline.notasDeCobertura.find((item) => /termos aditivos/i.test(item));

  assert.match(nota, /Não foi possível verificar/i);
  assert.equal(/não foram encontrados/i.test(nota), false);
  assert.equal(timeline.cobertura.fontesUnavailable, 1);
});

test('22 — aditivos EMPTY é "não foram encontrados na consulta realizada"', () => {
  const timeline = linha(analisar({ providers: providers({ 'tce-pe-aditivos': 'EMPTY' }) }));
  const nota = timeline.notasDeCobertura.find((item) => /termos aditivos/i.test(item));

  assert.match(nota, /Não foram encontrados registros/i);
  assert.equal(/não foi possível/i.test(nota), false);
});

test('EMPTY e UNAVAILABLE produzem formulações distintas', () => {
  const vazio = describeAbsence('termos aditivos', SOURCE_STATUS.EMPTY);
  const indisponivel = describeAbsence('termos aditivos', SOURCE_STATUS.UNAVAILABLE);

  assert.notEqual(vazio, indisponivel);
  assert.match(indisponivel, /não significa que não existam/i);
});

// ==========================================================
// Conflito temporal
// ==========================================================

test('23 — datas oficiais divergentes preservam ambas e marcam o conflito', () => {
  // O termo declara ano 2023, mas a vigência publicada começa em 2024.
  const timeline = linha(analisar({
    aditivos: [aditivo({ AnoTermoAditivo: '2023', Vigencia: '10/06/2024 a 10/09/2024' })],
  }));
  const entrada = timeline.entries.find((entry) => entry.kind === 'ADITIVO');

  assert.equal(entrada.temporalConflict, true);
  assert.equal(entrada.conflitos.length, 2, 'as duas datas oficiais são preservadas');
  assert.deepEqual(entrada.conflitos.map((item) => item.valor).sort(), ['2023', '2024']);
  assert.match(entrada.conflitoNota, /não é resolvida automaticamente/i);
  assert.equal(timeline.cobertura.conflitosTemporais, 1);
});

test('sem divergência não há conflito registrado', () => {
  const timeline = linha(analisar({ aditivos: [aditivo()] }));
  assert.equal(timeline.cobertura.conflitosTemporais, 0);
  assert.equal(detectTemporalConflict({ anoTermoAditivo: '2024', eventYear: '2024' }), null);
});

// ==========================================================
// Deduplicação, evidência e cobertura
// ==========================================================

test('24 — o mesmo aditivo repetido não duplica entrada na linha do tempo', () => {
  const timeline = linha(analisar({ aditivos: [aditivo(), aditivo()] }));
  assert.equal(timeline.entries.filter((entry) => entry.kind === 'ADITIVO').length, 1);
});

test('25, 26 e 27 — cada entrada preserva raw, sourceUrl e a origem da data', () => {
  const timeline = linha(analisar({ aditivos: [aditivo()], licitacoes: [licitacao()], despesas: [despesa()] }));

  for (const entrada of timeline.entries) {
    assert.ok(entrada.source, `entrada sem fonte: ${entrada.label}`);
    assert.ok(entrada.endpoint);
    assert.ok(entrada.retrievedAt);
    if (entrada.datePrecision !== DATE_PRECISION.UNKNOWN) {
      assert.ok(entrada.dateSource, `entrada sem origem de data: ${entrada.label}`);
      assert.ok(entrada.orderingBasis);
    }
  }
  const contratoEntry = timeline.entries.find((entry) => entry.kind === 'CONTRATO');
  assert.ok(contratoEntry.raw, 'o registro bruto acompanha o fato derivado');
  assert.ok(contratoEntry.sourceUrl);
});

test('28 — a linha do tempo não produz score nem classificação de risco', () => {
  const resultado = analisar({ aditivos: [aditivo(), aditivo({ NumeroTermoAditivo: '002' })], licitacoes: [licitacao()] });
  const timeline = linha(resultado);
  const semIdentidade = JSON.parse(
    JSON.stringify(timeline),
    (key, value) => (key === 'entityMatch' || key === 'raw' ? undefined : value),
  );
  const serializado = JSON.stringify(semIdentidade).toLowerCase();

  for (const proibido of ['score', 'risco', 'suspeit', 'irregular', 'fraude', 'severidade', 'alerta']) {
    assert.equal(serializado.includes(proibido), false, `a linha do tempo não pode produzir "${proibido}"`);
  }
});

test('a cobertura temporal conta as precisões sem virar avaliação', () => {
  const timeline = linha(analisar({
    aditivos: [
      aditivo({ NumeroTermoAditivo: '001' }),
      aditivo({ NumeroTermoAditivo: '002', Vigencia: '', AnoTermoAditivo: '2024' }),
      aditivo({ NumeroTermoAditivo: '003', Vigencia: '', AnoTermoAditivo: '' }),
    ],
    licitacoes: [licitacao()],
  }));

  assert.equal(timeline.cobertura.eventosComDataExata, 1);
  assert.equal(timeline.cobertura.eventosComDataAproximada, 2);
  assert.equal(timeline.cobertura.eventosApenasComAno, 1);
  assert.equal(timeline.cobertura.eventosSemData, 1);
  assert.equal(timeline.cobertura.totalEventos, 5);
});

test('vigência é apresentada como vigência, jamais como execução', () => {
  const timeline = linha(analisar({}));

  assert.equal(timeline.vigencia.inicial, '19/03/2024');
  assert.equal(timeline.vigencia.final, '19/12/2024');
  assert.match(timeline.vigencia.nota, /Vigência não é execução/i);
  // A nota não pode AFIRMAR execução. Ela menciona o termo justamente para negá-lo:
  // "a fonte não informa o que foi efetivamente executado no período".
  assert.match(timeline.vigencia.nota, /não informa o que foi efetivamente executado/i);
  assert.equal(/período de execução|foi executado durante/i.test(timeline.vigencia.nota), false);
});

test('a limitação declara que a linha do tempo não é a história completa', () => {
  const timeline = linha(analisar({}));

  assert.match(timeline.limitacao, /efetivamente disponíveis e consultados/i);
  assert.match(timeline.limitacao, /não representa toda a história/i);
  assert.match(timeline.limitacao, /não publica data de assinatura/i);
});

// ==========================================================
// Regressão das fases anteriores
// ==========================================================

test('as fases anteriores permanecem intactas', () => {
  const { resolveEntityMatch, MATCH_LEVEL } = require('../src/entity-resolution/entity-resolution');
  const { resolveSourceStatus, SOURCE_STATUS: STATUS } = require('../src/domain/source-status');
  const { generateSearchMatrix } = require('../src/search-matrix/search-query-generator');
  const { TcePeIntelligenceService } = require('../src/services/tce-pe/tce-pe.intelligence');

  // Fase 1 — o falso positivo da Síria continua descartado.
  assert.equal(
    resolveEntityMatch(profile, { text: 'A guerra na Síria destruiu patrimônios.' }).level,
    MATCH_LEVEL.FALSE_POSITIVE,
  );
  // Fase 2 — EMPTY e UNAVAILABLE continuam distintos.
  assert.equal(resolveSourceStatus({ attempted: 1, succeeded: 1, resultCount: 0 }), STATUS.EMPTY);
  assert.equal(resolveSourceStatus({ attempted: 1, succeeded: 0, resultCount: 0 }), STATUS.UNAVAILABLE);
  // Search Matrix — consultas nascem planejadas.
  const matriz = generateSearchMatrix(profile);
  assert.equal(matriz.queries.every((query) => query.status === 'PLANNED'), true);
  // TCE-PE Intelligence — os providers continuam declarados.
  assert.ok(Object.keys(TcePeIntelligenceService.TCE_PROVIDERS).length >= 7);
});

test('a linha do tempo não faz chamada de rede', () => {
  const originalFetch = global.fetch;
  let chamadas = 0;
  global.fetch = async () => { chamadas += 1; throw new Error('rede não permitida'); };
  try {
    buildContractTimeline(analisar({ aditivos: [aditivo()] }).contratos[0], {});
    assert.equal(chamadas, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('linha do tempo vazia não quebra e não inventa evento', () => {
  const timeline = buildContractTimeline({
    contrato: { id: 'x', numeroContrato: null, anoContrato: null, vigenciaInicial: null, vigenciaFinal: null },
    eventos: [],
    relacionamentos: {},
    sourceStatuses: {},
  });

  assert.deepEqual(timeline.entries, []);
  assert.equal(timeline.cobertura.totalEventos, 0);
  assert.equal(orderEntries([]).length, 0);
});
