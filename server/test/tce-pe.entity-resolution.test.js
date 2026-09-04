const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TcePeService,
  RELATIONSHIP_TYPE,
  resolveProcessAttribution,
} = require('../src/services/tce-pe.service');
const { buildEntityProfile } = require('../src/entity-resolution/entity-resolution');
// O cliente do TCE-PE passou a ter cache por consulta na Fase 3. Sem limpar,
// a resposta bem-sucedida de um cenário responderia pelo cenário seguinte, e
// a suíte validaria o cache em vez da regra. Nenhuma asserção foi alterada.
const { clearCache } = require('../src/services/tce-pe/tce-pe.client');

const COMPANY = {
  cnpj: '10811370000162',
  razaoSocial: 'GUERRA CONSTRUCOES LTDA',
  municipio: 'Recife',
  uf: 'PE',
};
const profile = buildEntityProfile(COMPANY);

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

test('TESTE 6 — processo de aposentadoria sem vínculo real não vira processo da empresa', () => {
  const atribuicao = resolveProcessAttribution(profile, {
    interestedName: 'INSTITUTO DE PREVIDENCIA DOS SERVIDORES DE GOIANA',
    type: 'Ato de Pessoal',
    modality: 'Aposentadoria',
    description: 'Aposentadoria voluntária por tempo de contribuição de servidora do quadro efetivo.',
    considerations: ['O tempo de serviço averbado durante a guerra fiscal entre municípios foi considerado.'],
    determinations: [],
  });

  assert.equal(atribuicao.relevantToEntity, false);
  assert.equal(atribuicao.relationshipType, RELATIONSHIP_TYPE.FALSE_POSITIVE);
  assert.equal(atribuicao.personnelAct, true);
});

test('TESTE 7 — processo com CNPJ exato da empresa é CONFIRMED e CONTRACTOR', () => {
  const atribuicao = resolveProcessAttribution(profile, {
    interestedName: 'GUERRA CONSTRUCOES LTDA',
    type: 'Conformidade',
    modality: 'Auditoria Especial',
    description: 'Exame do contrato 155/2025 firmado com a Guerra Construções Ltda, CNPJ 10.811.370/0001-62.',
    considerations: [],
    determinations: [],
  });

  assert.equal(atribuicao.entityMatch.level, 'CONFIRMED');
  assert.equal(atribuicao.relationshipType, RELATIONSHIP_TYPE.CONTRACTOR);
  assert.equal(atribuicao.relevantToEntity, true);
});

test('empresa interessada em processo sem objeto contratual é PARTY, não CONTRACTOR', () => {
  const atribuicao = resolveProcessAttribution(profile, {
    interestedName: 'GUERRA CONSTRUCOES LTDA',
    type: 'Recurso',
    modality: 'Embargos de Declaração',
    description: 'Embargos opostos pela interessada em face do acórdão anterior.',
    considerations: [],
    determinations: [],
  });

  assert.equal(atribuicao.relationshipType, RELATIONSHIP_TYPE.PARTY);
  assert.equal(atribuicao.relevantToEntity, true);
});

test('nome só no corpo da decisão é MENTIONED, não parte do processo', () => {
  const atribuicao = resolveProcessAttribution(profile, {
    interestedName: 'PREFEITURA MUNICIPAL DE IPOJUCA',
    type: 'Conformidade',
    modality: 'Auditoria Especial',
    description: 'Exame da execução orçamentária do exercício.',
    considerations: ['Entre os fornecedores examinados consta a Guerra Construções Ltda.'],
    determinations: [],
  });

  assert.equal(atribuicao.relationshipType, RELATIONSHIP_TYPE.MENTIONED);
  assert.equal(atribuicao.relevantToEntity, true);
});

test('a busca separa processo relevante de descartado e mantém o descarte auditável', async () => {
  clearCache();
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const address = String(url);
    if (address.includes('/Processos!json')) {
      return apiResponse([
        {
          Processo: '251004077',
          Exercicio: '2025',
          Tipo: 'Conformidade',
          NomeUJ: 'Prefeitura Municipal de Recife',
          Situacao: 'Julgado',
          Interessado: 'GUERRA CONSTRUCOES LTDA',
          Modalidade: 'Auditoria Especial',
        },
        {
          Processo: '251004088',
          Exercicio: '2025',
          Tipo: 'Ato de Pessoal',
          NomeUJ: 'Instituto de Previdência de Recife',
          Situacao: 'Julgado',
          Interessado: 'GUERRA CONSTRUCOES LTDA',
          Modalidade: 'Aposentadoria',
        },
      ]);
    }
    if (address.includes('/Resultados!json')) {
      const contrato = address.includes('25100407');
      return apiResponse([{
        Processo: contrato ? '25100407-7' : '25100408-8',
        Resultado: contrato ? 'Regular' : 'Irregular',
        Modalidade: contrato ? 'Auditoria Especial' : 'Aposentadoria',
        DescricaoProcesso: contrato
          ? 'Exame do contrato 155/2025 de obra pública.'
          : 'Aposentadoria voluntária de servidora do quadro efetivo.',
        StatusProcesso: 'Julgado (publicado)',
      }]);
    }
    return apiResponse([]);
  };

  try {
    const result = await TcePeService.searchCompany(COMPANY);

    assert.equal(result.ok, true);
    assert.equal(result.sourceStatus, 'SUCCESS');
    assert.equal(result.processos.length, 1, 'só o processo de contrato é da empresa');
    assert.equal(result.processos[0].relationshipType, RELATIONSHIP_TYPE.CONTRACTOR);
    assert.equal(result.falsePositivesDiscarded, 1);
    // O descarte precisa continuar consultável, com o motivo registrado.
    assert.equal(result.processosDescartados.length, 1);
    assert.match(result.processosDescartados[0].basis, /ato de pessoal/i);
    // A decisão "Irregular" do ato de pessoal não pode contar como achado da empresa.
    assert.equal(result.resumo.resultadosIrregulares, 0);
    assert.equal(result.resumo.descartados, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fonte que não responde a nenhuma consulta é UNAVAILABLE, nunca ausência de processo', async () => {
  clearCache();
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('ECONNRESET'); };

  try {
    const result = await TcePeService.searchCompany(COMPANY);
    assert.equal(result.ok, false);
    assert.equal(result.sourceStatus, 'UNAVAILABLE');
    assert.equal(result.processos.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
