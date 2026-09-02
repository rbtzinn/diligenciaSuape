const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AdverseMediaService,
  sanitizePersonDocument,
} = require('../src/services/adverse-media.service');

function providerWith(handler) {
  return {
    isConfigured: () => true,
    searchWeb: handler,
  };
}

const company = {
  cnpj: '12345678000190',
  razaoSocial: 'EMPRESA EXEMPLO LTDA',
  nomeFantasia: 'EXEMPLO',
};

test('plano sempre prioriza CNPJ e cobre todas as pessoas antes da expansão', () => {
  const service = new AdverseMediaService(providerWith(async () => ({
    ok: true,
    status: 200,
    results: [],
  })));
  const shareholders = [
    {
      nome_socio: 'ANA MARIA SILVA',
      identificador_de_socio: 2,
      cnpj_cpf_do_socio: '12345678901',
    },
    {
      nome_socio: 'BRUNO SOUZA LIMA',
      identificador_de_socio: 2,
      cnpj_cpf_do_socio: '***456789**',
    },
  ];

  const plan = service.buildQueryPlan(company, shareholders);
  assert.match(plan.queries[0].query, /12\.345\.678\/0001-90/);
  assert.match(plan.queries[0].query, /12345678000190/);
  assert.deepEqual(
    new Set(plan.queries.filter((item) => item.subjectType === 'person').map((item) => item.subjectName)),
    new Set(['ANA MARIA SILVA', 'BRUNO SOUZA LIMA']),
  );
  const anaQueries = plan.queries.filter((item) => item.subjectName === 'ANA MARIA SILVA');
  assert.deepEqual(
    anaQueries.filter((item) => item.channel === 'news').map((item) => item.purpose),
    ['general_mention', 'person_context', 'adverse_discovery'],
  );
  assert.equal(anaQueries[0].query, '"ANA MARIA SILVA"');
  assert.match(anaQueries[1].query, /"ANA MARIA SILVA" "EXEMPLO"/);
  assert.match(anaQueries[2].query, /"ANA MARIA SILVA" \(investigação OR denúncia/);
  // O canal web cobre documentos que o índice de notícias não alcança.
  const anaWeb = anaQueries.filter((item) => item.channel === 'web');
  assert.ok(anaWeb.some((item) => item.purpose === 'official_document'));
  assert.ok(anaWeb.some((item) => item.purpose === 'document_file'));
  assert.ok(anaWeb.some((item) => item.purpose === 'institutional_record'));
  assert.ok(anaWeb.some((item) => item.query.includes('filetype:pdf')));
  assert.equal(plan.plannedPersonQueries, plan.scheduledPersonQueries);
  assert.equal(plan.expansionQueriesSkipped, 0);
  assert.equal(JSON.stringify(plan).includes('12345678901'), false);
  assert.equal(sanitizePersonDocument('12345678901'), '***456789**');
});

test('correlação nominal respeita limites de palavra', () => {
  const service = new AdverseMediaService(providerWith(async () => ({
    ok: true,
    status: 200,
    results: [],
  })));
  const correlation = service.evaluatePersonCorrelation(
    { subjectName: 'ANA MARIA SILVA', subjectDocument: null },
    company,
    'A banana Maria Silva foi apresentada durante evento da Empresa Exemplo Ltda.',
  );

  assert.equal(correlation.personMatch.fullName, false);
  assert.equal(correlation.personMatch.nameTokenCoverage < 100, true);
  assert.equal(correlation.matchStrength, 'low');
});

test('mesma matéria é deduplicada e preserva todas as entidades correlacionadas', async () => {
  const article = {
    title: 'Empresa Exemplo e Ana Maria Silva são citadas em investigação',
    url: 'https://noticias.example.test/materia?utm_source=busca',
    domain: 'noticias.example.test',
    snippet: 'A investigação menciona a Empresa Exemplo Ltda e Ana Maria Silva no mesmo contexto.',
    publishedAt: '2026-08-20T12:00:00Z',
  };
  const service = new AdverseMediaService(providerWith(async () => ({
    ok: true,
    status: 200,
    provider: 'Teste',
    providerSources: ['teste'],
    results: [article],
  })));

  const result = await service.searchAdverseMedia(company, [{
    nome_socio: 'ANA MARIA SILVA',
    identificador_de_socio: 2,
    cnpj_cpf_do_socio: '12345678901',
  }], { forceRefresh: true });

  assert.equal(result.totalFound, 1);
  assert.equal(result.results[0].riskRelevant, true);
  assert.deepEqual(
    new Set(result.results[0].relatedSubjects.map((subject) => subject.subjectType)),
    new Set(['company', 'person']),
  );
  assert.equal(result.companyResultsCount, 1);
  assert.equal(result.personResultsCount, 1);
  assert.equal(JSON.stringify(result).includes('12345678901'), false);
});

test('notícia neutra continua visível sem se tornar ocorrência de risco', async () => {
  const service = new AdverseMediaService(providerWith(async () => ({
    ok: true,
    status: 200,
    provider: 'Teste',
    results: [{
      title: 'Empresa Exemplo inaugura nova unidade',
      url: 'https://noticias.example.test/empresa-exemplo-unidade',
      domain: 'noticias.example.test',
      snippet: 'A Empresa Exemplo Ltda anunciou novos empregos.',
    }],
  })));

  const result = await service.searchAdverseMedia(company, [{
    nome_socio: 'ANA MARIA SILVA',
    identificador_de_socio: 2,
    cnpj_cpf_do_socio: '***456789**',
  }], { forceRefresh: true });

  assert.equal(result.totalFound, 1);
  assert.equal(result.riskRelevantCount, 0);
  assert.equal(result.generalMentionsCount, 1);
  assert.equal(result.results[0].riskRelevant, false);
  assert.equal(result.results[0].relatedSubjects.some((subject) => subject.subjectType === 'person'), false);
});

test('falha total não é armazenada como falso resultado negativo', async () => {
  let unavailable = true;
  const service = new AdverseMediaService(providerWith(async () => (
    unavailable
      ? { ok: false, status: 503, erro: 'indisponível', results: [] }
      : { ok: true, status: 200, provider: 'Teste', results: [] }
  )));

  const first = await service.searchAdverseMedia(company, [], { forceRefresh: true });
  unavailable = false;
  const second = await service.searchAdverseMedia(company, []);

  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
  assert.equal(second.cached, undefined);
});

test('a varredura institucional entra no plano e cita os tribunais de contas', () => {
  const service = new AdverseMediaService({ isConfigured: () => true, searchWeb: async () => ({ ok: true, results: [] }) });
  const descriptors = service.generateCompanyQueryDescriptors(company);
  const institucionais = descriptors.filter((item) => item.purpose === 'institutional_record');

  assert.ok(institucionais.length > 0, 'o plano precisa conter consultas institucionais');

  const textoInstitucional = institucionais.map((item) => item.query).join(' ');
  for (const dominio of ['tce.pe.gov.br', 'tcu.gov.br', 'pncp.gov.br', 'portaldatransparencia.gov.br']) {
    assert.ok(textoInstitucional.includes(`site:${dominio}`), `faltou ${dominio} no plano institucional`);
  }
});

test('os domínios institucionais são divididos em blocos, não empilhados numa consulta só', () => {
  const service = new AdverseMediaService({ isConfigured: () => true, searchWeb: async () => ({ ok: true, results: [] }) });
  const institucionais = service
    .generateCompanyQueryDescriptors(company)
    .filter((item) => item.purpose === 'institutional_record');

  assert.ok(institucionais.length >= 2, 'dez domínios em uma consulta única fazem o buscador truncar a expressão');
  for (const descriptor of institucionais) {
    const ocorrencias = descriptor.query.match(/site:/g) || [];
    assert.ok(ocorrencias.length <= 4, `bloco com ${ocorrencias.length} domínios excede o limite por consulta`);
  }
});

test('com teto apertado, o corte preserva CNPJ e varredura institucional', () => {
  const anterior = process.env.ADVERSE_MEDIA_MAX_QUERIES;
  process.env.ADVERSE_MEDIA_MAX_QUERIES = '5';
  delete require.cache[require.resolve('../src/services/adverse-media.service')];

  try {
    const { AdverseMediaService: Reloaded } = require('../src/services/adverse-media.service');
    const service = new Reloaded({ isConfigured: () => true, searchWeb: async () => ({ ok: true, results: [] }) });
    const descriptors = service.generateCompanyQueryDescriptors(company);

    assert.equal(descriptors.length, 5);
    const propositos = descriptors.map((item) => item.purpose);
    assert.ok(propositos.includes('institutional_record'), 'a varredura institucional não pode ser a primeira sacrificada');
    assert.ok(propositos.includes('identifier'), 'a consulta por CNPJ precisa sobreviver ao corte');

    const prioridades = descriptors.map((item) => item.priority);
    assert.deepEqual(prioridades, [...prioridades].sort((a, b) => a - b), 'o plano final deve seguir a ordem de prioridade');
  } finally {
    if (anterior === undefined) delete process.env.ADVERSE_MEDIA_MAX_QUERIES;
    else process.env.ADVERSE_MEDIA_MAX_QUERIES = anterior;
    delete require.cache[require.resolve('../src/services/adverse-media.service')];
  }
});
