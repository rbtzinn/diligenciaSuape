const test = require('node:test');
const assert = require('node:assert/strict');

const { PncpService, nameVariants, parseItemUrl, buildContract } = require('../src/services/pncp.service');

const EMPRESA = {
  cnpj: '07868353000157',
  razaoSocial: 'SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA',
};

function searchResponse(items, total = items.length) {
  return { ok: true, status: 200, json: async () => ({ total, items }) };
}

function contractItem(sequencial, orgaoCnpj = '08903189000134') {
  return {
    item_url: `/contratos/${orgaoCnpj}/2026/${sequencial}`,
    title: `Contrato nº ${sequencial}/2026`,
    description: 'Objeto do contrato',
    orgao_nome: 'RECIFE CAMARA MUNICIPAL',
    orgao_cnpj: orgaoCnpj,
    municipio_nome: 'Recife',
    uf: 'PE',
  };
}

function contractDetail(niFornecedor, overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      niFornecedor,
      nomeRazaoSocialFornecedor: 'SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA',
      numeroContratoEmpenho: '14/2026',
      objetoContrato: 'Apoio operacional',
      valorGlobal: 6487287.48,
      dataVigenciaInicio: '2026-07-05',
      dataVigenciaFim: '2027-07-04',
      orgaoEntidade: { razaoSocial: 'RECIFE CAMARA MUNICIPAL', cnpj: '08903189000134' },
      ...overrides,
    }),
  };
}

test('as variantes do nome incluem o termo distintivo, que é como o edital cita a empresa', () => {
  const variantes = nameVariants(EMPRESA);

  assert.ok(variantes.includes('SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA'));
  assert.ok(variantes.includes('SOLIMP TERCEIRIZACOES DE MAO DE OBRA'));
  assert.ok(variantes.includes('SOLIMP'));
});

test('termo distintivo com menos de quatro letras não vira consulta', () => {
  const variantes = nameVariants({ razaoSocial: 'ABC COMERCIO DE ALIMENTOS LTDA' });
  assert.equal(variantes.includes('ABC'), false);
});

test('o endereço do documento identifica órgão, ano e sequencial', () => {
  assert.deepEqual(
    parseItemUrl('/contratos/08903189000134/2026/14'),
    { kind: 'contratos', orgaoCnpj: '08903189000134', ano: '2026', sequencial: '14' },
  );
  assert.equal(parseItemUrl('/contratos/invalido/2026/14'), null);
  assert.equal(parseItemUrl(''), null);
});

test('contrato só é confirmado quando o CNPJ do fornecedor é o da empresa investigada', () => {
  const daEmpresa = buildContract({ niFornecedor: '07868353000157' }, {}, '07868353000157');
  assert.equal(daEmpresa.status, 'CONFIRMADO');

  // A busca casou o nome no texto, mas quem assinou foi outra empresa.
  const deTerceiro = buildContract({ niFornecedor: '11222333000181' }, {}, '07868353000157');
  assert.equal(deTerceiro.status, 'DIVERGENTE');

  const semFornecedor = buildContract({}, {}, '07868353000157');
  assert.equal(semFornecedor.status, 'DIVERGENTE');
});

test('separa contrato confirmado de homônimo e soma apenas o que foi confirmado', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const endereco = String(url);
    if (endereco.includes('/api/search/')) {
      if (endereco.includes('tipos_documento=contrato')) {
        return searchResponse([contractItem('14'), contractItem('17')]);
      }
      return searchResponse([]);
    }
    // O contrato 17 pertence a outra empresa que aparece citada no texto.
    if (endereco.endsWith('/2026/17')) return contractDetail('11222333000181');
    return contractDetail('07868353000157');
  };

  try {
    const resultado = await PncpService.search(EMPRESA);

    assert.equal(resultado.ok, true);
    assert.equal(resultado.resumo.confirmados, 1);
    assert.equal(resultado.resumo.divergentes, 1);
    assert.equal(resultado.resumo.valorTotalConfirmado, 6487287.48);
    assert.equal(resultado.contratos[0].fornecedorCnpjFmt, '07.868.353/0001-57');
  } finally {
    global.fetch = originalFetch;
  }
});

test('formato inesperado na busca vira falha, nunca lista vazia', async () => {
  const originalFetch = global.fetch;
  // Endpoint não documentado: se o portal mudar o contrato, concluir "sem
  // contratos" seria afirmar ausência a partir de um defeito.
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ resultados: [] }) });

  try {
    const resultado = await PncpService.search(EMPRESA);
    assert.equal(resultado.consultaParcial, true, 'a falha precisa ser declarada');
    assert.equal(resultado.contratos.length, 0);
    assert.ok(resultado.consultas.every((consulta) => consulta.ok === false));
  } finally {
    global.fetch = originalFetch;
  }
});

test('instabilidade da API é vencida por retentativa antes de virar ausência', async () => {
  const originalFetch = global.fetch;
  let chamadas = 0;
  global.fetch = async (url) => {
    const endereco = String(url);
    if (endereco.includes('/api/search/')) {
      chamadas += 1;
      // A primeira chamada falha, como acontece com frequência no PNCP real.
      if (chamadas === 1) throw new Error('fetch failed');
      if (endereco.includes('tipos_documento=contrato')) return searchResponse([contractItem('14')]);
      return searchResponse([]);
    }
    return contractDetail('07868353000157');
  };

  try {
    const resultado = await PncpService.search(EMPRESA);
    assert.equal(resultado.resumo.confirmados, 1, 'a retentativa precisa recuperar a consulta');
  } finally {
    global.fetch = originalFetch;
  }
});

test('contratação sem contrato fica como menção não confirmada', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const endereco = String(url);
    if (endereco.includes('tipos_documento=edital')) {
      return searchResponse([{
        item_url: '/compras/27165554000103/2024/561',
        title: 'Pregão 561/2024',
        description: 'Contratação de mão de obra',
        orgao_nome: 'ORGAO EXEMPLO',
        orgao_cnpj: '27165554000103',
        uf: 'PE',
      }]);
    }
    if (endereco.includes('/api/search/')) return searchResponse([]);
    return contractDetail('07868353000157');
  };

  try {
    const resultado = await PncpService.search(EMPRESA);

    assert.equal(resultado.contratacoes.length, 1);
    // O PNCP só nomeia o vencedor no contrato: o edital não prova participação.
    assert.equal(resultado.contratacoes[0].status, 'MENCAO_NAO_CONFIRMADA');
    assert.equal(resultado.resumo.confirmados, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sem razão social e sem CNPJ a consulta é recusada', async () => {
  const resultado = await PncpService.search({});
  assert.equal(resultado.ok, false);
  assert.equal(resultado.status, 400);
});
