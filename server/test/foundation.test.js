const test = require('node:test');
const assert = require('node:assert/strict');

const DatajudService = require('../src/services/datajud.service');
const { AdverseMediaService } = require('../src/services/adverse-media.service');
const { comparePerson } = require('../src/egos/entity-resolution/entity-resolution.service');
const { EgosGraphBuilder } = require('../src/egos/core/egos-graph-builder');
const { adaptReceita } = require('../src/egos/adapters/receita.adapter');
const { adaptCgu } = require('../src/egos/adapters/cgu.adapter');
const { adaptExternalResults } = require('../src/egos/adapters/external-results.adapter');
const { aggregateGovernanceRecords } = require('../src/services/cvm-governance.service');
const { DiligenceMappers } = require('../src/repositories/diligence-mappers');

test('gera IDs próprios para a mesma publicação em diligências diferentes', () => {
  const media = { results: [{ id: 'provider-result-1', title: 'Publicação', url: 'https://example.test/item' }] };
  const first = DiligenceMappers.mapAdverseMedia('diligence-one', media)[0];
  const second = DiligenceMappers.mapAdverseMedia('diligence-two', media)[0];

  assert.notEqual(first.id, second.id);
  assert.equal(first.rawData.id, 'provider-result-1');
  assert.equal(second.rawData.id, 'provider-result-1');
});

test('consolida diretores e acionistas por exercício sem inventar continuidade', () => {
  const years = [2022, 2023, 2024, 2025, 2026];
  const records = [
    { identityKey: 'ADMIN:123', id: 'a-2022', name: 'ANA DIRETORA', category: 'director', qualification: 'Diretora', year: 2022 },
    { identityKey: 'ADMIN:123', id: 'a-2023', name: 'ANA DIRETORA', category: 'director', qualification: 'Diretora', year: 2023 },
    { identityKey: 'SHAREHOLDER:456', id: 's-2026', name: 'ACIONISTA TESTE', category: 'shareholder', qualification: 'Acionista controlador', year: 2026, totalSharePercent: 51 },
  ];

  const members = aggregateGovernanceRecords(records, years);
  const formerDirector = members.find((member) => member.name === 'ANA DIRETORA');
  const currentShareholder = members.find((member) => member.name === 'ACIONISTA TESTE');

  assert.deepEqual(formerDirector.years, [2022, 2023]);
  assert.equal(formerDirector.presentInLatestExercise, false);
  assert.equal(currentShareholder.presentInLatestExercise, true);
  assert.equal(currentShareholder.latestSnapshot.totalSharePercent, 51);
});

test('valida numeração CNJ pelo dígito verificador', () => {
  assert.equal(DatajudService.validateCNJNumber('0000988-53.2019.8.17.2670'), true);
  assert.equal(DatajudService.validateCNJNumber('0000988-99.2019.8.17.2670'), false);
  assert.equal(DatajudService.validateCNJNumber('123'), false);
});

test('correlaciona CNPJ mesmo quando aparece formatado no texto', () => {
  const service = new AdverseMediaService({ isConfigured: () => false });
  const result = service.evaluateCorrelation(
    { cnpj: '12345678000190', razaoSocial: 'Empresa Exemplo' },
    'Publicação referente ao CNPJ 12.345.678/0001-90.'
  );

  assert.equal(result.companyMatch.cnpj, true);
  assert.equal(result.matchStrength, 'high');
});

test('pesquisa cada pessoa física do QSA sem misturar PEP com ocorrência pessoal', async () => {
  const provider = {
    isConfigured: () => true,
    searchWeb: async ({ query }) => ({
      ok: true,
      status: 200,
      provider: 'Provedor de teste',
      results: query.includes('RENATA FARIA RODRIGUES BARUZZI LOPES')
        ? [{
            title: 'Renata Faria Rodrigues Baruzzi Lopes é citada em investigação envolvendo a Petrobras',
            url: 'https://example.test/renata-investigacao',
            domain: 'example.test',
            snippet: 'A investigação menciona Renata Faria Rodrigues Baruzzi Lopes e a Petrobras.',
          }]
        : [],
    }),
  };
  const service = new AdverseMediaService(provider);
  const result = await service.searchAdverseMedia(
    { cnpj: '33000167000101', razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS', nomeFantasia: 'PETROBRAS' },
    [{
      nome_socio: 'RENATA FARIA RODRIGUES BARUZZI LOPES',
      qualificacao_socio: 'Diretora',
      cnpj_cpf_do_socio: '***944618**',
    }]
  );

  assert.equal(result.peopleSearched, 1);
  assert.equal(result.personSearchCompleted, true);
  assert.equal(result.personResultsCount, 1);
  assert.equal(result.results[0].subjectType, 'person');
  assert.equal(result.results[0].subjectName, 'RENATA FARIA RODRIGUES BARUZZI LOPES');
  assert.equal(result.results[0].personMatch.fullName, true);
  assert.equal(result.results[0].personMatch.companyContext, true);
  assert.equal(result.results[0].requiresHumanReview, true);
  assert.deepEqual(result.results[0].questionnaireRefs, ['5.2']);
});

test('EGOS não confirma identidade PEP apenas por coincidência nominal', () => {
  const resolution = comparePerson(
    { name: 'João Antônio de Souza' },
    { name: 'JOAO ANTONIO DE SOUZA', organization: 'Órgão Público' }
  );

  assert.equal(resolution.score, 68);
  assert.equal(resolution.status, 'POSSIBLE_MATCH');
  assert.equal(resolution.requiresHumanReview, true);
});

test('EGOS explica os 98 pontos e ainda exige validação humana', () => {
  const resolution = comparePerson(
    { name: 'Maria de Souza', maskedCpf: '***.123.456-**' },
    { name: 'MARIA DE SOUZA', maskedCpf: '***.123.456-**', organization: 'Órgão Público' }
  );

  assert.equal(resolution.score, 98);
  assert.equal(resolution.status, 'VERY_STRONG_MATCH');
  assert.equal(resolution.requiresHumanReview, true);
  assert.deepEqual(
    resolution.signals.map((signal) => ({ code: signal.code, matched: signal.matched, weight: signal.weight })),
    [
      { code: 'NAME_SIMILARITY', matched: true, weight: 68 },
      { code: 'MASKED_CPF', matched: true, weight: 30 },
    ]
  );
});

test('EGOS preserva o candidato PEP exato e os campos oficiais que sustentam a revisão', () => {
  const payload = {
    id: 'diligence-pep-exact',
    cnpj: '11222333000181',
    razaoSocial: 'EMPRESA DE TESTE',
    dataAnalise: '2026-08-24T10:00:00.000Z',
    companySource: 'BrasilAPI',
    empresa: {
      cnpj: '11222333000181',
      razao_social: 'EMPRESA DE TESTE',
      descricao_situacao_cadastral: 'ATIVA',
    },
    socios: [{
      nome_socio: 'Maria de Souza',
      qualificacao_socio: 'Administradora',
      cnpj_cpf_do_socio: '***.123.456-**',
    }],
    pepResults: [{
      nome: 'Maria de Souza',
      ok: true,
      fonte: 'Portal da Transparência (CGU / PEP)',
      registros: [{
        nome: 'MARIA DE SOUZA',
        cpf: '***.123.456-**',
        funcao: 'Diretora',
        orgao: 'Órgão Público de Teste',
        inicio: '01/01/2024',
        fim: '31/12/2025',
        carencia: '31/12/2030',
      }],
    }],
  };
  const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
  const context = adaptReceita(builder, payload);
  adaptCgu(builder, context, payload);
  const snapshot = builder.toSnapshot();
  const candidate = snapshot.entities.find((entity) => entity.role === 'pep_candidate');
  const resolution = snapshot.resolutions[0];
  const evidence = snapshot.evidences.find((item) => item.provider === 'EGOS_ENTITY_RESOLUTION');

  assert.equal(candidate.name, 'MARIA DE SOUZA');
  assert.equal(candidate.properties.publicRole, 'Diretora');
  assert.equal(candidate.properties.publicOrganization, 'Órgão Público de Teste');
  assert.equal(candidate.properties.pepCoolingOffEnd, '31/12/2030');
  assert.equal(candidate.properties.identityConfirmed, false);
  assert.equal(resolution.score, 98);
  assert.match(evidence.excerpt, /Candidato exato retornado: MARIA DE SOUZA/);
  assert.match(evidence.excerpt, /A identidade ainda não está confirmada/);
});

test('EGOS transforma CNPJ em entidades, relações, evidências e cobertura honesta', () => {
  const payload = {
    id: 'diligence-test',
    cnpj: '33000167000101',
    razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS',
    dataAnalise: '2026-08-21T10:00:00.000Z',
    companySource: 'BrasilAPI',
    empresa: {
      cnpj: '33000167000101',
      razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS',
      descricao_situacao_cadastral: 'ATIVA',
      municipio: 'RIO DE JANEIRO',
      uf: 'RJ',
    },
    socios: [{ nome_socio: 'Maria da Silva', qualificacao_socio: 'Administrador' }],
    ceis: { ok: true, fonte: 'CGU / CEIS', encontrado: false, quantidade: 0, registros: [] },
    cnep: { ok: true, fonte: 'CGU / CNEP', encontrado: false, quantidade: 0, registros: [] },
    pepResults: [{ nome: 'Maria da Silva', ok: true, encontrado: true, quantidade: 1, registros: [{ nome: 'MARIA DA SILVA', orgao: 'Órgão Público', funcao: 'Diretora' }] }],
    adverseMedia: { ok: false, semChave: true, results: [], aviso: 'Integração não configurada.' },
    processosDescobertos: [],
  };
  const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
  const context = adaptReceita(builder, payload);
  adaptCgu(builder, context, payload);
  adaptExternalResults(builder, context, payload);
  const snapshot = builder.toSnapshot();

  assert.ok(snapshot.entities.length >= 4);
  assert.ok(snapshot.relationships.length >= 2);
  assert.ok(snapshot.evidences.length >= 3);
  assert.equal(snapshot.coverage.find((item) => item.axis === 'MEDIA').status, 'UNAVAILABLE');
  assert.equal(snapshot.findings.some((item) => item.axis === 'PEP' && item.status === 'INCONCLUSIVE'), true);
});

test('EGOS distingue prestadores regulados do fundo de participação societária', () => {
  const payload = {
    id: 'diligence-fund-network',
    cnpj: '51033013000106',
    razaoSocial: 'SILVERBAY CAPITAL FUNDO DE INVESTIMENTO EM PARTICIPACOES MULTIESTRATEGIA',
    dataAnalise: '2026-08-24T10:00:00.000Z',
    companySource: 'BrasilAPI',
    empresa: {
      cnpj: '51033013000106',
      razao_social: 'SILVERBAY CAPITAL FUNDO DE INVESTIMENTO EM PARTICIPACOES MULTIESTRATEGIA',
      descricao_situacao_cadastral: 'ATIVA',
    },
    socios: [],
    pepResults: [],
    processosDescobertos: [],
    fundNetwork: {
      ok: true,
      applicable: true,
      provider: 'CVM — Cadastro de Fundos',
      directParties: 2,
      expandedCompanies: 1,
      consultaParcial: false,
      consultadoEm: '2026-08-24T10:00:00.000Z',
      entities: [
        {
          key: 'company:cnpj:51033013000106',
          type: 'InvestmentFund',
          name: 'SILVERBAY CAPITAL FIP MULTIESTRATEGIA',
          role: 'root',
          depth: 0,
          confidence: 100,
          properties: { fundType: 'FIP', netAssetValue: 12817383.81 },
        },
        {
          key: 'company:cnpj:57375598000110',
          type: 'Company',
          name: 'IDFIP ADMINISTRACAO FIDUCIARIA LTDA',
          role: 'fund_administrator',
          depth: 1,
          confidence: 100,
          properties: { cnpj: '57375598000110' },
        },
        {
          key: 'person:cvm-network:responsible',
          type: 'Person',
          name: 'RICARDO ALLEGRETTI MARINHO',
          role: 'fund_responsible_director',
          depth: 1,
          confidence: 100,
          properties: { position: 'Diretor responsável' },
        },
      ],
      relationships: [
        {
          key: 'fund-rel:administrator',
          sourceKey: 'company:cnpj:57375598000110',
          targetKey: 'company:cnpj:51033013000106',
          type: 'ADMINISTERS_FUND',
          label: 'Administra o fundo',
          status: 'CONFIRMED',
          confidence: 100,
          properties: { ownershipRelation: false },
        },
        {
          key: 'fund-rel:director',
          sourceKey: 'person:cvm-network:responsible',
          targetKey: 'company:cnpj:51033013000106',
          type: 'RESPONSIBLE_DIRECTOR_OF',
          label: 'Diretor responsável pelo fundo',
          status: 'CONFIRMED',
          confidence: 100,
          properties: {},
        },
      ],
      evidences: [{
        relationshipKey: 'fund-rel:administrator',
        provider: 'CVM_FUND_REGISTRY',
        sourceName: 'CVM — Cadastro de Fundos',
        excerpt: 'Vínculo regulatório; não implica participação societária.',
        confidence: 100,
        retrievedAt: '2026-08-24T10:00:00.000Z',
      }],
    },
  };
  const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
  const context = adaptReceita(builder, payload);
  adaptExternalResults(builder, context, payload);
  const snapshot = builder.toSnapshot();
  const root = snapshot.entities.find((entity) => entity.role === 'root');
  const administratorLink = snapshot.relationships.find((relationship) => relationship.type === 'ADMINISTERS_FUND');

  assert.equal(root.type, 'InvestmentFund');
  assert.equal(root.properties.registrationStatus, 'ATIVA');
  assert.equal(root.properties.fundType, 'FIP');
  assert.equal(administratorLink.properties.ownershipRelation, false);
  assert.equal(snapshot.relationships.some((relationship) => relationship.type === 'SHAREHOLDER_OF'), false);
  assert.equal(snapshot.coverage.find((item) => item.axis === 'FUND_RELATIONSHIPS').status, 'CONSULTED');
});

test('EGOS liga ocorrência nominal à pessoa do QSA e não à empresa-raiz', () => {
  const payload = {
    id: 'diligence-person-occurrence',
    cnpj: '33000167000101',
    razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS',
    dataAnalise: '2026-08-24T10:00:00.000Z',
    companySource: 'BrasilAPI',
    empresa: {
      cnpj: '33000167000101',
      razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS',
      descricao_situacao_cadastral: 'ATIVA',
    },
    socios: [{ nome_socio: 'Renata Faria Rodrigues Baruzzi Lopes', qualificacao_socio: 'Diretora' }],
    pepResults: [],
    adverseMedia: {
      ok: true,
      peopleSearched: 1,
      personResultsCount: 1,
      companyResultsCount: 0,
      results: [{
        id: 'person-media-1',
        title: 'Publicação de teste',
        url: 'https://example.test/person-media-1',
        domain: 'example.test',
        snippet: 'Renata Faria Rodrigues Baruzzi Lopes é mencionada em investigação.',
        queriesMatched: ['consulta nominal'],
        matchStrength: 'medium',
        subjectType: 'person',
        subjectName: 'Renata Faria Rodrigues Baruzzi Lopes',
        matchedTerms: ['investigação'],
        categories: ['criminal'],
        personMatch: { fullName: true },
        identityStatus: 'unverified',
        questionnaireRefs: ['5.2'],
      }],
      consultadoEm: '2026-08-24T10:00:00.000Z',
    },
    processosDescobertos: [],
  };
  const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
  const context = adaptReceita(builder, payload);
  adaptExternalResults(builder, context, payload);
  const snapshot = builder.toSnapshot();
  const person = snapshot.entities.find((entity) => entity.role === 'qsa_member');
  const relationship = snapshot.relationships.find((item) => item.type === 'POSSIBLE_PERSON_OCCURRENCE');
  const finding = snapshot.findings.find((item) => item.title.includes('validar pessoa'));

  assert.equal(relationship.sourceEntityId, person.id);
  assert.equal(finding.entityId, person.id);
  assert.match(finding.explanation, /não confirma identidade, autoria, investigação, processo, condenação ou irregularidade/i);
});

test('EGOS preserva publicação pessoal neutra como evidência sem criar alerta criminal', () => {
  const payload = {
    id: 'diligence-neutral-person-media',
    cnpj: '33000167000101',
    razaoSocial: 'PETROLEO BRASILEIRO S A PETROBRAS',
    dataAnalise: '2026-08-24T10:00:00.000Z',
    companySource: 'BrasilAPI',
    empresa: {
      cnpj: '33000167000101',
      razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS',
      descricao_situacao_cadastral: 'ATIVA',
    },
    socios: [{ nome_socio: 'Magda Maria de Regina Chambriard', qualificacao_socio: 'Presidente' }],
    pepResults: [],
    adverseMedia: {
      ok: true,
      peopleSearched: 1,
      personResultsCount: 1,
      companyResultsCount: 0,
      results: [{
        id: 'neutral-person-media-1',
        title: 'Magda Maria de Regina Chambriard recebe homenagem profissional',
        url: 'https://example.test/neutral-person-media-1',
        domain: 'example.test',
        snippet: 'Publicação sobre trajetória profissional.',
        queriesMatched: ['consulta nominal'],
        matchStrength: 'medium',
        subjectType: 'person',
        subjectName: 'Magda Maria de Regina Chambriard',
        matchedTerms: [],
        categories: [],
        personMatch: { fullName: true },
        identityStatus: 'unverified',
        questionnaireRefs: ['5.2'],
      }],
      consultadoEm: '2026-08-24T10:00:00.000Z',
    },
    processosDescobertos: [],
  };
  const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
  const context = adaptReceita(builder, payload);
  adaptExternalResults(builder, context, payload);
  const snapshot = builder.toSnapshot();

  assert.equal(snapshot.relationships.some((item) => item.type === 'POSSIBLE_PERSON_OCCURRENCE'), true);
  assert.equal(snapshot.findings.some((item) => item.axis === 'MEDIA'), false);
});

test('rotas de consulta recusam acesso sem token', async (t) => {
  delete process.env.INITIAL_ADMIN_EMAIL;
  delete process.env.VITE_FIREBASE_API_KEY;
  delete process.env.FIREBASE_WEB_API_KEY;

  const app = require('../src/app');
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/empresa/00000000000000`);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).ok, false);

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsignedToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ uid: 'fake', email: 'attacker@example.com' })}.`;
  const forgedResponse = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, {
    headers: { Authorization: `Bearer ${unsignedToken}` },
  });
  assert.equal(forgedResponse.status, 401);

  const corsResponse = await fetch(`http://127.0.0.1:${address.port}/api/status`, {
    headers: { Origin: 'https://origem-nao-autorizada.example' },
  });
  assert.equal(corsResponse.status, 403);
});
