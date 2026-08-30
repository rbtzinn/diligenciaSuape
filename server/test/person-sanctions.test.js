const test = require('node:test');
const assert = require('node:assert/strict');

const { PersonSanctionsService, isNaturalPerson } = require('../src/services/person-sanctions.service');
const { getCoverageRows } = require('../src/services/report/report-sections');

const SOCIO = 'MARIA APARECIDA DA SILVA SOUZA';

function sanctionRecord(overrides = {}) {
  return {
    id: 1,
    sancionado: SOCIO,
    documentoSancionado: '***.456.789-**',
    orgao: 'Prefeitura Municipal',
    sancao: 'Impedimento de licitar',
    inicio: '01/02/2023',
    fim: '01/02/2027',
    vigente: true,
    processo: '123/2023',
    ...overrides,
  };
}

/** Cliente que devolve o mesmo resultado para qualquer cadastro. */
function clientReturning(response) {
  return { async searchSanctionsByName() { return response; } };
}

function okResponse(registros) {
  return { ok: true, fonte: 'CGU', registros, encontrado: registros.length > 0, quantidade: registros.length };
}

test('sócio pessoa jurídica não entra no rastreio nominal', () => {
  assert.equal(isNaturalPerson({ cnpj_cpf_do_socio: '20867216000166' }), false);
  assert.equal(isNaturalPerson({ cnpj_cpf_do_socio: '***456789**' }), true);
  assert.equal(isNaturalPerson({ cnpj_cpf_do_socio: '' }), true);
});

test('CPF mascarado coincidente eleva o candidato acima de 90', async () => {
  const summary = await PersonSanctionsService.screen(
    [{ nome_socio: SOCIO, cnpj_cpf_do_socio: '***456789**', qualificacao_socio: 'Sócio-Administrador' }],
    { client: clientReturning(okResponse([sanctionRecord()])) },
  );

  assert.equal(summary.coverageStatus, 'CONSULTED');
  assert.equal(summary.peopleSearched, 1);
  // um candidato por cadastro (CEIS e CNEP)
  assert.equal(summary.totalCandidates, 2);
  assert.equal(summary.strongCandidates, 2);

  const candidate = summary.resultados[0].candidatos[0];
  assert.ok(candidate.score >= 90, `esperado score >= 90, veio ${candidate.score}`);
  assert.equal(candidate.identityConfirmed, false);
  assert.equal(candidate.requiresHumanReview, true);
  assert.ok(candidate.signals.some((s) => s.code === 'MASKED_CPF' && s.matched));
});

test('coincidência apenas nominal fica abaixo de 70 e não conta como forte', async () => {
  const summary = await PersonSanctionsService.screen(
    [{ nome_socio: SOCIO, cnpj_cpf_do_socio: '***111222**' }],
    { client: clientReturning(okResponse([sanctionRecord({ documentoSancionado: '***.999.888-**' })])) },
  );

  const candidate = summary.resultados[0].candidatos[0];
  assert.ok(candidate.score <= 69, `nome sozinho nunca confirma identidade, veio ${candidate.score}`);
  assert.equal(summary.strongCandidates, 0);
  assert.equal(summary.totalCandidates, 2);
});

test('nome muito diferente não vira candidato', async () => {
  const summary = await PersonSanctionsService.screen(
    [{ nome_socio: SOCIO, cnpj_cpf_do_socio: '***456789**' }],
    { client: clientReturning(okResponse([sanctionRecord({ sancionado: 'CONSTRUTORA HORIZONTE AZUL LTDA', documentoSancionado: '' })])) },
  );
  assert.equal(summary.totalCandidates, 0);
});

test('fonte indisponível vira lacuna declarada, não ausência de sanção', async () => {
  const summary = await PersonSanctionsService.screen(
    [{ nome_socio: SOCIO, cnpj_cpf_do_socio: '***456789**' }],
    { client: clientReturning({ ok: false, semChave: true, registros: [] }) },
  );

  assert.equal(summary.coverageStatus, 'UNAVAILABLE');
  assert.equal(summary.ok, false);
  assert.match(summary.aviso, /não configurada/i);
  assert.equal(summary.totalCandidates, 0);
});

test('quadro sem pessoa física é NOT_APPLICABLE, não CONSULTED', async () => {
  const summary = await PersonSanctionsService.screen(
    [{ nome_socio: 'HOLDING PARTICIPACOES LTDA', cnpj_cpf_do_socio: '20867216000166' }],
    { client: clientReturning(okResponse([])) },
  );
  assert.equal(summary.coverageStatus, 'NOT_APPLICABLE');
  assert.equal(summary.peopleSearched, 0);
});

test('o mesmo nome repetido no QSA é pesquisado uma vez só', async () => {
  let calls = 0;
  const client = { async searchSanctionsByName() { calls += 1; return okResponse([]); } };
  await PersonSanctionsService.screen([
    { nome_socio: SOCIO, cnpj_cpf_do_socio: '***456789**', qualificacao_socio: 'Sócio' },
    { nome_socio: SOCIO, cnpj_cpf_do_socio: '***456789**', qualificacao_socio: 'Administrador' },
  ], { client });
  assert.equal(calls, 2, 'esperado um par CEIS/CNEP para o nome único');
});

// ---------- cobertura declarada no relatório ----------

test('cobertura do PDF não declara CONSULTED quando a fonte falhou', () => {
  const rows = getCoverageRows({
    empresa: { razao_social: 'EMPRESA TESTE' },
    ceis: { ok: false, semChave: true, quantidade: 0, registros: [] },
    cnep: { ok: true, quantidade: 0, registros: [] },
    pepResults: [],
    adverseMedia: { ok: true, totalFound: 3 },
  });

  const ceis = rows.find((r) => r.axis === 'Sanções CEIS');
  const cnep = rows.find((r) => r.axis === 'Sanções CNEP');
  assert.equal(ceis.status, 'UNAVAILABLE', 'CEIS sem chave não pode aparecer como consultado');
  assert.equal(ceis.count, 0);
  assert.equal(cnep.status, 'CONSULTED');
});

test('cobertura distingue descoberta processual não executada', () => {
  const rows = getCoverageRows({
    empresa: {}, pepResults: [], processDiscoveryExecuted: false, processosDescobertos: [],
  });
  const discovery = rows.find((r) => r.axis === 'Descoberta processual');
  assert.equal(discovery.status, 'NOT_CONSULTED');
  assert.match(discovery.message, /não há varredura/i);
});

test('cobertura inclui o eixo de sanções dos sócios', () => {
  const rows = getCoverageRows({
    empresa: {}, pepResults: [],
    personSanctions: { coverageStatus: 'PARTIAL', totalCandidates: 2, aviso: '1 de 2 consulta(s) concluída(s).' },
  });
  const axis = rows.find((r) => r.axis === 'Sanções dos sócios (PF)');
  assert.equal(axis.status, 'PARTIAL');
  assert.equal(axis.count, 2);
});
