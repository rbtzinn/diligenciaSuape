const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEvidencePack } = require('../src/services/ai/evidence-pack');
const {
  parseJsonResponse,
  validateFindings,
} = require('../src/services/ai/dossier-analysis.service');
const LlmProvider = require('../src/services/ai/llm.provider');

function dossieCompleto() {
  return {
    cnpj: '11222333000181',
    cnpjFmt: '11.222.333/0001-81',
    razaoSocial: 'EMPRESA EXEMPLO DE SERVICOS LTDA',
    dataAnalise: '2026-09-02T12:00:00.000Z',
    empresa: {
      cnpj: '11222333000181',
      razao_social: 'EMPRESA EXEMPLO DE SERVICOS LTDA',
      descricao_situacao_cadastral: 'ATIVA',
      natureza_juridica: 'Sociedade Empresária Limitada',
      capital_social: 500000,
      municipio: 'RECIFE',
      uf: 'PE',
    },
    socios: [
      { nome_socio: 'JOAO DA SILVA', qualificacao_socio: 'Sócio-Administrador', cnpj_cpf_do_socio: '***.456.789-**' },
    ],
    ceis: {
      ok: true,
      fonte: 'CGU — CEIS',
      encontrado: false,
      quantidade: 0,
      registros: [],
      consultadoEm: '2026-09-02T12:00:00.000Z',
    },
    cnep: { ok: false, semChave: true, fonte: 'CGU — CNEP', registros: [] },
    pepResults: [],
    processosJudiciais: [
      {
        numero: '0000001-11.2024.8.17.0001',
        numeroLimpo: '00000011120248170001',
        tribunalNome: 'Tribunal de Justiça de Pernambuco',
        grau: 'G1',
        classe: { codigo: 7, nome: 'Execução Fiscal' },
        assuntos: [{ codigo: 1, nome: 'Dívida Ativa' }],
        dataAjuizamento: '2024-03-10',
        totalMovimentos: 12,
        movimentos: [{ nome: 'Distribuição' }],
        fonte: 'DataJud',
      },
    ],
    adverseMedia: {
      ok: true,
      provider: 'Busca web',
      totalFound: 2,
      riskRelevantCount: 1,
      strongMatches: 1,
      coverageStatus: 'COMPLETE',
      consultadoEm: '2026-09-02T12:00:00.000Z',
      results: [
        {
          id: 'a1',
          title: 'Município rescinde contratos após auditoria do tribunal de contas',
          url: 'https://exemplo.gov.br/noticia',
          domain: 'exemplo.gov.br',
          snippet: 'A prefeitura informou a rescisão dos contratos.',
          matchedTerms: ['rescisão'],
          categories: ['integrity'],
          riskRelevant: true,
          matchStrength: 'high',
          status: 'candidate',
        },
        {
          id: 'a2',
          title: 'Notícia neutra sobre o setor',
          url: 'https://exemplo.com/neutro',
          domain: 'exemplo.com',
          snippet: 'Texto sem conteúdo negativo.',
          matchedTerms: [],
          categories: [],
          riskRelevant: false,
          matchStrength: 'low',
          status: 'discarded',
        },
      ],
    },
    risco: {
      score: 42,
      nivel: 'Atenção Elevada',
      decisao: 'Aprofundar a Diligência',
      methodologyVersion: 'v2.0-exposure',
      detalhes: [{ criterio: 'Menções relevantes a risco', pontos: 10, info: 'Uma menção relevante.' }],
    },
  };
}

test('o pacote de evidências cobre todos os eixos do dossiê', () => {
  const pack = buildEvidencePack(dossieCompleto());
  const eixos = new Set(pack.evidencias.map((item) => item.eixo));

  assert.ok(eixos.has('CADASTRO'));
  assert.ok(eixos.has('SOCIETARIO'));
  assert.ok(eixos.has('JUDICIAL'));
  assert.ok(eixos.has('MIDIA'));
  assert.ok(eixos.has('SCORE_INTERNO'));

  const identificadores = pack.evidencias.map((item) => item.id);
  assert.deepEqual(identificadores, identificadores.map((_, index) => `E${index + 1}`));
});

test('a cobertura distingue fonte sem achado de fonte indisponível', () => {
  const pack = buildEvidencePack(dossieCompleto());
  const porEixo = new Map(pack.cobertura.map((item) => [item.eixo, item.status]));

  assert.equal(porEixo.get('SANCOES_EMPRESA_CEIS'), 'CONSULTADO_SEM_ACHADOS');
  assert.equal(porEixo.get('SANCOES_EMPRESA_CNEP'), 'INDISPONIVEL');
  assert.equal(porEixo.get('PEP'), 'NAO_CONSULTADO');
  assert.equal(porEixo.get('OFFSHORE'), 'NAO_CONSULTADO');
});

test('resultados descartados na triagem não viram evidência', () => {
  const pack = buildEvidencePack(dossieCompleto());
  const titulos = pack.evidencias.map((item) => item.titulo);

  assert.ok(titulos.some((titulo) => titulo.includes('rescinde contratos')));
  assert.ok(!titulos.some((titulo) => titulo.includes('Notícia neutra')));
});

test('um dossiê vazio ainda produz mapa de cobertura, sem evidências', () => {
  const pack = buildEvidencePack({});
  assert.equal(pack.evidencias.length, 0);
  assert.ok(pack.cobertura.length > 0);
});

test('achado sem evidência citada é descartado', () => {
  const evidenceIndex = new Map([['E1', { id: 'E1', eixo: 'MIDIA', titulo: 'Título', fonte: 'Fonte', url: null, data: null }]]);
  const { aceitos, descartados } = validateFindings(
    [
      { severidade: 'alto', titulo: 'Com lastro', analise: 'Texto.', evidencias: ['E1'] },
      { severidade: 'critico', titulo: 'Alucinado', analise: 'Texto.', evidencias: ['E99'] },
      { severidade: 'alto', titulo: 'Sem citação', analise: 'Texto.' },
    ],
    evidenceIndex
  );

  assert.equal(aceitos.length, 1);
  assert.equal(aceitos[0].titulo, 'Com lastro');
  assert.equal(descartados.length, 2);
});

test('os achados são ordenados do mais severo ao menos severo', () => {
  const evidenceIndex = new Map([['E1', { id: 'E1', eixo: 'MIDIA', titulo: 'T', fonte: 'F', url: null, data: null }]]);
  const { aceitos } = validateFindings(
    [
      { severidade: 'positivo', titulo: 'Bom', analise: 'Texto.', evidencias: ['E1'] },
      { severidade: 'critico', titulo: 'Grave', analise: 'Texto.', evidencias: ['E1'] },
      { severidade: 'moderado', titulo: 'Médio', analise: 'Texto.', evidencias: ['E1'] },
    ],
    evidenceIndex
  );

  assert.deepEqual(aceitos.map((item) => item.titulo), ['Grave', 'Médio', 'Bom']);
});

test('a resposta do modelo é lida mesmo com cercas de código ou texto ao redor', () => {
  const comCercas = '```json\n{"resumoExecutivo":"ok"}\n```';
  assert.equal(parseJsonResponse(comCercas).resumoExecutivo, 'ok');

  const comPrefixo = 'Segue a análise:\n{"resumoExecutivo":"ok"}';
  assert.equal(parseJsonResponse(comPrefixo).resumoExecutivo, 'ok');

  assert.equal(parseJsonResponse('sem json algum'), null);
});

test('a trava de custo bloqueia modelo pago no OpenRouter', () => {
  const chaveAnterior = process.env.OPENROUTER_API_KEY;
  const modeloAnterior = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = 'chave-de-teste';
  process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';

  try {
    const openrouter = LlmProvider.listProviders().find((provider) => provider.id === 'openrouter-free');
    assert.equal(openrouter.configured, false);
    assert.equal(openrouter.blockedByCostGuard, true);

    process.env.OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
    const liberado = LlmProvider.listProviders().find((provider) => provider.id === 'openrouter-free');
    assert.equal(liberado.configured, true);
    assert.equal(liberado.blockedByCostGuard, false);
  } finally {
    if (chaveAnterior === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = chaveAnterior;
    if (modeloAnterior === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = modeloAnterior;
  }
});
