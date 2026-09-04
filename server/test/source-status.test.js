const test = require('node:test');
const assert = require('node:assert/strict');

// O backoff exponencial do PNCP é real e desejado em produção, mas aqui só faria
// a suíte esperar. Definido antes do require porque o serviço lê o valor uma vez,
// na carga do módulo.
process.env.PNCP_RETRY_BASE_DELAY_MS = process.env.PNCP_RETRY_BASE_DELAY_MS || '50';

const {
  SOURCE_STATUS,
  contributesToRisk,
  isCoverageGap,
  resolveSourceStatus,
} = require('../src/domain/source-status');
const { PncpService } = require('../src/services/pncp.service');
const { OfficialGazetteService } = require('../src/services/official-gazette.service');

// ==========================================================
// Vocabulário
// ==========================================================

test('EMPTY e UNAVAILABLE nunca se confundem', () => {
  const consultada = resolveSourceStatus({ attempted: 3, succeeded: 3, resultCount: 0 });
  const indisponivel = resolveSourceStatus({ attempted: 3, succeeded: 0, resultCount: 0 });

  assert.equal(consultada, SOURCE_STATUS.EMPTY);
  assert.equal(indisponivel, SOURCE_STATUS.UNAVAILABLE);
  assert.notEqual(consultada, indisponivel);
});

test('parte concluída é PARTIAL, e não sucesso nem falha', () => {
  assert.equal(resolveSourceStatus({ attempted: 5, succeeded: 3, resultCount: 2 }), SOURCE_STATUS.PARTIAL);
});

test('NOT_APPLICABLE não é ERROR', () => {
  assert.equal(resolveSourceStatus({ applicable: false }), SOURCE_STATUS.NOT_APPLICABLE);
  assert.equal(resolveSourceStatus({ attempted: 1, internalError: true }), SOURCE_STATUS.ERROR);
});

test('só estado com informação colhida pode alimentar risco', () => {
  assert.equal(contributesToRisk(SOURCE_STATUS.SUCCESS), true);
  assert.equal(contributesToRisk(SOURCE_STATUS.PARTIAL), true);
  for (const status of ['EMPTY', 'UNAVAILABLE', 'ERROR', 'NOT_APPLICABLE']) {
    assert.equal(contributesToRisk(SOURCE_STATUS[status]), false, `${status} não pode pontuar risco`);
  }
  assert.equal(isCoverageGap(SOURCE_STATUS.UNAVAILABLE), true);
  assert.equal(isCoverageGap(SOURCE_STATUS.EMPTY), false);
});

// ==========================================================
// PNCP
// ==========================================================

const EMPRESA = {
  cnpj: '10811370000162',
  razaoSocial: 'GUERRA CONSTRUCOES LTDA',
  municipio: 'Recife',
  uf: 'PE',
};

test('TESTE 4 — PNCP indisponível não vira "nenhum contrato"', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('fetch failed'); };

  try {
    const result = await PncpService.search(EMPRESA);

    assert.equal(result.ok, false);
    assert.equal(result.sourceStatus, 'UNAVAILABLE');
    assert.equal(result.contratos.length, 0);
    assert.equal(result.resumo.confirmados, 0);
    // O aviso é o que impede a tela vazia de ser lida como conclusão.
    assert.match(result.aviso, /não autoriza concluir/i);
    assert.ok(result.consultas.length > 0, 'as tentativas precisam ficar registradas');
    assert.equal(result.consultas.every((consulta) => consulta.ok === false), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('TESTE 5 — PNCP consultado com zero contratos é EMPTY', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ total: 0, items: [] }),
  });

  try {
    const result = await PncpService.search(EMPRESA);

    assert.equal(result.ok, true);
    assert.equal(result.sourceStatus, 'EMPTY');
    assert.equal(result.contratos.length, 0);
    assert.equal(result.consultaParcial, false);
    assert.equal(result.aviso, undefined, 'consulta bem-sucedida não carrega aviso de lacuna');
  } finally {
    global.fetch = originalFetch;
  }
});

test('contrato assinado por outro CNPJ é FALSO POSITIVO de identidade', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const address = String(url);
    if (address.includes('/api/search/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          items: [{
            item_url: '/contratos/11111111111111/2025/1',
            title: 'Contrato 10/2025',
            description: 'Obra de pavimentação',
            orgao_nome: 'Prefeitura de Recife',
          }],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        niFornecedor: '99999999000111',
        nomeRazaoSocialFornecedor: 'GUERRA CONSTRUCOES E SERVICOS LTDA',
        objetoContrato: 'Obra de pavimentação',
        numeroContratoEmpenho: '10/2025',
      }),
    };
  };

  try {
    const result = await PncpService.search(EMPRESA);

    assert.equal(result.contratos.length, 0, 'o contrato é de outro CNPJ');
    assert.equal(result.contratosDivergentes.length, 1);
    assert.equal(result.contratosDivergentes[0].entityMatch.level, 'FALSE_POSITIVE');
    assert.match(result.contratosDivergentes[0].entityMatch.basis, /outro CNPJ/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('CNPJ do fornecedor coincidente confirma a identidade pela própria fonte', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const address = String(url);
    if (address.includes('/api/search/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          items: [{ item_url: '/contratos/11111111111111/2025/1', title: 'Contrato 10/2025' }],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        niFornecedor: '10811370000162',
        nomeRazaoSocialFornecedor: 'GUERRA CONSTRUCOES LTDA',
        objetoContrato: 'Obra de pavimentação',
        valorGlobal: 1_000_000,
      }),
    };
  };

  try {
    const result = await PncpService.search(EMPRESA);

    assert.equal(result.contratos.length, 1);
    assert.equal(result.contratos[0].entityMatch.level, 'CONFIRMED');
    assert.equal(result.sourceStatus, 'SUCCESS');
  } finally {
    global.fetch = originalFetch;
  }
});

// ==========================================================
// Diários Oficiais
// ==========================================================

function gazettePayload(excerpts) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      total_gazettes: excerpts.length,
      gazettes: excerpts.map((excerpt, index) => ({
        date: '2026-03-1' + index,
        territory_id: '2611606',
        territory_name: 'Recife',
        state_code: 'PE',
        url: `https://diario.example.test/edicao-${index}`,
        excerpts: [excerpt],
      })),
    }),
  };
}

test('TESTE 8 — CNPJ exato no diário oficial é CONFIRMED', async () => {
  OfficialGazetteService.clearCache();
  const originalFetch = global.fetch;
  global.fetch = async () => gazettePayload([
    'Contrato firmado com GUERRA CONSTRUCOES LTDA, CNPJ 10.811.370/0001-62, para execução de obra.',
  ]);

  try {
    const result = await OfficialGazetteService.search(EMPRESA);

    assert.equal(result.ok, true);
    assert.ok(result.results.length > 0);
    assert.equal(result.results[0].entityMatch.level, 'CONFIRMED');
    assert.equal(result.results[0].matchStrength, 'high');
    assert.equal(result.falsePositivesDiscarded, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('palavra genérica isolada no diário oficial é descartada e fica auditável', async () => {
  OfficialGazetteService.clearCache();
  const originalFetch = global.fetch;
  global.fetch = async () => gazettePayload([
    'Decreto que institui o dia municipal de memória às vítimas da guerra.',
  ]);

  try {
    const result = await OfficialGazetteService.search(EMPRESA);

    assert.equal(result.results.length, 0, 'uma palavra da razão social não identifica a empresa');
    assert.equal(result.falsePositivesDiscarded > 0, true);
    assert.equal(result.discardedResults[0].level, 'FALSE_POSITIVE');
    assert.ok(result.discardedResults[0].basis);
  } finally {
    global.fetch = originalFetch;
  }
});

test('TESTE 9 — um sujeito que falha não derruba os demais e o resultado é PARTIAL', async () => {
  OfficialGazetteService.clearCache();
  const originalFetch = global.fetch;
  let chamada = 0;
  global.fetch = async () => {
    chamada += 1;
    // A segunda consulta falha; as outras concluem.
    if (chamada === 2) throw new Error('ECONNRESET');
    return gazettePayload([
      'Publicação do extrato do contrato com GUERRA CONSTRUCOES LTDA, CNPJ 10.811.370/0001-62.',
    ]);
  };

  try {
    const result = await OfficialGazetteService.search(EMPRESA, {
      shareholders: [
        { nome_socio: 'JOAO CARLOS GUERRA', identificador_de_socio: '2', cnpj_cpf_do_socio: '***456789**' },
        { nome_socio: 'MARIA LUCIA GUERRA', identificador_de_socio: '2', cnpj_cpf_do_socio: '***111222**' },
      ],
    });

    assert.equal(result.ok, true, 'a falha de um sujeito não invalida a consulta inteira');
    assert.equal(result.sourceStatus, 'PARTIAL');
    assert.equal(result.partial, true);
    assert.ok(result.results.length > 0, 'os sujeitos que concluíram precisam ser preservados');
    assert.equal(result.completedSubjects > 0, true);
    assert.equal(result.failedSubjects, 1);
    assert.equal(result.completedSubjects + result.failedSubjects + result.unavailableSubjects, result.subjects.length);
  } finally {
    global.fetch = originalFetch;
  }
});

test('nenhum sujeito concluído é UNAVAILABLE, com as três contagens declaradas', async () => {
  OfficialGazetteService.clearCache();
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('ECONNRESET'); };

  try {
    const result = await OfficialGazetteService.search(EMPRESA);

    assert.equal(result.ok, false);
    assert.equal(result.sourceStatus, 'UNAVAILABLE');
    assert.equal(result.completedSubjects, 0);
    assert.ok(result.failedSubjects > 0);
    assert.match(result.aviso, /não significa ausência de publicação/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('nenhum sujeito é consultado duas vezes', async () => {
  OfficialGazetteService.clearCache();
  const originalFetch = global.fetch;
  let requisicoes = 0;
  global.fetch = async () => {
    requisicoes += 1;
    return gazettePayload([]);
  };

  try {
    // "SOLIMP LTDA" gera as variantes razão social, razão sem sufixo e termo
    // distintivo — que colapsam em duas. O sócio repetido no QSA é outra
    // colisão. Cada requisição gasta orçamento do prazo global, então o
    // invariante que interessa é: uma requisição por sujeito distinto.
    const result = await OfficialGazetteService.search({
      cnpj: '22333444000155',
      razaoSocial: 'SOLIMP LTDA',
      nomeFantasia: 'SOLIMP',
    }, {
      shareholders: [
        { nome_socio: 'ANA MARIA SOUZA', identificador_de_socio: '2' },
        { nome_socio: 'Ana Maria Souza', identificador_de_socio: '2' },
      ],
    });

    const nomes = result.subjects.map((subject) => subject.name.toUpperCase());
    assert.equal(new Set(nomes).size, nomes.length, 'nenhum sujeito pode aparecer duas vezes');
    assert.equal(requisicoes, result.subjects.length, 'uma requisição por sujeito distinto');
    assert.equal(nomes.filter((nome) => nome.includes('ANA MARIA SOUZA')).length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
