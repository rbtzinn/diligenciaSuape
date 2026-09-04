const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContractIntelligenceService,
  associateExpenses,
  associateBids,
} = require('../src/contract-intelligence/contract-intelligence.service');
const {
  CONTRACT_EVENT_TYPE,
  ASSOCIATION_CONFIDENCE,
  TIMELINE_ORDERING,
  buildContract,
  buildAdditiveEvent,
  associateAdditive,
  buildTimeline,
  dedupeEvents,
} = require('../src/contract-intelligence/contract.model');
const {
  normalizeContract,
  normalizeAdditive,
  normalizeBid,
  normalizeExpense,
} = require('../src/services/tce-pe/tce-pe.adapters');
const { buildEntityProfile } = require('../src/entity-resolution/entity-resolution');
const { RELATIONSHIP_TYPE } = require('../src/domain/relationship-type');

// Caso real, o mesmo das fases anteriores.
const GUERRA = {
  cnpj: '10.811.370/0001-62',
  razaoSocial: 'GUERRA CONSTRUCOES LTDA',
  municipio: 'Recife',
  uf: 'PE',
};
const profile = buildEntityProfile(GUERRA);

const CONTRATO_BRUTO = {
  CodigoContrato: '437869',
  NumeroContrato: '069',
  AnoContrato: '2018',
  CodigoPL: '203515',
  NumeroProcesso: '54',
  AnoProcesso: '2018',
  TipoProcesso: 'Lei 13.303/2016 - Dispensa',
  UnidadeGestora: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
  UnidadeOrcamentaria: 'ADEPE',
  SiglaUG: 'ADEPE',
  CodigoUG: '782',
  Esfera: 'E ',
  Municipio: 'Recife',
  NumeroDocumentoAjustado: '10811370000162                ',
  RazaoSocial: 'Guerra Construções Ltda',
  Objeto: '2.010 MANUTENÇÃO E CONSERVAÇÃO DE BENS IMÓVEIS',
  Vigencia: '18/12/2018 a 18/02/2019',
  Valor: '94182.70',
  Estagio: 'Em Execução',
  Situacao: 'Regular',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/audinArquivos/licon/contrato/782/LICON.pdf',
};

function aditivoBruto(overrides = {}) {
  return {
    CodigoContrato: '437869',
    NumeroContrato: '069',
    AnoContrato: '2018',
    NumeroTermoAditivo: '001',
    AnoTermoAditivo: '2019',
    ValorTermoAditivo: '301312.26',
    Vigencia: '19/02/2019 a 19/05/2019',
    ObjetoAditivo: '3.128 URBANIZAÇÃO',
    JustificativaTermoAditivo: '1? termo de acr?scimo de valor quantitativo ',
    NumeroDocumentoAjustado: '10811370000162',
    UnidadeGestora: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
    CodigoUG: '782',
    Esfera: 'E ',
    Situacao: 'Regular',
    Estagio: 'Em Execução',
    LinkArquivo: 'http://sistemas.tcepe.tc.br/audinArquivos/licon/contrato/termoAditivo/1.pdf',
    ...overrides,
  };
}

const contrato = (overrides = {}) => normalizeContract({ ...CONTRATO_BRUTO, ...overrides }, profile, { params: {} });
const aditivo = (overrides = {}) => normalizeAdditive(aditivoBruto(overrides), profile, { params: {} });

/** Resultado da Fase TCE-PE, no formato que aquela camada devolve. */
function tceResult(overrides = {}) {
  return {
    entity: { entityId: profile.entityId, cnpj: profile.cnpj, razaoSocial: profile.razaoSocial, uf: 'PE' },
    contratos: [],
    aditivos: [],
    licitacoes: [],
    despesas: [],
    obras: [],
    providers: [
      { provider: 'tce-pe-contratos', status: 'SUCCESS', quantidade: 1, erros: [], warnings: [] },
      { provider: 'tce-pe-aditivos', status: 'SUCCESS', quantidade: 1, erros: [], warnings: [] },
      { provider: 'tce-pe-obras', status: 'EMPTY', quantidade: 0, erros: [], warnings: [] },
    ],
    ...overrides,
  };
}

const primeiroPerfil = (resultado) => resultado.contratos[0];

// ==========================================================
// Cenários de contrato e aditivos
// ==========================================================

test('1 — contrato sem aditivos tem apenas o evento de assinatura', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({ contratos: [contrato()] }));
  const perfil = primeiroPerfil(resultado);

  assert.equal(perfil.aditivos.length, 0);
  assert.equal(perfil.eventos.length, 1);
  assert.equal(perfil.eventos[0].type, CONTRACT_EVENT_TYPE.CONTRACT_CREATED);
  assert.equal(resultado.resumo.contratosSemAditivo, 1);
});

test('2 — contrato com um aditivo preserva os dois eventos', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo()] }),
  );
  const perfil = primeiroPerfil(resultado);

  assert.equal(perfil.eventos.length, 2);
  assert.equal(perfil.aditivos.length, 1);
  assert.equal(perfil.aditivos[0].numeroTermoAditivo, '001');
});

test('3 — cinco aditivos permanecem individualizados', () => {
  const aditivos = ['001', '002', '003', '004', '005'].map((numero) => aditivo({ NumeroTermoAditivo: numero }));
  const resultado = ContractIntelligenceService.analyze(tceResult({ contratos: [contrato()], aditivos }));
  const perfil = primeiroPerfil(resultado);

  assert.equal(perfil.aditivos.length, 5, 'nenhum aditivo pode sobrescrever outro');
  assert.deepEqual(
    perfil.aditivos.map((event) => event.numeroTermoAditivo),
    ['001', '002', '003', '004', '005'],
  );
  assert.equal(perfil.eventos.length, 6);
});

test('4 — aditivo com valor positivo é VALUE_ADDITION', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo({ ValorTermoAditivo: '301312.26' })] }),
  );
  const evento = primeiroPerfil(resultado).aditivos[0];

  assert.equal(evento.value, 301312.26);
  assert.ok(evento.types.includes(CONTRACT_EVENT_TYPE.VALUE_ADDITION));
  assert.ok(evento.typeBasis.some((item) => /valor positivo/i.test(item)));
});

test('5 — aditivo com valor negativo preserva o sinal e é VALUE_SUPPRESSION', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo({ ValorTermoAditivo: '-100000' })] }),
  );
  const evento = primeiroPerfil(resultado).aditivos[0];

  assert.equal(evento.value, -100000, 'o sinal da fonte não pode ser removido');
  assert.ok(evento.types.includes(CONTRACT_EVENT_TYPE.VALUE_SUPPRESSION));
  // Valor negativo é redução registrada pela fonte, nunca irregularidade.
  assert.equal(evento.irregular, undefined);
  assert.equal(evento.risco, undefined);
});

test('6 — vigência além do contrato é TERM_EXTENSION; aquém é TERM_REDUCTION', () => {
  const base = tceResult({ contratos: [contrato()] });
  const estendido = ContractIntelligenceService.analyze({
    ...base,
    aditivos: [aditivo({ Vigencia: '19/02/2019 a 19/05/2019' })],
  });
  const reduzido = ContractIntelligenceService.analyze({
    ...base,
    aditivos: [aditivo({ Vigencia: '02/01/2019 a 15/01/2019' })],
  });

  assert.ok(primeiroPerfil(estendido).aditivos[0].types.includes(CONTRACT_EVENT_TYPE.TERM_EXTENSION));
  assert.ok(primeiroPerfil(reduzido).aditivos[0].types.includes(CONTRACT_EVENT_TYPE.TERM_REDUCTION));
});

test('7 — justificativa quantitativa vira QUANTITATIVE_CHANGE, mesmo com acentos corrompidos', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    aditivos: [aditivo({ JustificativaTermoAditivo: 'acr?scimo de valor por aumento de quantitativo' })],
  }));
  const evento = primeiroPerfil(resultado).aditivos[0];

  assert.ok(evento.types.includes(CONTRACT_EVENT_TYPE.QUANTITATIVE_CHANGE));
  // A justificativa é preservada exatamente como a fonte a publicou.
  assert.match(evento.justificativa, /acr\?scimo/);
});

test('8 — justificativa qualitativa vira QUALITATIVE_CHANGE', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    aditivos: [aditivo({ JustificativaTermoAditivo: 'alteração qualitativa do objeto' })],
  }));
  assert.ok(primeiroPerfil(resultado).aditivos[0].types.includes(CONTRACT_EVENT_TYPE.QUALITATIVE_CHANGE));
});

test('9 — contrato sem data não recebe data inventada', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato({ Vigencia: '' })], aditivos: [aditivo({ Vigencia: '' })] }),
  );
  const perfil = primeiroPerfil(resultado);

  assert.equal(perfil.contrato.vigenciaInicialIso, null);
  assert.equal(perfil.eventos.every((event) => event.date === null), true);
  assert.equal(perfil.timeline.ordering, TIMELINE_ORDERING.UNKNOWN);
  assert.match(perfil.timeline.aviso, /ordenação cronológica está incompleta/i);
});

test('10 — fonte parcial preserva o estado de cada provider', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    aditivos: [aditivo()],
    providers: [
      { provider: 'tce-pe-contratos', status: 'SUCCESS', quantidade: 1, erros: [], warnings: [] },
      { provider: 'tce-pe-aditivos', status: 'PARTIAL', quantidade: 1, erros: [], warnings: ['truncado'] },
      { provider: 'tce-pe-obras', status: 'EMPTY', quantidade: 0, erros: [], warnings: [] },
      { provider: 'tce-pe-licitacoes', status: 'UNAVAILABLE', quantidade: 0, erros: ['timeout'], warnings: [] },
    ],
  }));
  const perfil = primeiroPerfil(resultado);

  // Quatro estados distintos convivendo, sem colapso num status global.
  assert.equal(perfil.sourceStatuses.contrato, 'SUCCESS');
  assert.equal(perfil.sourceStatuses.aditivos, 'PARTIAL');
  assert.equal(perfil.sourceStatuses.obras, 'EMPTY');
  assert.equal(perfil.sourceStatuses.licitacoes, 'UNAVAILABLE');
  assert.notEqual(perfil.sourceStatuses.obras, perfil.sourceStatuses.licitacoes);
});

test('11 — o mesmo aditivo devolvido duas vezes gera um único evento', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo(), aditivo()] }),
  );
  const perfil = primeiroPerfil(resultado);

  assert.equal(perfil.aditivos.length, 1);
  assert.equal(perfil.aditivos[0].duplicatesMerged, 1);
});

test('12 e 13 — contrato homônimo de CNPJ divergente não entra no perfil', () => {
  // A camada TCE-PE já separa o divergente; aqui se garante que, se chegar,
  // ele não é silenciosamente adotado como contrato da entidade.
  const homonimo = normalizeContract(
    { ...CONTRATO_BRUTO, CodigoContrato: '999999', NumeroDocumentoAjustado: '63314254000108', RazaoSocial: 'GUERRA CONSTRUCOES LTDA - MA' },
    profile,
    {},
  );
  assert.equal(homonimo.relationshipType, RELATIONSHIP_TYPE.FALSE_POSITIVE);

  const construido = buildContract(homonimo, { uf: 'PE' });
  assert.equal(construido.relationshipType, RELATIONSHIP_TYPE.FALSE_POSITIVE);
  assert.equal(construido.entityMatch.level, 'FALSE_POSITIVE');
});

test('14 — aditivo sem contrato correspondente fica órfão declarado', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    aditivos: [aditivo({ CodigoContrato: '000000', NumeroContrato: '999', AnoContrato: '2010' })],
  }));

  assert.equal(resultado.aditivosOrfaos.length, 1);
  assert.equal(resultado.aditivosOrfaos[0].associationConfidence, ASSOCIATION_CONFIDENCE.NOT_ASSOCIATED);
  assert.match(resultado.aditivosOrfaos[0].associationBasis, /Nenhum contrato coletado/i);
  // O termo não é descartado: existe e é fato oficial.
  assert.equal(resultado.aditivosOrfaos[0].numeroTermoAditivo, '001');
});

// ==========================================================
// Invariantes
// ==========================================================

test('o contrato original nunca é sobrescrito por aditivo', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    aditivos: [aditivo({ ValorTermoAditivo: '999999', ObjetoAditivo: 'OUTRO OBJETO' })],
  }));
  const perfil = primeiroPerfil(resultado);

  assert.equal(perfil.contrato.valorInicial, 94182.7);
  assert.match(perfil.contrato.objeto, /MANUTENÇÃO E CONSERVAÇÃO/);
  assert.equal(perfil.contrato.vigenciaFinal, '18/02/2019');
});

test('valorAtualizado não é inventado quando a fonte não o publica', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    aditivos: [aditivo(), aditivo({ NumeroTermoAditivo: '002' })],
  }));
  const perfil = primeiroPerfil(resultado);

  assert.equal(perfil.contrato.valorAtualizado, null);
  assert.equal(perfil.contrato.valorAtualizadoDisponivel, false);
});

test('nenhum percentual é calculado nesta camada', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo()] }),
  );
  const perfil = primeiroPerfil(resultado);
  const serializado = JSON.stringify({ contrato: perfil.contrato, resumo: perfil.resumo });

  assert.equal(serializado.includes('percentual'), false);
  assert.equal(perfil.aditivos[0].percentual, undefined);
});

test('nenhum score ou classificação de risco é produzido', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo(), aditivo({ NumeroTermoAditivo: '002' })] }),
  );

  // `entityMatch.score` é da Fase 1 e mede IDENTIDADE — "é mesmo esta empresa?".
  // Removê-lo da varredura é o que permite testar a ausência de score de RISCO
  // sem confundir os dois: um contrato com identidade 100 e risco nenhum é o
  // caso normal, e é exatamente essa distinção que a camada precisa preservar.
  const semIdentidade = JSON.parse(JSON.stringify(resultado), (key, value) => (
    key === 'entityMatch' ? undefined : value
  ));
  const serializado = JSON.stringify(semIdentidade).toLowerCase();

  for (const proibido of ['score', 'suspeit', 'irregular', 'fraude', 'superfatur', 'alto risco', 'severidade']) {
    assert.equal(serializado.includes(proibido), false, `a camada não pode produzir "${proibido}"`);
  }

  // O score que sobrevive é só o de identidade, e continua onde deve estar.
  const perfil = primeiroPerfil(resultado);
  assert.equal(typeof perfil.contrato.entityMatch.score, 'number');
  assert.equal(perfil.contrato.riskScore, undefined);
  assert.equal(perfil.resumo.risco, undefined);
});

test('EMPTY não significa inexistência e UNAVAILABLE não significa zero', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    providers: [
      { provider: 'tce-pe-contratos', status: 'SUCCESS', quantidade: 1, erros: [], warnings: [] },
      { provider: 'tce-pe-obras', status: 'EMPTY', quantidade: 0, erros: [], warnings: [] },
      { provider: 'tce-pe-despesas-municipais', status: 'UNAVAILABLE', quantidade: 0, erros: ['timeout'], warnings: [] },
    ],
  }));
  const perfil = primeiroPerfil(resultado);

  // Os dois produzem lista vazia e continuam sendo estados distintos.
  assert.equal(perfil.sourceStatuses.obras, 'EMPTY');
  assert.equal(perfil.sourceStatuses.despesas, 'UNAVAILABLE');
  assert.equal(resultado.cobertura['tce-pe-despesas-municipais'].erros[0], 'timeout');
});

test('todo evento carrega a origem que o sustenta', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo()] }),
  );

  for (const evento of primeiroPerfil(resultado).eventos) {
    assert.ok(evento.source, 'evento sem fonte não é rastreável');
    assert.ok(evento.endpoint);
    assert.ok(evento.sourceUrl);
    assert.ok(evento.retrievedAt);
    assert.ok(evento.raw, 'o registro bruto precisa acompanhar o fato derivado');
    assert.ok(evento.id);
  }
});

test('cada tipo atribuído declara o campo da fonte que o sustenta', () => {
  const resultado = ContractIntelligenceService.analyze(
    tceResult({ contratos: [contrato()], aditivos: [aditivo()] }),
  );
  const evento = primeiroPerfil(resultado).aditivos[0];

  assert.ok(evento.typeBasis.length > 0);
  assert.equal(evento.typeBasis.length >= evento.types.length - 1, true);
});

test('termo sem campo que determine a natureza fica só como ADDITIVE', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    aditivos: [aditivo({ ValorTermoAditivo: '', Vigencia: '', JustificativaTermoAditivo: '', ObjetoAditivo: '', Situacao: '' })],
  }));
  const evento = primeiroPerfil(resultado).aditivos[0];

  assert.deepEqual(evento.types, [CONTRACT_EVENT_TYPE.ADDITIVE]);
  assert.match(evento.typeBasis[0], /não publica campo que permita determinar/i);
});

// ==========================================================
// Associações
// ==========================================================

test('licitação associa por codigoPL, com confiança confirmada', () => {
  const licitacao = normalizeBid({
    NUMERODOCUMENTOAJUSTADO: '10811370000162',
    RAZAOSOCIAL: 'Guerra Construções Ltda',
    CODIGOPL: '203515',
    NOMEMODALIDADE: 'Dispensa',
    ADJUDICADA: 'Sim',
    TOTALADJUDICADOLICITANTE: '94182.70',
  }, profile, {});
  const associacoes = associateBids(buildContract(contrato(), {}), [licitacao]);

  assert.equal(associacoes.length, 1);
  assert.equal(associacoes[0].confidence, ASSOCIATION_CONFIDENCE.CONFIRMED);
  assert.match(associacoes[0].basis, /código do processo licitatório coincide/i);
});

test('despesa do mesmo CNPJ não é associada ao contrato sem identificador', () => {
  const despesa = normalizeExpense({
    CPF_CNPJ: '10811370000162',
    NOMEUNIDADEGESTORA: 'Outro órgão',
    ID_UNIDADE_GESTORA: '999',
    HISTORICO: 'Pagamento de serviços diversos',
    VALORPAGO: '10000',
    NUMEROEMPENHO: '1',
    ANOREFERENCIA: '2019',
  }, profile, { method: 'DespesasMunicipais' });

  const associacoes = associateExpenses(buildContract(contrato(), {}), [despesa]);
  assert.equal(associacoes.length, 0, 'CNPJ igual não liga pagamento a contrato');
});

test('despesa que cita o contrato na mesma unidade gestora fica como vínculo incerto', () => {
  const despesa = normalizeExpense({
    CPF_CNPJ: '10811370000162',
    NOMEUNIDADEGESTORA: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
    ID_UNIDADE_GESTORA: '782',
    HISTORICO: 'Pagamento referente ao contrato 069/2018 de manutenção predial',
    VALOREMPENHADO: '50000',
    VALORLIQUIDADO: '50000',
    VALORPAGO: '25000',
    NUMEROEMPENHO: '77',
    ANOREFERENCIA: '2019',
  }, profile, { method: 'DespesasMunicipais' });

  const associacoes = associateExpenses(buildContract(contrato(), {}), [despesa]);

  assert.equal(associacoes.length, 1);
  // Indício documental nunca vira certeza: a fonte não publica o código do contrato.
  assert.equal(associacoes[0].confidence, ASSOCIATION_CONFIDENCE.UNCERTAIN);
  assert.match(associacoes[0].basis, /não publica o código do contrato/i);
  // Estágios da despesa preservados separadamente.
  assert.equal(associacoes[0].valorEmpenhado, 50000);
  assert.equal(associacoes[0].valorPago, 25000);
});

test('obra não é associada a contrato por empresa e município', () => {
  const resultado = ContractIntelligenceService.analyze(tceResult({
    contratos: [contrato()],
    obras: [{ tipo: 'OBRA', codigoObra: '304', titulo: 'Obra', municipio: 'Recife' }],
  }));
  const perfil = primeiroPerfil(resultado);

  assert.deepEqual(perfil.relacionamentos.obras, []);
  assert.match(perfil.relacionamentos.obrasLimitacao, /não publica identificador que ligue obra a contrato/i);
  // A obra da entidade continua contabilizada, apenas não atribuída ao contrato.
  assert.equal(resultado.resumo.obrasDaEntidade, 1);
});

// ==========================================================
// Timeline e deduplicação — unidades
// ==========================================================

test('a timeline ordena por data e mantém os sem data ao fim', () => {
  const base = buildContract(contrato(), {});
  const eventos = [
    buildAdditiveEvent(aditivo({ NumeroTermoAditivo: '002', Vigencia: '10/06/2019 a 10/09/2019' }), base, 2),
    buildAdditiveEvent(aditivo({ NumeroTermoAditivo: '001', Vigencia: '19/02/2019 a 19/05/2019' }), base, 1),
    buildAdditiveEvent(aditivo({ NumeroTermoAditivo: '003', Vigencia: '' }), base, 3),
  ];
  const timeline = buildTimeline(eventos);

  assert.deepEqual(timeline.events.map((event) => event.numeroTermoAditivo), ['001', '002', '003']);
  assert.equal(timeline.ordering, TIMELINE_ORDERING.PARTIAL);
  assert.equal(timeline.eventosSemData, 1);
});

test('a deduplicação não confunde aditivos distintos com repetição', () => {
  const base = buildContract(contrato(), {});
  const eventos = dedupeEvents([
    buildAdditiveEvent(aditivo({ NumeroTermoAditivo: '001' }), base, 1),
    buildAdditiveEvent(aditivo({ NumeroTermoAditivo: '001' }), base, 2),
    buildAdditiveEvent(aditivo({ NumeroTermoAditivo: '002', ObjetoAditivo: '3.128 URBANIZAÇÃO' }), base, 3),
  ]);

  assert.equal(eventos.length, 2, 'objeto textual igual não torna dois termos o mesmo termo');
  assert.equal(eventos[0].duplicatesMerged, 1);
});

test('a associação de aditivo usa código oficial e cai para chave composta', () => {
  const contratos = [buildContract(contrato(), {})];

  const porCodigo = associateAdditive(aditivo(), contratos);
  assert.equal(porCodigo.confidence, ASSOCIATION_CONFIDENCE.CONFIRMED);

  const porChave = associateAdditive(aditivo({ CodigoContrato: '' }), contratos);
  assert.equal(porChave.confidence, ASSOCIATION_CONFIDENCE.PROBABLE);
  assert.match(porChave.basis, /Número, ano e unidade gestora/i);
});

test('a análise não faz nenhuma chamada de rede', async () => {
  const originalFetch = global.fetch;
  let chamadas = 0;
  global.fetch = async () => { chamadas += 1; throw new Error('rede não permitida nesta camada'); };
  try {
    ContractIntelligenceService.analyze(tceResult({ contratos: [contrato()], aditivos: [aditivo()] }));
    assert.equal(chamadas, 0, 'Contract Intelligence opera sobre dados já coletados');
  } finally {
    global.fetch = originalFetch;
  }
});

test('entrada vazia produz resultado válido sem inventar contrato', () => {
  const resultado = ContractIntelligenceService.analyze({});

  assert.deepEqual(resultado.contratos, []);
  assert.deepEqual(resultado.aditivosOrfaos, []);
  assert.equal(resultado.resumo.contratos, 0);
  assert.ok(resultado.limitacao);
});
