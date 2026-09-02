const test = require('node:test');
const assert = require('node:assert/strict');

const { SearxngProvider } = require('../src/services/search/searxng.provider');
const {
  DuckDuckGoLiteProvider,
  parseResults,
  resolveRedirect,
} = require('../src/services/search/duckduckgo-lite.provider');
const { OfficialGazetteService, personCorrelation } = require('../src/services/official-gazette.service');

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function htmlResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => body };
}

test('SearXNG exige instância configurada e não falha em silêncio', async () => {
  const provider = new SearxngProvider({ baseUrl: '' });
  assert.equal(provider.isConfigured(), false);

  const response = await provider.searchWeb({ query: '"ANA MARIA SILVA"', channel: 'web' });
  assert.equal(response.ok, false);
  assert.equal(response.status, 503);
  assert.match(response.erro, /SEARXNG_BASE_URL/);
});

test('SearXNG consulta o canal web e normaliza resultados', async () => {
  let capturedUrl;
  const provider = new SearxngProvider({
    baseUrl: 'https://busca.interno.test/',
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return jsonResponse({
        number_of_results: 2,
        results: [
          {
            title: 'Portaria de nomeação',
            url: 'https://www.exemplo.gov.br/portaria.pdf',
            content: 'Nomeia ANA MARIA SILVA para a função.',
            engines: ['google', 'bing'],
            publishedDate: '2026-03-04T00:00:00Z',
          },
          { title: '', url: 'https://sem-titulo.test' },
        ],
      });
    },
  });

  const response = await provider.searchWeb({ query: '"ANA MARIA SILVA"', channel: 'web', count: 10 });
  assert.equal(capturedUrl.pathname, '/search');
  assert.equal(capturedUrl.searchParams.get('format'), 'json');
  assert.equal(capturedUrl.searchParams.get('categories'), 'general');
  assert.equal(response.ok, true);
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].domain, 'exemplo.gov.br');
  assert.equal(response.results[0].publishedAt, '2026-03-04T00:00:00.000Z');
});

test('DuckDuckGo Lite resolve redirecionamento e descarta link interno', () => {
  assert.equal(
    resolveRedirect('//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tcu.gov.br%2Facordao.pdf&rut=1'),
    'https://www.tcu.gov.br/acordao.pdf',
  );
  assert.equal(resolveRedirect('https://duckduckgo.com/settings'), '');
  assert.equal(resolveRedirect('javascript:alert(1)'), '');
});

test('DuckDuckGo Lite extrai resultados do HTML e evita duplicidade', () => {
  const html = `
    <a rel="nofollow" class="result-link" href="https://www.tcu.gov.br/acordao.pdf">Acórdão 123/2026</a>
    <td class="result-snippet">Responsável ANA MARIA SILVA.</td>
    <a rel="nofollow" class="result-link" href="https://www.tcu.gov.br/acordao.pdf">Acórdão 123/2026</a>
    <td class="result-snippet">Duplicado.</td>
  `;
  const results = parseResults(html, 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].domain, 'tcu.gov.br');
  assert.equal(results[0].snippet, 'Responsável ANA MARIA SILVA.');
});

test('DuckDuckGo Lite acusa mudança de layout em vez de devolver lista vazia', async () => {
  const provider = new DuckDuckGoLiteProvider({
    fetchImpl: async () => htmlResponse('<html><body>sem resultados estruturados</body></html>'),
  });
  const response = await provider.searchWeb({ query: '"ANA MARIA SILVA"', channel: 'web' });
  assert.equal(response.ok, false);
  assert.equal(response.status, 502);
  assert.match(response.erro, /formato de resultados esperado/);
});

test('DuckDuckGo Lite não atende canal de notícias', async () => {
  const provider = new DuckDuckGoLiteProvider({ fetchImpl: async () => htmlResponse('') });
  const response = await provider.searchWeb({ query: 'teste', channel: 'news' });
  assert.equal(response.ok, false);
  assert.equal(response.status, 400);
});

test('correlação nominal em diário exige nome completo e prefere âncora corporativa', () => {
  const company = { razaoSocial: 'EXEMPLO SERVICOS LTDA', nomeFantasia: 'EXEMPLO', cnpj: '12345678000190' };
  const person = { name: 'ANA MARIA SILVA' };

  assert.equal(personCorrelation(person, company, ['Contrato com EXEMPLO SERVICOS LTDA e ANA MARIA SILVA.']), 'high');
  assert.equal(personCorrelation(person, company, ['Nomeia ANA MARIA SILVA para o cargo.']), 'medium');
  assert.equal(personCorrelation(person, company, ['Nomeia ANA SILVA para o cargo.']), 'low');
});

test('diários oficiais pesquisam empresa e cada pessoa física do quadro', async () => {
  const queries = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    queries.push(new URL(url).searchParams.get('querystring'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        total_gazettes: 1,
        gazettes: [{
          date: '2026-02-10',
          territory_id: '2611606',
          territory_name: 'Recife',
          state_code: 'PE',
          url: `https://diario.test/${queries.length}`,
          excerpts: ['Contrato firmado com EXEMPLO SERVICOS LTDA e ANA MARIA SILVA.'],
        }],
      }),
    };
  };

  try {
    const result = await OfficialGazetteService.search(
      { cnpj: '12345678000190', razaoSocial: 'EXEMPLO SERVICOS LTDA', nomeFantasia: 'EXEMPLO' },
      {
        shareholders: [
          { nome_socio: 'ANA MARIA SILVA', identificador_de_socio: 2, cnpj_cpf_do_socio: '***456789**' },
          { nome_socio: 'OUTRA EMPRESA LTDA', identificador_de_socio: 1, cnpj_cpf_do_socio: '98765432000188' },
          { nome_socio: 'ANA', identificador_de_socio: 2 },
        ],
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.peopleSearched, 1);
    assert.ok(queries.includes('"ANA MARIA SILVA"'));
    assert.ok(queries.includes('"EXEMPLO SERVICOS LTDA"'));
    assert.equal(queries.includes('"OUTRA EMPRESA LTDA"'), false);
    assert.equal(queries.includes('"ANA"'), false);
    assert.ok(result.results.some((item) => item.subjectType === 'person' && item.matchStrength === 'high'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('DuckDuckGo Lite distingue bloqueio por automação de mudança de layout', async () => {
  // O DuckDuckGo responde 202 com página de desafio, não 429.
  const paginaDeDesafio = '<html><head><title>DuckDuckGo</title></head>'
    + '<body><script>var anomaly_challenge = true;</script>'
    + '<div>If this error persists, please let us know</div></body></html>';

  const provider = new DuckDuckGoLiteProvider({
    fetchImpl: async () => ({ ok: true, status: 202, text: async () => paginaDeDesafio }),
  });

  const response = await provider.searchWeb({ query: '"SOLIMP TERCEIRIZACOES"', channel: 'web' });

  assert.equal(response.ok, false, 'bloqueio não pode virar sucesso com lista vazia');
  assert.equal(response.status, 429, 'bloqueio por automação precisa ser distinguível de layout quebrado');
  assert.match(response.erro, /bloqueou a consulta/);
});
