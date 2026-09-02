const test = require('node:test');
const assert = require('node:assert/strict');

const {
  anchorsFor,
  executeLeads,
  isAnchored,
} = require('../src/services/ai/investigative-leads.service');

const empresa = {
  razaoSocial: 'SOLUCOES INTEGRADAS DE OBRAS LTDA',
  nomeFantasia: 'SOLINTEGRA',
  cnpj: '11222333000181',
  municipio: 'RECIFE',
  uf: 'PE',
};

const socios = [
  { nome_socio: 'CARLOS ALBERTO PEREIRA' },
  { nome_socio: 'ANA' },
];

test('a âncora aceita razão social, nome fantasia, CNPJ e nome de sócio', () => {
  const anchors = anchorsFor({ company: empresa, shareholders: socios });

  assert.ok(isAnchored('"SOLUCOES INTEGRADAS DE OBRAS LTDA" site:tce.pe.gov.br', anchors));
  assert.ok(isAnchored('SOLINTEGRA multa ambiental', anchors));
  assert.ok(isAnchored('11.222.333/0001-81 contrato', anchors));
  assert.ok(isAnchored('"CARLOS ALBERTO PEREIRA" Recife licitação', anchors));
});

test('consulta sem âncora é rejeitada, porque traria homônimo como se fosse a investigada', () => {
  const anchors = anchorsFor({ company: empresa, shareholders: socios });

  assert.equal(isAnchored('empresas de obras investigadas em Pernambuco', anchors), false);
  assert.equal(isAnchored('fraude licitação prefeitura', anchors), false);
  assert.equal(isAnchored('"JOAO DA SILVA" corrupção', anchors), false);
});

test('sócio com nome de uma palavra não vira âncora', () => {
  const anchors = anchorsFor({ company: { razaoSocial: '' }, shareholders: [{ nome_socio: 'ANA' }] });
  assert.equal(anchors.length, 0);
});

test('a execução das pistas deduplica por URL e registra cada consulta', async () => {
  const provider = {
    isConfigured: () => true,
    async searchWeb({ query }) {
      return {
        ok: true,
        results: [
          { title: 'Acórdão do tribunal', url: 'https://tce.pe.gov.br/acordao/1', domain: 'tce.pe.gov.br', snippet: query },
          { title: 'Mesma página', url: 'https://tce.pe.gov.br/acordao/1', domain: 'tce.pe.gov.br', snippet: 'repetida' },
        ],
      };
    },
  };

  const resultado = await executeLeads(
    [
      { termo: 'consulta um', canal: 'web', alvo: 'empresa', motivo: 'motivo um' },
      { termo: 'consulta dois', canal: 'news', alvo: 'empresa', motivo: 'motivo dois' },
    ],
    provider
  );

  assert.equal(resultado.ok, true);
  assert.equal(resultado.resultados.length, 1, 'a mesma URL não pode aparecer duas vezes');
  assert.equal(resultado.consultasExecutadas.length, 2);
  assert.ok(resultado.resultados[0].origemConsulta, 'o resultado precisa dizer de qual consulta veio');
});

test('falha de uma consulta não derruba a busca assistida inteira', async () => {
  const provider = {
    isConfigured: () => true,
    async searchWeb({ query }) {
      if (query === 'quebra') throw new Error('provedor fora do ar');
      return { ok: true, results: [{ title: 'ok', url: 'https://exemplo.com/a', domain: 'exemplo.com', snippet: '' }] };
    },
  };

  const resultado = await executeLeads(
    [
      { termo: 'quebra', canal: 'web', alvo: 'empresa' },
      { termo: 'funciona', canal: 'web', alvo: 'empresa' },
    ],
    provider
  );

  assert.equal(resultado.ok, true);
  assert.equal(resultado.resultados.length, 1);
  const comFalha = resultado.consultasExecutadas.find((item) => item.termo === 'quebra');
  assert.equal(comFalha.ok, false);
  assert.match(comFalha.erro, /provedor fora do ar/);
});

test('sem provedor de busca configurado, nada é inventado', async () => {
  const resultado = await executeLeads(
    [{ termo: 'qualquer', canal: 'web', alvo: 'empresa' }],
    { isConfigured: () => false }
  );

  assert.equal(resultado.ok, false);
  assert.equal(resultado.resultados.length, 0);
});
