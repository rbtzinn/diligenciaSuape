const test = require('node:test');
const assert = require('node:assert/strict');

const DatajudService = require('../src/services/datajud.service');
const { AdverseMediaService } = require('../src/services/adverse-media.service');
const { comparePerson } = require('../src/egos/entity-resolution/entity-resolution.service');
const { EgosGraphBuilder } = require('../src/egos/core/egos-graph-builder');
const { adaptReceita } = require('../src/egos/adapters/receita.adapter');
const { adaptCgu } = require('../src/egos/adapters/cgu.adapter');
const { adaptExternalResults } = require('../src/egos/adapters/external-results.adapter');

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

test('EGOS não confirma identidade PEP apenas por coincidência nominal', () => {
  const resolution = comparePerson(
    { name: 'João Antônio de Souza' },
    { name: 'JOAO ANTONIO DE SOUZA', organization: 'Órgão Público' }
  );

  assert.equal(resolution.score, 68);
  assert.equal(resolution.status, 'POSSIBLE_MATCH');
  assert.equal(resolution.requiresHumanReview, true);
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
