const test = require('node:test');
const assert = require('node:assert/strict');

const { projectForDossier, stripRaw, cap } = require('../src/document-intelligence/dossier-projection');
const { ContractIntelligenceService } = require('../src/contract-intelligence/contract-intelligence.service');
const { DocumentIntelligenceService } = require('../src/document-intelligence/document-intelligence.service');
const { normalizeContract, normalizeAdditive } = require('../src/services/tce-pe/tce-pe.adapters');
const { buildEntityProfile } = require('../src/entity-resolution/entity-resolution');

const GUERRA = { cnpj: '10.811.370/0001-62', razaoSocial: 'GUERRA CONSTRUCOES LTDA', municipio: 'Recife', uf: 'PE' };
const profile = buildEntityProfile(GUERRA);

const contrato = (n) => normalizeContract({
  CodigoContrato: String(400000 + n),
  NumeroContrato: String(n).padStart(3, '0'),
  AnoContrato: '2024',
  CodigoPL: '203515',
  UnidadeGestora: 'ADEPE',
  CodigoUG: '782',
  Esfera: 'E ',
  Municipio: 'Recife',
  NumeroDocumentoAjustado: '10811370000162',
  RazaoSocial: 'Guerra Construções Ltda',
  Objeto: 'Obra de urbanização',
  Vigencia: '19/03/2024 a 19/12/2024',
  Valor: '798881.01',
  Situacao: 'Regular',
  LinkArquivo: `http://sistemas.tcepe.tc.br/licon/contrato/782/C_${n}.pdf`,
}, profile, { params: { NumeroDocumentoAjustado: '10811370000162' } });

const aditivo = (contratoNum, termo) => normalizeAdditive({
  CodigoContrato: String(400000 + contratoNum),
  NumeroContrato: String(contratoNum).padStart(3, '0'),
  AnoContrato: '2024',
  NumeroTermoAditivo: String(termo).padStart(3, '0'),
  AnoTermoAditivo: '2024',
  ValorTermoAditivo: '301312.26',
  Vigencia: '10/06/2024 a 10/09/2024',
  ObjetoAditivo: 'Obra',
  JustificativaTermoAditivo: 'acr?scimo quantitativo',
  NumeroDocumentoAjustado: '10811370000162',
  UnidadeGestora: 'ADEPE',
  CodigoUG: '782',
  Esfera: 'E ',
  LinkArquivo: `http://sistemas.tcepe.tc.br/licon/ta/782/TA_${contratoNum}_${termo}.pdf`,
}, profile, { params: {} });

/** Carteira grande, como a de uma empresa realmente ativa. */
async function carteira(quantosContratos, aditivosPorContrato) {
  const contratos = Array.from({ length: quantosContratos }, (_, i) => contrato(i));
  const aditivos = contratos.flatMap((_, i) => (
    Array.from({ length: aditivosPorContrato }, (__, t) => aditivo(i, t + 1))
  ));
  const tceResult = {
    ok: true,
    sourceStatus: 'SUCCESS',
    entity: { entityId: profile.entityId, cnpj: profile.cnpj, razaoSocial: profile.razaoSocial, uf: 'PE' },
    contratos,
    aditivos,
    licitacoes: [],
    despesas: [],
    obras: [],
    descartados: [],
    providers: [
      { provider: 'tce-pe-contratos', status: 'SUCCESS', quantidade: contratos.length, erros: [], warnings: [] },
      { provider: 'tce-pe-aditivos', status: 'SUCCESS', quantidade: aditivos.length, erros: [], warnings: [] },
      { provider: 'tce-pe-obras', status: 'EMPTY', quantidade: 0, erros: [], warnings: [] },
      { provider: 'tce-pe-despesas-municipais', status: 'UNAVAILABLE', quantidade: 0, erros: ['timeout'], warnings: [] },
    ],
    resumo: { contratos: contratos.length, aditivos: aditivos.length, descartados: 0, providersIndisponiveis: 1 },
    limitacao: 'limitação original da coleta',
  };
  const contractIntelligence = ContractIntelligenceService.analyze(tceResult);
  const documentIntelligence = await DocumentIntelligenceService.collect({ tceResult, contractIntelligence });
  return { tceResult, contractIntelligence, documentIntelligence };
}

const megabytes = (obj) => Buffer.byteLength(JSON.stringify(obj), 'utf8') / 1024 / 1024;

// ==========================================================

test('a projeção cabe no limite de corpo do Express', async () => {
  const coleta = await carteira(96, 3);
  const completo = megabytes(coleta);
  const projetado = megabytes(projectForDossier(coleta));

  assert.ok(completo > 4, `a coleta completa mede ${completo.toFixed(2)} MB e é o motivo desta camada existir`);
  assert.ok(projetado < 4, `a projeção mede ${projetado.toFixed(2)} MB e precisa caber no limite de 4 MB`);
});

test('o registro bruto é removido, e a consulta que o reproduz é preservada', async () => {
  const projecao = projectForDossier(await carteira(3, 2));
  const serializado = JSON.stringify(projecao);

  assert.equal(serializado.includes('"raw"'), false, 'nenhum bruto sobrevive à projeção');
  assert.equal(projecao.projecao.rawRemovido, true);

  // O que permite reproduzir a consulta continua no dossiê.
  const [perfil] = projecao.contractIntelligence.contratos;
  assert.ok(perfil.contrato.endpoint, 'o endpoint precisa sobreviver');
  assert.ok(perfil.contrato.query, 'a consulta precisa sobreviver');
  assert.ok(perfil.contrato.sourceUrl);
  assert.ok(perfil.contrato.linkArquivo, 'o link do documento oficial precisa sobreviver');
});

test('o que foi truncado é declarado, com o total real', async () => {
  const projecao = projectForDossier(await carteira(96, 2));

  assert.equal(projecao.contractIntelligence.contratosTotal, 96, 'o total real nunca é escondido');
  assert.ok(projecao.contractIntelligence.contratos.length < 96);
  assert.ok(projecao.contractIntelligence.contratosOmitidos > 0);
  assert.ok(
    projecao.projecao.omissoes.some((nota) => /\d+ de 96 contratos/.test(nota)),
    'a omissão precisa ser dita em número, não insinuada',
  );
});

test('aditivos truncados dentro de um contrato também são declarados', async () => {
  const projecao = projectForDossier(await carteira(1, 45));
  const [perfil] = projecao.contractIntelligence.contratos;

  assert.equal(perfil.aditivosTotal, 45);
  assert.ok(perfil.aditivos.length < 45);
  assert.equal(perfil.aditivosOmitidos, 45 - perfil.aditivos.length);
});

test('contagens e estado por fonte nunca são truncados', async () => {
  const projecao = projectForDossier(await carteira(96, 3));

  // Os providers são o que separa "não há" de "não sei". Nenhum pode sumir.
  assert.equal(projecao.providers.length, 4);
  assert.equal(projecao.providers.find((p) => p.provider === 'tce-pe-obras').status, 'EMPTY');
  assert.equal(projecao.providers.find((p) => p.provider === 'tce-pe-despesas-municipais').status, 'UNAVAILABLE');
  assert.equal(projecao.resumo.contratos, 96, 'a contagem é a da coleta, não a do recorte');
  assert.equal(projecao.contractIntelligence.resumo.contratos, 96);
});

test('EMPTY e UNAVAILABLE continuam distintos depois da projeção', async () => {
  const projecao = projectForDossier(await carteira(2, 1));
  const obras = projecao.providers.find((p) => p.provider === 'tce-pe-obras');
  const despesas = projecao.providers.find((p) => p.provider === 'tce-pe-despesas-municipais');

  assert.notEqual(obras.status, despesas.status);
  assert.equal(despesas.erros[0], 'timeout', 'o erro que explica a lacuna precisa sobreviver');
});

test('a linha do tempo sobrevive com a precisão e a origem das datas', async () => {
  const projecao = projectForDossier(await carteira(1, 2));
  const [perfil] = projecao.contractIntelligence.contratos;

  assert.ok(perfil.timelineDetalhada, 'a UI e o tipo esperam este nome de campo');
  assert.ok(perfil.timelineDetalhada.entries.length > 0);
  for (const entrada of perfil.timelineDetalhada.entries) {
    assert.ok(entrada.datePrecision, 'a precisão da data não pode ser perdida no recorte');
  }
  assert.match(perfil.timelineDetalhada.limitacao, /não publica data de assinatura/i);
});

test('a projeção declara que é um recorte', async () => {
  const projecao = projectForDossier(await carteira(96, 3));

  assert.equal(projecao.projecao.aplicada, true);
  assert.match(projecao.projecao.nota, /projeção da coleta/i);
  assert.match(projecao.projecao.nota, /reproduzir a consulta original/i);
});

test('carteira pequena não sofre truncamento nem inventa omissão', async () => {
  const projecao = projectForDossier(await carteira(2, 2));

  assert.equal(projecao.contractIntelligence.contratosOmitidos, 0);
  assert.deepEqual(projecao.projecao.omissoes, []);
  assert.equal(projecao.contractIntelligence.contratos.length, 2);
});

test('entrada vazia produz projeção válida', () => {
  const projecao = projectForDossier({});

  assert.equal(projecao.ok, false);
  assert.deepEqual(projecao.providers, []);
  assert.deepEqual(projecao.contractIntelligence.contratos, []);
  assert.deepEqual(projecao.projecao.omissoes, []);
});

test('stripRaw e cap se comportam previsivelmente', () => {
  assert.deepEqual(stripRaw({ a: 1, raw: { grande: true }, b: { raw: 2, c: 3 } }), { a: 1, b: { c: 3 } });

  const corte = cap([1, 2, 3, 4, 5], 3);
  assert.deepEqual(corte.items, [1, 2, 3]);
  assert.equal(corte.total, 5);
  assert.equal(corte.omitidos, 2);

  const vazio = cap(undefined, 3);
  assert.deepEqual(vazio.items, []);
  assert.equal(vazio.omitidos, 0);
});
