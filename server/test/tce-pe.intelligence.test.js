const test = require('node:test');
const assert = require('node:assert/strict');

const { TcePeIntelligenceService, TCE_PROVIDERS } = require('../src/services/tce-pe/tce-pe.intelligence');
const { clearCache } = require('../src/services/tce-pe/tce-pe.client');
const {
  normalizeContract,
  normalizeAdditive,
  normalizeBid,
  normalizeExpense,
  dedupeRecords,
  dedupeKey,
} = require('../src/services/tce-pe/tce-pe.adapters');
const { buildEntityProfile } = require('../src/entity-resolution/entity-resolution');
const { RELATIONSHIP_TYPE } = require('../src/domain/relationship-type');
const { SOURCE_STATUS } = require('../src/domain/source-status');

// Caso real. As fixtures reproduzem a forma exata das respostas do TCE-PE,
// inclusive o preenchimento com espaços em `NumeroDocumentoAjustado` e os "?"
// no lugar dos acentos em `JustificativaTermoAditivo`.
const GUERRA = {
  cnpj: '10.811.370/0001-62',
  razaoSocial: 'GUERRA CONSTRUCOES LTDA',
  municipio: 'Recife',
  uf: 'PE',
};
const profile = buildEntityProfile(GUERRA);

const CONTRATO_REAL = {
  CodigoEfiscoUG: '560101',
  TipoProcesso: 'Lei 13.303/2016 - Dispensa',
  NumeroDocumentoAjustado: '10811370000162                ',
  RazaoSocial: 'Guerra Construções Ltda',
  CPF_CNPJ: '10811370000162    ',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/audinArquivos/licon/contrato/782/LICON_Contrato_782_2018_069.pdf',
  Situacao: 'Regular',
  SiglaUG: 'ADEPE',
  Objeto: '2.010 MANUTENÇÃO E CONSERVAÇÃO DE BENS IMÓVEIS',
  Valor: '94182.70',
  UnidadeOrcamentaria: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
  CodigoUG: '782',
  NumeroProcesso: '54',
  UnidadeGestora: 'Agência de Desenvolvimento Econômico de Pernambuco S/A',
  CodigoContrato: '437869',
  AnoContrato: '2018',
  Vigencia: '18/12/2018 a 18/02/2019',
  Estagio: 'Em Execução',
  CodigoPL: '203515',
  NumeroDocumento: '10.811.370/0001-62',
  Municipio: 'Recife',
  TipoDocumento: 'CNPJ',
  NumeroContrato: '069',
  Esfera: 'E ',
  AnoProcesso: '2018',
};

const ADITIVO_REAL = {
  CodigoContrato: '398293',
  NumeroDocumentoAjustado: '10811370000162                ',
  RazaoSocial: 'Guerra Construções Ltda',
  AnoContrato: '2019',
  CPF_CNPJ: '10.811.370/0001-62',
  LinkArquivo: 'http://sistemas.tcepe.tc.br/audinArquivos/licon/contrato/termoAditivo/1655/LICON.pdf',
  NumeroTermoAditivo: '001',
  Vigencia: '13/02/2019 a 09/01/2020',
  Situacao: 'Regular',
  SiglaUG: 'EMLURB',
  Estagio: 'Em Execução',
  Municipio: 'Recife',
  ObjetoAditivo: '3.128 URBANIZAÇÃO',
  JustificativaTermoAditivo: '1? termo de acr?scimo de valor quantitativo ',
  CodigoUG: '1655',
  ValorTermoAditivo: '999134.1800',
  UnidadeGestora: 'Autarquia de Manutenção e Limpeza Urbana do Recife',
  AnoTermoAditivo: '2019',
  NumeroContrato: '6008',
  Esfera: 'M ',
};

// Homônima do Maranhão: mesmo nome empresarial, outro CNPJ.
const CONTRATO_HOMONIMO = {
  ...CONTRATO_REAL,
  CodigoContrato: '999999',
  NumeroContrato: '070',
  NumeroDocumentoAjustado: '63314254000108',
  CPF_CNPJ: '63314254000108',
  RazaoSocial: 'GUERRA CONSTRUCOES LTDA - MA',
  Municipio: 'São Luís',
  Esfera: 'M ',
};

function apiResponse(conteudo) {
  const corpo = JSON.stringify({ resposta: { status: 'OK', conteudo, tamanhoResultado: conteudo.length } });
  const bytes = Buffer.from(corpo, 'latin1');
  return {
    ok: true,
    status: 200,
    headers: { get: (nome) => (String(nome).toLowerCase() === 'content-type' ? 'application/json;charset=ISO-8859-1' : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

/** Mock por método, com vazio como padrão para os não declarados. */
function mockApi(porMetodo) {
  return async (url) => {
    const address = String(url);
    for (const [metodo, conteudo] of Object.entries(porMetodo)) {
      if (address.includes(`/${metodo}!json`)) {
        return typeof conteudo === 'function' ? conteudo(address) : apiResponse(conteudo);
      }
    }
    return apiResponse([]);
  };
}

async function comApi(porMetodo, executar) {
  clearCache();
  const originalFetch = global.fetch;
  global.fetch = mockApi(porMetodo);
  try {
    return await executar();
  } finally {
    global.fetch = originalFetch;
  }
}

// ==========================================================
// Normalização
// ==========================================================

test('contrato real é normalizado com todos os campos exigidos', () => {
  const contrato = normalizeContract(CONTRATO_REAL, profile, { params: { NumeroDocumentoAjustado: '10811370000162' } });

  assert.equal(contrato.numeroContrato, '069');
  assert.equal(contrato.anoContrato, '2018');
  assert.equal(contrato.codigoContrato, '437869');
  assert.equal(contrato.codigoPL, '203515');
  assert.equal(contrato.unidadeGestora, 'Agência de Desenvolvimento Econômico de Pernambuco S/A');
  assert.equal(contrato.esfera, 'E');
  assert.equal(contrato.esferaNome, 'Estadual');
  assert.equal(contrato.municipio, 'Recife');
  // O preenchimento com espaços da fonte não pode vazar para o dossiê.
  assert.equal(contrato.cpfCnpjNormalizado, '10811370000162');
  assert.equal(contrato.cpfCnpj, '10.811.370/0001-62');
  assert.equal(contrato.valor, 94182.7);
  assert.equal(contrato.vigenciaInicio, '18/12/2018');
  assert.equal(contrato.vigenciaFim, '18/02/2019');
  assert.equal(contrato.estagio, 'Em Execução');
  assert.equal(contrato.situacao, 'Regular');
  assert.equal(contrato.tipoProcesso, 'Lei 13.303/2016 - Dispensa');
  assert.equal(contrato.anoProcesso, '2018');
  // Rastreabilidade até o documento oficial, sempre em HTTPS.
  assert.match(contrato.linkArquivo, /^https:\/\//);
  assert.equal(contrato.source, 'TCE-PE — Dados Abertos');
  assert.equal(contrato.endpoint, 'Contratos');
  assert.ok(contrato.sourceUrl);
  assert.ok(contrato.retrievedAt);
  // O bruto é preservado: normalização é interpretação e precisa ser conferível.
  assert.equal(contrato.raw, CONTRATO_REAL);
});

test('aditivo preserva valor e justificativa sem interpretá-los', () => {
  const aditivo = normalizeAdditive(ADITIVO_REAL, profile, {});

  assert.equal(aditivo.numeroTermoAditivo, '001');
  assert.equal(aditivo.anoTermoAditivo, '2019');
  assert.equal(aditivo.numeroContrato, '6008');
  assert.equal(aditivo.codigoContrato, '398293');
  assert.equal(aditivo.valorTermoAditivo, 999134.18);
  // O "?" corrompido na origem é preservado tal como publicado.
  assert.match(aditivo.justificativaTermoAditivo, /acr\?scimo/);
  assert.equal(aditivo.esfera, 'M');
  // Nenhum campo derivado de análise: sem percentual, sem alerta, sem juízo.
  assert.equal(aditivo.percentual, undefined);
  assert.equal(aditivo.irregular, undefined);
  assert.equal(aditivo.risco, undefined);
});

test('valor negativo de aditivo é preservado com o sinal da fonte', () => {
  const aditivo = normalizeAdditive({ ...ADITIVO_REAL, ValorTermoAditivo: '-3225.5900' }, profile, {});
  assert.equal(aditivo.valorTermoAditivo, -3225.59);
});

test('aditivo sem valor não vira zero', () => {
  const aditivo = normalizeAdditive({ ...ADITIVO_REAL, ValorTermoAditivo: undefined }, profile, {});
  assert.equal(aditivo.valorTermoAditivo, null, 'ausência de valor não é valor zero');
});

test('despesa mantém empenhado, liquidado e pago separados', () => {
  const despesa = normalizeExpense({
    CPF_CNPJ: '10811370000162',
    NOMEUNIDADEGESTORA: 'Autarquia de Urbanização do Recife',
    VALOREMPENHADO: '676096.32',
    VALORLIQUIDADO: '676096.32',
    VALORPAGO: '0.00',
    NUMEROEMPENHO: '123',
    ID_EMPENHO: 'E-1',
    ANOREFERENCIA: '2023',
    FORNECEDOR: 'Guerra Construções Ltda',
  }, profile, { method: 'DespesasMunicipais' });

  assert.equal(despesa.valorEmpenhado, 676096.32);
  assert.equal(despesa.valorLiquidado, 676096.32);
  assert.equal(despesa.valorPago, 0);
  assert.equal(despesa.esfera, 'M');
  // Nenhum total consolidado: somar os três contaria o mesmo dinheiro três vezes.
  assert.equal(despesa.valorTotal, undefined);
});

// ==========================================================
// Identidade
// ==========================================================

test('CNPJ exato no campo estruturado é CONFIRMED e CONTRACTOR', () => {
  const contrato = normalizeContract(CONTRATO_REAL, profile, {});
  assert.equal(contrato.entityMatch.level, 'CONFIRMED');
  assert.equal(contrato.relationshipType, RELATIONSHIP_TYPE.CONTRACTOR);
  assert.equal(contrato.entityMatch.matched.cnpj, true);
});

test('CNPJ formatado na fonte é reconhecido igual ao sem formatação', () => {
  const comPontuacao = normalizeAdditive(ADITIVO_REAL, profile, {});
  const semPontuacao = normalizeAdditive(
    { ...ADITIVO_REAL, NumeroDocumentoAjustado: '10811370000162', CPF_CNPJ: '10811370000162' },
    profile,
    {},
  );
  assert.equal(comPontuacao.entityMatch.level, 'CONFIRMED');
  assert.equal(semPontuacao.entityMatch.level, 'CONFIRMED');
});

test('homônima de outro estado permanece separada da empresa de Pernambuco', () => {
  const homonimo = normalizeContract(CONTRATO_HOMONIMO, profile, {});

  assert.equal(homonimo.entityMatch.level, 'FALSE_POSITIVE');
  assert.equal(homonimo.relationshipType, RELATIONSHIP_TYPE.FALSE_POSITIVE);
  assert.match(homonimo.entityMatch.basis, /outro CPF\/CNPJ/i);
  // Nome idêntico não transfere titularidade: o documento é que decide.
  assert.match(homonimo.razaoSocial, /GUERRA CONSTRUCOES/);
});

test('registro sem documento cai na resolução nominal, e palavra solta é descartada', () => {
  const semDocumento = normalizeContract(
    { ...CONTRATO_REAL, NumeroDocumentoAjustado: '', CPF_CNPJ: '', NumeroDocumento: '', RazaoSocial: '', Objeto: 'guerra fiscal entre municípios', UnidadeGestora: '', Municipio: '' },
    profile,
    {},
  );
  assert.equal(semDocumento.entityMatch.level, 'FALSE_POSITIVE');
  assert.equal(semDocumento.relationshipType, RELATIONSHIP_TYPE.FALSE_POSITIVE);
});

test('licitante adjudicado é CONTRACTOR; licitante não adjudicado é PARTY', () => {
  const base = {
    NUMERODOCUMENTOAJUSTADO: '10811370000162',
    RAZAOSOCIAL: 'Guerra Construções Ltda',
    CODIGOPL: '203515',
    NUMEROPROCESSO: '54',
    ANOPROCESSO: '2018',
    CODIGOUG: '782',
    UG: 'ADEPE',
    NOMEMODALIDADE: 'Pregão Eletrônico',
    DESCRICAOOBJETO: 'Manutenção predial',
  };
  const vencedor = normalizeBid({ ...base, ADJUDICADA: 'Sim', TOTALADJUDICADOLICITANTE: '94182.70' }, profile, {});
  const participante = normalizeBid({ ...base, ADJUDICADA: 'Não', TOTALADJUDICADOLICITANTE: '0' }, profile, {});

  assert.equal(vencedor.relationshipType, RELATIONSHIP_TYPE.CONTRACTOR);
  assert.equal(vencedor.valorAdjudicadoLicitante, 94182.7);
  // Participar de certame não é vencer certame.
  assert.equal(participante.relationshipType, RELATIONSHIP_TYPE.PARTY);
});

// ==========================================================
// Deduplicação
// ==========================================================

test('o mesmo contrato repetido pela fonte é deduplicado pelo código oficial', () => {
  const registros = [
    normalizeContract(CONTRATO_REAL, profile, {}),
    normalizeContract(CONTRATO_REAL, profile, {}),
  ];
  const unicos = dedupeRecords(registros);

  assert.equal(unicos.length, 1);
  assert.equal(unicos[0].duplicatesMerged, 1);
  assert.equal(dedupeKey(registros[0]), 'CONTRATO:437869');
});

test('aditivos distintos do mesmo contrato continuam sendo registros distintos', () => {
  const registros = [
    normalizeAdditive(ADITIVO_REAL, profile, {}),
    normalizeAdditive({ ...ADITIVO_REAL, NumeroTermoAditivo: '002' }, profile, {}),
    normalizeAdditive({ ...ADITIVO_REAL, NumeroTermoAditivo: '003' }, profile, {}),
  ];
  const unicos = dedupeRecords(registros);

  assert.equal(unicos.length, 3, 'três termos aditivos são três fatos, não um repetido');
});

test('contratos diferentes da mesma empresa não colapsam', () => {
  const registros = [
    normalizeContract(CONTRATO_REAL, profile, {}),
    normalizeContract({ ...CONTRATO_REAL, CodigoContrato: '437870', NumeroContrato: '070' }, profile, {}),
  ];
  assert.equal(dedupeRecords(registros).length, 2, 'a deduplicação nunca pode ser por nome');
});

// ==========================================================
// Coleta e Source Status
// ==========================================================

test('CNPJ com contratos produz SUCCESS e evidência rastreável', async () => {
  const resultado = await comApi(
    { Contratos: [CONTRATO_REAL], TermoAditivo: [ADITIVO_REAL] },
    () => TcePeIntelligenceService.collect(GUERRA),
  );

  assert.equal(resultado.ok, true);
  assert.equal(resultado.resumo.contratos, 1);
  assert.equal(resultado.resumo.aditivos, 1);

  const contratos = resultado.providers.find((item) => item.provider === 'tce-pe-contratos');
  assert.equal(contratos.status, SOURCE_STATUS.SUCCESS);
  assert.equal(contratos.quantidade, 1);
  assert.equal(contratos.endpoint, 'Contratos');
  assert.ok(contratos.queriesExecutadas.length > 0);
  assert.ok(contratos.retrievedAt);
  assert.equal(resultado.contratos[0].entityMatch.level, 'CONFIRMED');
});

test('CNPJ consultado sem nenhum contrato é EMPTY, nunca ausência afirmada', async () => {
  const resultado = await comApi({}, () => TcePeIntelligenceService.collect(GUERRA));

  const contratos = resultado.providers.find((item) => item.provider === 'tce-pe-contratos');
  assert.equal(contratos.status, SOURCE_STATUS.EMPTY);
  assert.equal(contratos.quantidade, 0);
  // A formulação não pode afirmar que a empresa não tem contratos.
  assert.match(resultado.limitacao, /não foram encontrados registros na consulta realizada/i);
  assert.equal(resultado.ok, true, 'consultar e não achar nada é sucesso da consulta');
});

test('múltiplos contratos são todos coletados', async () => {
  const muitos = Array.from({ length: 27 }, (_, index) => ({
    ...CONTRATO_REAL,
    CodigoContrato: String(400000 + index),
    NumeroContrato: String(index).padStart(3, '0'),
  }));
  const resultado = await comApi({ Contratos: muitos }, () => TcePeIntelligenceService.collect(GUERRA));

  assert.equal(resultado.resumo.contratos, 27);
  assert.equal(
    resultado.providers.find((item) => item.provider === 'tce-pe-contratos').status,
    SOURCE_STATUS.SUCCESS,
  );
});

test('contrato aponta para o processo licitatório pelo código oficial', async () => {
  const resultado = await comApi({ Contratos: [CONTRATO_REAL] }, () => TcePeIntelligenceService.collect(GUERRA));
  // CodigoPL é a chave que liga contrato e licitação nos dados abertos.
  assert.equal(resultado.contratos[0].codigoPL, '203515');
  assert.equal(resultado.contratos[0].numeroProcesso, '54');
});

test('CNPJ divergente é descartado e permanece auditável', async () => {
  const resultado = await comApi(
    { Contratos: [CONTRATO_REAL, CONTRATO_HOMONIMO] },
    () => TcePeIntelligenceService.collect(GUERRA),
  );

  assert.equal(resultado.resumo.contratos, 1, 'só o contrato do CNPJ investigado permanece');
  assert.equal(resultado.resumo.descartados, 1);
  const descartado = resultado.descartados.find((item) => item.provider === 'tce-pe-contratos');
  assert.ok(descartado, 'o descarte precisa ser consultável');
  assert.equal(descartado.level, 'FALSE_POSITIVE');
  assert.match(descartado.basis, /outro CPF\/CNPJ/i);
});

test('timeout vira UNAVAILABLE, e não zero registros', async () => {
  clearCache();
  const originalFetch = global.fetch;
  global.fetch = async () => { const error = new Error('The operation was aborted'); error.name = 'AbortError'; throw error; };
  try {
    const resultado = await TcePeIntelligenceService.collect(GUERRA);
    const contratos = resultado.providers.find((item) => item.provider === 'tce-pe-contratos');
    assert.equal(contratos.status, SOURCE_STATUS.UNAVAILABLE);
    assert.ok(contratos.erros.length > 0, 'a falha não pode ser escondida');
    assert.equal(resultado.ok, false);
    assert.equal(resultado.sourceStatus, SOURCE_STATUS.UNAVAILABLE);
  } finally {
    global.fetch = originalFetch;
  }
});

test('erro HTTP vira ERROR e fica registrado no provider', async () => {
  clearCache();
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });
  try {
    const resultado = await TcePeIntelligenceService.collect(GUERRA);
    const contratos = resultado.providers.find((item) => item.provider === 'tce-pe-contratos');
    // 500 é instabilidade da fonte: não foi possível consultar.
    assert.equal(contratos.status, SOURCE_STATUS.UNAVAILABLE);
    assert.match(contratos.erros[0], /HTTP 500/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('resposta estruturalmente inválida vira ERROR, nunca lista vazia', async () => {
  clearCache();
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const bytes = Buffer.from(JSON.stringify({ resposta: { status: 'ERRO' } }), 'latin1');
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json;charset=ISO-8859-1' },
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  try {
    const resultado = await TcePeIntelligenceService.collect(GUERRA);
    const contratos = resultado.providers.find((item) => item.provider === 'tce-pe-contratos');
    assert.equal(contratos.status, SOURCE_STATUS.ERROR);
    assert.match(contratos.erros[0], /formato inválido/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('falha parcial preserva os providers que responderam', async () => {
  clearCache();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const address = String(url);
    if (address.includes('/TermoAditivo!json')) throw new Error('ECONNRESET');
    if (address.includes('/Contratos!json')) return apiResponse([CONTRATO_REAL]);
    return apiResponse([]);
  };
  try {
    const resultado = await TcePeIntelligenceService.collect(GUERRA);

    assert.equal(resultado.ok, true, 'a falha de um provider não invalida os demais');
    assert.equal(resultado.sourceStatus, SOURCE_STATUS.PARTIAL);
    assert.equal(resultado.resumo.contratos, 1);
    assert.equal(
      resultado.providers.find((item) => item.provider === 'tce-pe-aditivos').status,
      SOURCE_STATUS.UNAVAILABLE,
    );
    assert.equal(resultado.resumo.providersIndisponiveis, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sem CNPJ os datasets não se aplicam', async () => {
  const resultado = await TcePeIntelligenceService.collect({ razaoSocial: 'GUERRA CONSTRUCOES LTDA' });

  assert.equal(resultado.sourceStatus, SOURCE_STATUS.NOT_APPLICABLE);
  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /filtram por CPF\/CNPJ/i);
  assert.match(resultado.limitacao, /não significa ausência de registros/i);
});

// ==========================================================
// Obras
// ==========================================================

test('obra vinculada por CNPJ é enriquecida com a ficha oficial', async () => {
  const resultado = await comApi({
    ObrasDadosContratacao: [{ Obra: '304', Pessoa: 'Guerra Construções Ltda', CPFCNPJ: '10811370000162', Municipio: 'Recife' }],
    Obras: [{ Codigo: '304', Titulo: 'Restauração de rodovia', Municipio: 'Recife', UG: 'DER-PE', Prazo: '720', PrazoAditado: '553' }],
  }, () => TcePeIntelligenceService.collect(GUERRA));

  assert.equal(resultado.resumo.obrasContratacao, 1);
  assert.equal(resultado.resumo.obras, 1);
  assert.equal(resultado.obras[0].codigoObra, '304');
  // Prazo original e aditado preservados lado a lado, sem comparação derivada.
  assert.equal(resultado.obras[0].prazo, 720);
  assert.equal(resultado.obras[0].prazoAditado, 553);
  assert.equal(resultado.obras[0].obraParalisada, undefined, 'a fonte não afirma paralisação');
});

test('zero obras é EMPTY e não afirma que a empresa não tem obras', async () => {
  const resultado = await comApi({}, () => TcePeIntelligenceService.collect(GUERRA));
  const obras = resultado.providers.find((item) => item.provider === 'tce-pe-obras');

  assert.equal(obras.status, SOURCE_STATUS.EMPTY);
  assert.equal(obras.quantidade, 0);
  assert.equal(obras.erros.length, 0, 'zero registros não é erro');
});

// ==========================================================
// Truncamento e matriz
// ==========================================================

test('resposta acima do teto local é PARTIAL, com o truncamento declarado', async () => {
  const muitas = Array.from({ length: 600 }, (_, index) => ({
    ...CONTRATO_REAL,
    CodigoContrato: String(500000 + index),
  }));
  const resultado = await comApi({ Contratos: muitas }, () => TcePeIntelligenceService.collect(GUERRA));
  const contratos = resultado.providers.find((item) => item.provider === 'tce-pe-contratos');

  assert.equal(contratos.status, SOURCE_STATUS.PARTIAL);
  assert.equal(contratos.truncado, true);
  assert.equal(contratos.totalLinhasNaFonte, 600);
  assert.match(contratos.warnings[0], /cobertura desta consulta está incompleta/i);
});

test('a matriz de pesquisa é consumida e declarada sem execução', async () => {
  const resultado = await comApi({ Contratos: [CONTRATO_REAL] }, () => TcePeIntelligenceService.collect(GUERRA));

  assert.ok(resultado.matrizDePesquisa.planejadas > 0, 'a matriz precisa alimentar esta camada');
  // Planejar não é consultar: o estado permanece PLANNED.
  assert.equal(
    resultado.matrizDePesquisa.consultas.every((item) => item.status === 'PLANNED'),
    true,
  );
  assert.ok(resultado.matrizDePesquisa.consultas.every((item) => item.reason));
});

test('cada provider declara endpoint, categoria e parâmetro documentado', () => {
  for (const descriptor of Object.values(TCE_PROVIDERS)) {
    assert.ok(descriptor.id.startsWith('tce-pe-'));
    assert.ok(descriptor.method, 'todo provider aponta para um método oficial');
    assert.ok(descriptor.cnpjParam, 'o nome do parâmetro varia entre datasets e precisa ser explícito');
    assert.equal(typeof descriptor.normalize, 'function');
  }
});
