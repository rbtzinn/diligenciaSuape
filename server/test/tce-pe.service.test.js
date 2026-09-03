const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TcePeService,
  decodeByCharset,
  formatProcessNumber,
  matchCompanyName,
  rowsFromResponse,
} = require('../src/services/tce-pe.service');
const { EgosGraphBuilder } = require('../src/egos/core/egos-graph-builder');
const { adaptReceita } = require('../src/egos/adapters/receita.adapter');
const { adaptExternalResults } = require('../src/egos/adapters/external-results.adapter');

const COMPANY = {
  cnpj: '07868353000157',
  razaoSocial: 'SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA',
};

// O TCE-PE responde em ISO-8859-1, e a leitura passa pelo buffer bruto. O mock
// reproduz esse formato para que o teste exercite o mesmo caminho da produção.
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

test('formata número principal e preserva o identificador de recurso do TCE-PE', () => {
  assert.equal(formatProcessNumber('251004077'), '25100407-7');
  assert.equal(formatProcessNumber('201000258ED001'), '20100025-8 ED001');
});

test('distingue nome empresarial coincidente de termo distintivo sem CNPJ', () => {
  const variants = ['SOLIMP TERCEIRIZACOES DE MAO DE OBRA', 'SOLIMP'];
  assert.equal(matchCompanyName('SOLIMP TERCEIRIZACOES DE MAO DE OBRA', variants).strength, 'high');
  assert.equal(matchCompanyName('SOLIMP TERCEIRIZACOES', variants).strength, 'medium');
  assert.equal(matchCompanyName('OUTRA EMPRESA', variants), null);
});

test('resposta estruturalmente inválida não vira ausência de processo', () => {
  assert.throws(() => rowsFromResponse({ resposta: { status: 'ERRO' } }, 'Processos'), /formato inválido/);
});

test('localiza auditoria recente, enriquece a decisão e não inventa atribuição à empresa', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const address = String(url);
    if (address.includes('/Processos!json')) {
      return apiResponse([{
        Processo: '251004077',
        Exercicio: '2025',
        Tipo: 'Conformidade',
        NomeUJ: 'Prefeitura Municipal de Goiana',
        Situacao: 'Julgado',
        Interessado: 'SOLIMP TERCEIRIZACOES',
        Modalidade: 'Auditoria Especial',
        MunicipioUJ: 'Goiana',
        LinkProcesso: 'http://etce.tcepe.tc.br/processo',
      }]);
    }
    if (address.includes('/Resultados!json')) {
      return apiResponse([{
        Processo: '25100407-7',
        Resultado: 'Irregular',
        Modalidade: 'Auditoria Especial',
        DescricaoProcesso: 'Analisar a regularidade dos contratos 155/2025, 157/2025 e 159/2025.',
        NomeUJPrincipalProcesso: 'Prefeitura Municipal de Goiana',
        StatusProcesso: 'Julgado (publicado)',
        DataSessaoJulgamento: '2026-06-09',
        LinkDocumento: 'http://etce.tcepe.tc.br/decisao',
      }]);
    }
    if (address.includes('/Considerandos!json')) {
      return apiResponse([{ Conteudo: '<p>A tese de fraude exige prova robusta, não verificada nos autos.</p>' }]);
    }
    if (address.includes('/Determinacoes!json')) {
      return apiResponse([{ Conteudo: '<p>Reavalie os postos dos contratos 155/2025 e 159/2025.</p>' }]);
    }
    throw new Error(`URL inesperada: ${address}`);
  };

  try {
    const result = await TcePeService.searchCompany(COMPANY);
    assert.equal(result.ok, true);
    assert.equal(result.processos.length, 1);
    assert.equal(result.processos[0].processNumber, '25100407-7');
    assert.equal(result.processos[0].outcome, 'Irregular');
    assert.deepEqual(result.processos[0].contractsMentioned, ['155/2025', '157/2025', '159/2025']);
    assert.match(result.processos[0].attributionWarning, /não prova/);

    const payload = {
      ...COMPANY,
      id: 'tce-pe-test',
      dataAnalise: '2026-09-02T12:00:00.000Z',
      empresa: { cnpj: COMPANY.cnpj, razao_social: COMPANY.razaoSocial, descricao_situacao_cadastral: 'ATIVA' },
      socios: [],
      tcePe: result,
    };
    const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
    const context = adaptReceita(builder, payload);
    adaptExternalResults(builder, context, payload);
    const snapshot = builder.toSnapshot();
    assert.equal(snapshot.relationships.some((item) => item.type === 'NAMED_AS_INTERESTED_IN_EXTERNAL_CONTROL'), true);
    assert.equal(snapshot.findings.some((item) => item.axis === 'EXTERNAL_CONTROL' && item.severity === 'HIGH'), true);
    assert.equal(snapshot.coverage.find((item) => item.provider === 'TCE_PE_DADOS_ABERTOS').status, 'CONSULTED');
  } finally {
    global.fetch = originalFetch;
  }
});

test('resposta ISO-8859-1 do TCE-PE é decodificada com os acentos preservados', () => {
  // O TCE-PE declara charset=ISO-8859-1 no content-type. Decodificar como UTF-8
  // corrompe todo acento, e o texto corrompido segue para o dossiê e para o PDF.
  const bytes = Buffer.from('Embargos de Declaração e Licitação', 'latin1');

  assert.equal(
    decodeByCharset(bytes, 'application/json;charset=ISO-8859-1'),
    'Embargos de Declaração e Licitação',
  );

  // Lido como UTF-8, o mesmo buffer perde os acentos: é o defeito que a
  // correção elimina.
  assert.notEqual(bytes.toString('utf8'), 'Embargos de Declaração e Licitação');
});

test('charset ausente ou UTF-8 continua sendo lido como UTF-8', () => {
  const bytes = Buffer.from('Auditoria Especial de Conformidade', 'utf8');

  assert.equal(decodeByCharset(bytes, 'application/json'), 'Auditoria Especial de Conformidade');
  assert.equal(decodeByCharset(bytes, 'application/json;charset=UTF-8'), 'Auditoria Especial de Conformidade');
  assert.equal(decodeByCharset(bytes, undefined), 'Auditoria Especial de Conformidade');
});

test('a consulta ao TCE-PE decodifica pelo charset declarado na resposta', async () => {
  const originalFetch = global.fetch;
  const corpo = JSON.stringify({
    resposta: {
      status: 'OK',
      conteudo: [{ Processo: '25100407-7', Interessado: 'SOLIMP TERCEIRIZACOES', Tipo: 'Conformidade', NomeUJ: 'Prefeitura Municipal de Goiana' }],
    },
  });
  const bytes = Buffer.from(corpo, 'latin1');

  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: (nome) => (nome.toLowerCase() === 'content-type' ? 'application/json;charset=ISO-8859-1' : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });

  try {
    const resultado = await TcePeService.searchCompany({
      cnpj: '07868353000157',
      razaoSocial: 'SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA',
    });

    assert.equal(resultado.ok, true);
    const goiana = resultado.processos.find((processo) => processo.organization.includes('Goiana'));
    assert.ok(goiana, 'o processo de Goiana precisa ser localizado');
    assert.equal(goiana.organization, 'Prefeitura Municipal de Goiana');
  } finally {
    global.fetch = originalFetch;
  }
});
