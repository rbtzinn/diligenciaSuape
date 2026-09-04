const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateSearchMatrix,
  applyExecutionResult,
  deduplicate,
  semanticKey,
  corporateNameRisk,
  termFalsePositiveRisk,
  buildQuery,
} = require('../src/search-matrix/search-query-generator');
const {
  SEARCH_CATEGORY,
  QUERY_PRIORITY,
  QUERY_STATUS,
  FALSE_POSITIVE_RISK,
  IDENTIFIER_KIND,
  SOURCE_STATUS,
  PROVIDERS,
} = require('../src/search-matrix/search-vocabulary');
const { buildEntityProfile } = require('../src/entity-resolution/entity-resolution');

// Caso real da Fase 1: razão social cujo termo distintivo é palavra comum.
const GUERRA = {
  cnpj: '10.811.370/0001-62',
  razaoSocial: 'GUERRA CONSTRUCOES LTDA',
  municipio: 'Recife',
  uf: 'PE',
  qsa: [
    { nome_socio: 'JOAO CARLOS GUERRA', identificador_de_socio: 2, qualificacao_socio: 'Sócio-Administrador' },
    { nome_socio: 'MARIA LUCIA GUERRA', identificador_de_socio: 2, qualificacao_socio: 'Sócia' },
  ],
};

const queriesFor = (matrix, predicate) => matrix.queries.filter(predicate);
const hasQuery = (matrix, text) => matrix.queries.some((query) => query.query === text);

// ==========================================================
// Identificadores
// ==========================================================

test('CNPJ sem formatação vira consulta CRITICAL nas fontes oficiais', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const cnpjQueries = queriesFor(matrix, (query) => query.query === '10811370000162');

  assert.ok(cnpjQueries.length > 0, 'o CNPJ sem pontuação precisa gerar consulta');
  assert.ok(
    cnpjQueries.some((query) => query.priority === QUERY_PRIORITY.CRITICAL),
    'identificador exato em fonte oficial é a consulta de maior prioridade',
  );
  for (const query of cnpjQueries) {
    assert.equal(query.identifier.kind, IDENTIFIER_KIND.CNPJ);
    assert.equal(query.falsePositiveRisk, FALSE_POSITIVE_RISK.LOW);
  }
});

test('CNPJ formatado é gerado para as fontes textuais', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const formatted = queriesFor(matrix, (query) => query.query.includes('10.811.370/0001-62'));

  assert.ok(formatted.length > 0, 'publicação oficial grafa o CNPJ com pontuação');
  for (const query of formatted) {
    assert.equal(query.identifier.kind, IDENTIFIER_KIND.CNPJ_FORMATTED);
    assert.equal(query.falsePositiveRisk, FALSE_POSITIVE_RISK.LOW);
    // Documento textual cita a empresa; não prova que ela é a contratada.
    assert.equal(query.expectedRelationship, 'MENTIONED');
  }
});

test('razão social é sempre pesquisada como frase exata', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const nameQueries = queriesFor(
    matrix,
    (query) => query.identifier.kind === IDENTIFIER_KIND.CORPORATE_NAME,
  );

  assert.ok(nameQueries.length > 0);
  for (const query of nameQueries) {
    assert.ok(
      query.query.includes('"GUERRA CONSTRUCOES LTDA"'),
      `consulta nominal sem aspas casaria qualquer texto com uma das palavras: ${query.query}`,
    );
  }
});

test('razão social ganha âncora de município e de UF', () => {
  const matrix = generateSearchMatrix(GUERRA);

  assert.ok(hasQuery(matrix, '"GUERRA CONSTRUCOES LTDA" "Recife"'), 'faltou a âncora de município');
  assert.ok(hasQuery(matrix, '"GUERRA CONSTRUCOES LTDA" PE'), 'faltou a âncora de UF');

  const withCity = matrix.queries.find((query) => query.query === '"GUERRA CONSTRUCOES LTDA" "Recife"');
  assert.equal(withCity.municipio, 'Recife');
  assert.equal(withCity.uf, 'PE');
  // Frase exata de três termos mais âncora geográfica: é a consulta nominal de
  // menor ruído possível. O falso positivo da Fase 1 veio do token "guerra"
  // solto, não desta frase — nenhuma reportagem sobre a Síria a contém.
  assert.equal(withCity.falsePositiveRisk, FALSE_POSITIVE_RISK.LOW);
});

test('o risco é do termo pesquisado, não do nome da empresa', () => {
  // Mesma empresa, dois termos com poder discriminante oposto.
  assert.equal(termFalsePositiveRisk('GUERRA CONSTRUCOES LTDA'), FALSE_POSITIVE_RISK.LOW);
  assert.equal(termFalsePositiveRisk('GUERRA'), FALSE_POSITIVE_RISK.HIGH);
  // A âncora atenua a palavra única, mas não a transforma em identificador.
  assert.equal(termFalsePositiveRisk('GUERRA', true), FALSE_POSITIVE_RISK.MEDIUM);
  assert.notEqual(termFalsePositiveRisk('GUERRA', true), FALSE_POSITIVE_RISK.LOW);
});

// ==========================================================
// Falsos positivos e prioridade
// ==========================================================

test('nome de termo distintivo único é marcado como alto risco de falso positivo', () => {
  const profile = buildEntityProfile(GUERRA);
  assert.equal(profile.singleTokenName, true, 'GUERRA CONSTRUCOES tem um único termo distintivo');
  assert.equal(corporateNameRisk(profile), FALSE_POSITIVE_RISK.HIGH);
});

test('a matriz nunca gera a palavra genérica solta como consulta da empresa', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const soltas = matrix.queries.filter((query) => /^"?GUERRA"?$/i.test(query.query.trim()));

  assert.equal(soltas.length, 0, '"guerra" isolada não é consulta legítima da razão social');
});

test('nome fantasia de palavra única entra em baixa prioridade e alto risco', () => {
  const matrix = generateSearchMatrix({ ...GUERRA, nomeFantasia: 'GUERRA' });
  const fantasia = queriesFor(matrix, (query) => query.identifier.kind === IDENTIFIER_KIND.TRADE_NAME);

  assert.ok(fantasia.length > 0, 'o nome fantasia ainda precisa ser pesquisado');
  for (const query of fantasia) {
    assert.equal(query.priority, QUERY_PRIORITY.LOW);
    assert.equal(query.falsePositiveRisk, FALSE_POSITIVE_RISK.HIGH);
  }
});

test('nome distintivo forte não é rebaixado como se fosse ambíguo', () => {
  const matrix = generateSearchMatrix({
    cnpj: '07868353000157',
    razaoSocial: 'SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA',
    municipio: 'Recife',
    uf: 'PE',
  });
  const nominais = queriesFor(matrix, (query) => query.identifier.kind === IDENTIFIER_KIND.CORPORATE_NAME);

  assert.ok(nominais.length > 0);
  assert.equal(nominais.every((query) => query.priority !== QUERY_PRIORITY.LOW), true);
});

test('prioridade não é risco: CNPJ crítico convive com risco de falso positivo baixo', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const criticas = queriesFor(matrix, (query) => query.priority === QUERY_PRIORITY.CRITICAL);

  assert.ok(criticas.length > 0);
  assert.equal(
    criticas.every((query) => query.falsePositiveRisk === FALSE_POSITIVE_RISK.LOW),
    true,
    'prioridade alta indica ordem de execução, nunca suspeita sobre a empresa',
  );
});

// ==========================================================
// Deduplicação e normalização
// ==========================================================

test('grafias diferentes do mesmo nome colapsam na mesma consulta', () => {
  const base = {
    provider: 'adverse-media',
    category: SEARCH_CATEGORY.MEDIA,
    priority: QUERY_PRIORITY.MEDIUM,
    priorityRationale: 'teste',
    subject: { type: 'company', name: 'x', entityId: 'e1' },
    identifier: { kind: IDENTIFIER_KIND.CORPORATE_NAME, value: 'x' },
    expectedRelationship: 'MENTIONED',
    falsePositiveRisk: FALSE_POSITIVE_RISK.MEDIUM,
  };
  const variantes = [
    'GUERRA CONSTRUCOES LTDA',
    'GUERRA CONSTRUÇÕES LTDA',
    'Guerra Construcoes Ltda',
    'Guerra Construções Ltda.',
  ].map((nome, index) => buildQuery({ ...base, query: nome, reason: `origem ${index}` }));

  const chaves = new Set(variantes.map(semanticKey));
  assert.equal(chaves.size, 1, 'acento, caixa e pontuação não podem gerar consultas distintas');

  const [merged] = deduplicate(variantes);
  assert.equal(merged.duplicatesMerged, 3);
});

test('a deduplicação preserva providers, prioridade mais alta e todas as justificativas', () => {
  const base = {
    query: '10811370000162',
    category: SEARCH_CATEGORY.SANCOES,
    subject: { type: 'company', name: 'x', entityId: 'e1' },
    identifier: { kind: IDENTIFIER_KIND.CNPJ, value: '10811370000162' },
    expectedRelationship: 'CONTRACTOR',
  };
  const [merged] = deduplicate([
    buildQuery({
      ...base,
      provider: 'cgu-ceis',
      priority: QUERY_PRIORITY.MEDIUM,
      priorityRationale: 'origem fraca',
      reason: 'rastrear sanção no CEIS',
      falsePositiveRisk: FALSE_POSITIVE_RISK.MEDIUM,
    }),
    buildQuery({
      ...base,
      provider: 'cgu-cnep',
      priority: QUERY_PRIORITY.CRITICAL,
      priorityRationale: 'identificador exato em fonte oficial',
      reason: 'rastrear sanção no CNEP',
      falsePositiveRisk: FALSE_POSITIVE_RISK.LOW,
    }),
  ]);

  assert.deepEqual(merged.providers, ['cgu-ceis', 'cgu-cnep']);
  assert.equal(merged.priority, QUERY_PRIORITY.CRITICAL, 'a fusão adota a prioridade mais alta');
  assert.equal(merged.priorityRationale, 'identificador exato em fonte oficial');
  assert.equal(merged.falsePositiveRisk, FALSE_POSITIVE_RISK.LOW);
  assert.deepEqual(merged.reasons, ['rastrear sanção no CEIS', 'rastrear sanção no CNEP']);
});

test('a mesma consulta não é repetida na matriz de uma entidade', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const chaves = matrix.queries.map((query) => `${query.category}::${query.query}`);

  assert.equal(new Set(chaves).size, chaves.length, 'nenhuma consulta pode aparecer duas vezes');
  assert.ok(matrix.resumo.duplicatasFundidas > 0, 'a matriz real precisa exercitar a deduplicação');
});

// ==========================================================
// Dados ausentes
// ==========================================================

test('sem CNPJ a matriz ainda funciona, apenas sem consulta por identificador', () => {
  const matrix = generateSearchMatrix({ razaoSocial: 'GUERRA CONSTRUCOES LTDA', municipio: 'Recife', uf: 'PE' });

  assert.ok(matrix.queries.length > 0, 'a busca nominal continua possível');
  assert.equal(
    matrix.queries.some((query) => query.identifier.kind.startsWith('CNPJ')),
    false,
    'não se inventa identificador que a entidade não possui',
  );
  assert.equal(matrix.entity.cnpjNormalized, null);
});

test('sem município a matriz não gera âncora geográfica vazia', () => {
  const matrix = generateSearchMatrix({ ...GUERRA, municipio: '' });

  assert.equal(matrix.entity.municipio, null);
  assert.equal(
    matrix.queries.some((query) => query.query.includes('""')),
    false,
    'âncora vazia produziria consulta sintaticamente quebrada',
  );
  assert.ok(hasQuery(matrix, '"GUERRA CONSTRUCOES LTDA" PE'), 'a âncora de UF continua disponível');
});

test('sem UF a matriz não gera consulta com sufixo vazio', () => {
  const matrix = generateSearchMatrix({ ...GUERRA, uf: '' });

  assert.equal(matrix.entity.uf, null);
  assert.equal(
    matrix.queries.some((query) => /\s$/.test(query.query)),
    false,
  );
  assert.ok(hasQuery(matrix, '"GUERRA CONSTRUCOES LTDA" "Recife"'));
});

test('UF inválida é descartada em vez de virar consulta', () => {
  const matrix = generateSearchMatrix({ ...GUERRA, uf: 'ZZ' });
  assert.equal(matrix.entity.uf, null);
  assert.equal(matrix.queries.some((query) => query.query.includes(' ZZ')), false);
});

// ==========================================================
// Pessoas
// ==========================================================

test('sócios pessoa física entram na matriz, ancorados na empresa', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const pessoas = queriesFor(matrix, (query) => query.subject.type === 'person');

  assert.ok(pessoas.length > 0);
  assert.ok(pessoas.some((query) => query.query.includes('"JOAO CARLOS GUERRA"')));
  // A consulta ancorada tem menos ruído que o nome sozinho.
  const ancorada = pessoas.find((query) => query.query.includes('"JOAO CARLOS GUERRA" "GUERRA CONSTRUCOES LTDA"'));
  assert.ok(ancorada, 'faltou a consulta que associa a pessoa à empresa');
  assert.equal(ancorada.falsePositiveRisk, FALSE_POSITIVE_RISK.LOW);
  assert.equal(ancorada.expectedRelationship, 'RELATED');
});

test('sócio pessoa jurídica não vira consulta de pessoa', () => {
  const matrix = generateSearchMatrix({
    ...GUERRA,
    qsa: [{ nome_socio: 'HOLDING PARTICIPACOES LTDA', identificador_de_socio: 1, cnpj_cpf_do_socio: '11222333000181' }],
  });

  assert.equal(matrix.queries.some((query) => query.subject.type === 'person'), false);
});

// ==========================================================
// Combinações absurdas e tetos
// ==========================================================

test('a matriz não sofre explosão combinatória', () => {
  const matrix = generateSearchMatrix({
    ...GUERRA,
    qsa: Array.from({ length: 30 }, (_, index) => ({
      nome_socio: `SOCIO NUMERO ${index} DA SILVA`,
      identificador_de_socio: 2,
    })),
  });

  assert.ok(matrix.queries.length <= 160, `matriz com ${matrix.queries.length} consultas é ingerível`);
  for (const [category, items] of Object.entries(matrix.byCategory)) {
    assert.ok(items.length <= 24, `categoria ${category} estourou o teto`);
  }
});

test('os termos contratuais entram em uma consulta só, não em uma por termo', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const comTermos = queriesFor(matrix, (query) => query.query.includes(' OR '));

  assert.ok(comTermos.length > 0, 'os termos de execução contratual precisam ser pesquisados');
  assert.ok(comTermos.length <= 2, 'um termo por consulta multiplicaria a matriz por dezoito');
  assert.ok(comTermos[0].query.includes('"serviços excedentes"'));
  assert.ok(comTermos[0].query.includes('"termo aditivo"'));
});

test('fonte que só responde por CNPJ não recebe consulta nominal', () => {
  const matrix = generateSearchMatrix(GUERRA);
  for (const query of matrix.queries) {
    for (const provider of query.providers) {
      const descriptor = PROVIDERS[provider];
      if (descriptor.requiresCnpj && !descriptor.allowsName) {
        assert.ok(
          query.identifier.kind.startsWith('CNPJ'),
          `${provider} não sabe responder a ${query.identifier.kind}`,
        );
      }
    }
  }
});

// ==========================================================
// Identificadores já descobertos
// ==========================================================

test('contrato e processo já conhecidos viram âncora exata', () => {
  const matrix = generateSearchMatrix(GUERRA, {
    knownContracts: ['6008/2019'],
    knownProcesses: ['0001234-56.2020.8.17.0001'],
  });

  const contrato = matrix.queries.find((query) => query.identifier.kind === IDENTIFIER_KIND.CONTRACT_NUMBER);
  assert.ok(contrato, 'contrato conhecido precisa gerar consulta');
  assert.equal(contrato.priority, QUERY_PRIORITY.HIGH);
  assert.equal(contrato.falsePositiveRisk, FALSE_POSITIVE_RISK.LOW);
  assert.match(contrato.reason, /6008\/2019/);

  const processo = matrix.queries.find((query) => query.identifier.kind === IDENTIFIER_KIND.PROCESS_NUMBER);
  assert.ok(processo);
  assert.equal(processo.category, SEARCH_CATEGORY.PROCESSOS);
});

// ==========================================================
// Auditoria
// ==========================================================

test('toda consulta explica por que existe', () => {
  const matrix = generateSearchMatrix(GUERRA, { knownContracts: ['6008/2019'] });

  for (const query of matrix.queries) {
    assert.ok(query.reason && query.reason.length > 20, `consulta sem motivo: ${query.query}`);
    assert.ok(query.priorityRationale, `prioridade sem explicação: ${query.query}`);
    assert.ok(query.identifier.kind && query.identifier.value, 'faltou o identificador que sustenta a consulta');
    assert.ok(query.id, 'consulta sem identificador estável não é rastreável');
    assert.ok(Array.isArray(query.reasons) && query.reasons.length > 0);
  }
});

test('a matriz declara o que decidiu não gerar', () => {
  const matrix = generateSearchMatrix(GUERRA, { includeUnimplementedProviders: false });

  assert.ok(matrix.skipped.length > 0, 'fonte sem adaptador precisa aparecer como corte declarado');
  assert.ok(matrix.skipped.every((item) => item.motivo));
  assert.equal(
    matrix.queries.every((query) => query.providerImplemented),
    true,
  );
});

// ==========================================================
// Fronteira com o Source Status (Fase 2)
// ==========================================================

test('consulta gerada não é consulta executada', () => {
  const matrix = generateSearchMatrix(GUERRA);

  assert.equal(matrix.resumo.executadas, 0);
  for (const query of matrix.queries) {
    assert.equal(query.status, QUERY_STATUS.PLANNED);
    assert.equal(query.sourceStatus, null, 'nenhuma fonte pode nascer com resposta');
  }
  assert.match(matrix.limitacao, /Nenhuma foi executada/);
});

test('o resultado da execução usa o vocabulário do Source Status da Fase 2', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const executada = applyExecutionResult(matrix.queries[0], SOURCE_STATUS.EMPTY);

  assert.equal(executada.status, QUERY_STATUS.EXECUTED);
  assert.equal(executada.sourceStatus, SOURCE_STATUS.EMPTY);
  assert.ok(executada.executedAt);
  // EMPTY e UNAVAILABLE continuam distintos, como a Fase 2 estabeleceu.
  assert.notEqual(SOURCE_STATUS.EMPTY, SOURCE_STATUS.UNAVAILABLE);
  // A consulta original permanece intacta: a execução não muda o plano.
  assert.equal(matrix.queries[0].status, QUERY_STATUS.PLANNED);
});

test('a matriz não gera estado de fonte próprio', () => {
  const matrix = generateSearchMatrix(GUERRA);
  const validos = new Set([...Object.values(SOURCE_STATUS), null]);

  for (const query of matrix.queries) {
    assert.ok(validos.has(query.sourceStatus), 'a matriz não pode inventar estado fora do Source Status');
  }
});

// ==========================================================
// Estrutura da matriz
// ==========================================================

test('a matriz agrupa por categoria e resume o que foi planejado', () => {
  const matrix = generateSearchMatrix(GUERRA);

  assert.ok(matrix.byCategory[SEARCH_CATEGORY.IDENTIDADE], 'faltou o eixo de identidade');
  assert.ok(matrix.byCategory[SEARCH_CATEGORY.CONTRATOS]);
  assert.ok(matrix.byCategory[SEARCH_CATEGORY.CONTROLE_EXTERNO]);
  assert.ok(matrix.byCategory[SEARCH_CATEGORY.MEDIA]);
  assert.equal(
    Object.values(matrix.byCategory).reduce((total, items) => total + items.length, 0),
    matrix.resumo.total,
  );
  assert.equal(matrix.entity.entityId, buildEntityProfile(GUERRA).entityId);
  assert.ok(matrix.generatedAt);
});

test('a matriz aceita um perfil já resolvido sem reconstruí-lo', () => {
  const profile = buildEntityProfile(GUERRA);
  const matrix = generateSearchMatrix(profile);

  assert.equal(matrix.entity.entityId, profile.entityId);
  assert.ok(matrix.queries.length > 0);
});

test('restringir categorias limita a matriz sem quebrá-la', () => {
  const matrix = generateSearchMatrix(GUERRA, { categories: [SEARCH_CATEGORY.SANCOES] });

  assert.ok(matrix.queries.length > 0);
  assert.equal(matrix.queries.every((query) => query.category === SEARCH_CATEGORY.SANCOES), true);
});
