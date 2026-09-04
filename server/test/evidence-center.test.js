const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEvidence,
  duplicateOf,
  ensureCenter,
  syncEvidenceCenterToEgos,
} = require('../src/services/evidence-center.service');
const { validateFindings } = require('../src/services/ai/dossier-analysis.service');
const { ReportGenerator } = require('../src/services/report/report-generator');

const USER = { id: 'analyst-1', name: 'Analista Teste', email: 'analista@example.com' };

function baseSnapshot(items = []) {
  return {
    id: 'diligence-evidence-center',
    cnpj: '12345678000190',
    cnpjFmt: '12.345.678/0001-90',
    razaoSocial: 'EMPRESA DE TESTE LTDA',
    dataAnalise: '2026-09-03T12:00:00.000Z',
    status: 'in_progress',
    empresa: { cnpj: '12345678000190', razao_social: 'EMPRESA DE TESTE LTDA' },
    socios: [],
    pepResults: [],
    timeline: [],
    risco: { score: 10, nivel: 'Atenção Baixa', decisao: 'Prosseguir', decisaoDesc: '', detalhes: [] },
    evidenceCenter: { version: 'evidence-center-v1', items, updatedAt: '2026-09-03T12:00:00.000Z' },
    egos: {
      runId: 'run-1',
      version: 'egos-2.0-snapshot',
      generatedAt: '2026-09-03T12:00:00.000Z',
      entities: [{
        id: 'company-root', key: 'company:cnpj:12345678000190', type: 'Company', name: 'EMPRESA DE TESTE LTDA',
        normalizedName: 'EMPRESA DE TESTE LTDA', properties: { cnpj: '12345678000190' }, depth: 0, role: 'root', confidence: 100,
        identifiers: [{ type: 'CNPJ', value: '12345678000190' }],
      }],
      relationships: [], evidences: [], findings: [], resolutions: [], coverage: [], insights: [], metrics: {},
    },
  };
}

function validInput(overrides = {}) {
  return {
    type: 'LINK_OFICIAL',
    title: 'Documento oficial de teste',
    source: 'Órgão oficial',
    url: 'https://example.gov.br/documento/1',
    relatedEntity: 'EMPRESA DE TESTE LTDA',
    relatedEntityType: 'company',
    relatedCnpj: '12345678000190',
    relationType: 'MENCIONADA_EM',
    matchStrength: 'FORTE',
    validationStatus: 'CONFIRMADA',
    ...overrides,
  };
}

test('menção validada não vira responsabilização no EGOS', () => {
  const evidence = buildEvidence(validInput(), { diligenceId: 'diligence-evidence-center', user: USER });
  const snapshot = baseSnapshot([evidence]);
  syncEvidenceCenterToEgos(snapshot);

  assert.equal(evidence.validationStatus, 'CONFIRMADA');
  assert.equal(snapshot.egos.relationships.some((item) => item.type === 'MENCIONADA_EM'), true);
  assert.equal(snapshot.egos.relationships.some((item) => item.type === 'RESPONSABILIZADA_EM'), false);
});

test('sanção de gestor não é atribuída automaticamente à empresa', () => {
  const evidence = buildEvidence(validInput({
    relationType: 'SANCIONADA_POR',
    decision: { responsiblePerson: 'GESTOR PÚBLICO TESTE' },
  }), { diligenceId: 'diligence-evidence-center', user: USER });
  const snapshot = baseSnapshot([evidence]);
  syncEvidenceCenterToEgos(snapshot);

  assert.equal(evidence.validationStatus, 'PENDENTE_REVISAO');
  assert.match(evidence.validationIssues.join(' '), /pessoa não pode ser projetada.*empresa/i);
  assert.equal(snapshot.egos.relationships.some((item) => item.type === 'SANCIONADA_POR'), false);
});

test('falha ou ausência de leitura textual do PDF exige revisão manual', () => {
  const evidence = buildEvidence(validInput({
    type: 'PDF',
    hash: 'abc123',
    file: { name: 'acordao.pdf', sizeBytes: 2048, pageCount: 12, extractionStatus: 'FALHOU' },
  }), { diligenceId: 'diligence-evidence-center', user: USER });

  assert.equal(evidence.validationStatus, 'PENDENTE_REVISAO');
  assert.equal(evidence.coverageStatus, 'EXIGE_REVISAO_MANUAL');
});

test('documento sem URL ou referência de origem não é confirmado', () => {
  const evidence = buildEvidence(validInput({ url: '', originReference: '' }), {
    diligenceId: 'diligence-evidence-center', user: USER,
  });
  assert.equal(evidence.validationStatus, 'PENDENTE_REVISAO');
  assert.match(evidence.validationIssues.join(' '), /origem verificável/i);
});

test('evidência duplicada é detectada por URL canônica ou hash', () => {
  const first = buildEvidence(validInput({ url: 'https://example.gov.br/doc?utm_source=teste&id=1', hash: 'ff00' }), {
    diligenceId: 'diligence-evidence-center', user: USER,
  });
  const sameUrl = buildEvidence(validInput({ url: 'https://EXAMPLE.gov.br/doc?id=1#pagina', hash: '' }), {
    diligenceId: 'diligence-evidence-center', user: USER,
  });
  const sameHash = buildEvidence(validInput({ url: 'https://example.gov.br/outro', hash: 'FF00' }), {
    diligenceId: 'diligence-evidence-center', user: USER,
  });

  assert.equal(duplicateOf([first], sameUrl)?.id, first.id);
  assert.equal(duplicateOf([first], sameHash)?.id, first.id);
});

test('decisão sem páginas e dispositivo permanece pendente', () => {
  const evidence = buildEvidence(validInput({
    type: 'DECISAO',
    relationType: 'INTERESSADA_EM',
    relevantPages: [],
    decision: { companyRole: 'INTERESSADA', dispositive: '' },
  }), { diligenceId: 'diligence-evidence-center', user: USER });

  assert.equal(evidence.validationStatus, 'PENDENTE_REVISAO');
  assert.match(evidence.validationIssues.join(' '), /páginas/i);
  assert.match(evidence.validationIssues.join(' '), /dispositivo/i);
});

test('fonte indisponível não vira ausência de ocorrência', () => {
  const evidence = buildEvidence(validInput({
    validationStatus: 'PENDENTE_REVISAO',
    sourceUnavailable: true,
    coverageStatus: 'INDISPONIVEL',
  }), { diligenceId: 'diligence-evidence-center', user: USER });

  assert.equal(evidence.coverageStatus, 'INDISPONIVEL');
  assert.notEqual(evidence.coverageStatus, 'CONSULTADO_SEM_ACHADOS');
});

test('achado de IA sem evidenceId válido continua descartado', () => {
  const evidenceIndex = new Map([['E1', { id: 'E1', eixo: 'EVIDENCIA_ASSISTIDA', titulo: 'Documento', fonte: 'Órgão' }]]);
  const result = validateFindings([
    { severidade: 'alto', titulo: 'Com lastro', analise: 'Texto', evidencias: ['E1'] },
    { severidade: 'critico', titulo: 'Sem lastro', analise: 'Texto', evidencias: ['E404'] },
  ], evidenceIndex);

  assert.deepEqual(result.aceitos.map((item) => item.titulo), ['Com lastro']);
  assert.deepEqual(result.descartados.map((item) => item.titulo), ['Sem lastro']);
});

test('snapshot antigo sem Central de Evidências continua carregável', () => {
  const legacy = { id: 'legacy', cnpj: '12345678000190', egos: { entities: [] } };
  assert.deepEqual(ensureCenter(legacy), { version: 'evidence-center-v1', items: [], updatedAt: null });
});

test('CPF completo e remuneração não entram no EGOS nem no PDF', async () => {
  const evidence = buildEvidence(validInput({
    excerpt: 'CPF 123.456.789-01; remuneração mensal R$ 9.876,54; conteúdo documental pertinente.',
    analystNote: 'Documento 12345678901 conferido.',
  }), { diligenceId: 'diligence-evidence-center', user: USER });
  const snapshot = baseSnapshot([evidence]);
  syncEvidenceCenterToEgos(snapshot);

  const serializedEgos = JSON.stringify(snapshot.egos);
  assert.equal(serializedEgos.includes('12345678901'), false);
  assert.equal(serializedEgos.includes('9.876,54'), false);
  assert.match(evidence.excerpt, /CPF REMOVIDO/);
  assert.match(evidence.excerpt, /DADO REMOVIDO/);

  const { buffer } = await ReportGenerator.generateBuffer(snapshot, 'DIL-TESTE', true);
  const rawPdf = buffer.toString('latin1');
  assert.equal(rawPdf.includes('12345678901'), false);
  assert.equal(rawPdf.includes('9.876,54'), false);
});
