const test = require('node:test');
const assert = require('node:assert/strict');

const { GoogleCseProvider } = require('../src/services/search/google-cse.provider');

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

const RESPOSTA_COM_ITENS = {
  searchInformation: { totalResults: '128' },
  items: [
    {
      title: 'Acórdão TCE-PE sobre contrato de terceirização',
      link: 'https://www.tce.pe.gov.br/acordao/123',
      snippet: 'O relator determinou a rescisão do contrato.',
      pagemap: { metatags: [{ 'article:published_time': '2026-03-18T10:00:00Z' }] },
    },
    { title: '', link: 'https://exemplo.com/sem-titulo', snippet: 'ignorado' },
    { title: 'Sem link', link: '', snippet: 'ignorado' },
  ],
};

test('exige chave e identificador do mecanismo antes de consultar', async () => {
  const provider = new GoogleCseProvider({ apiKey: '', searchEngineId: '' });
  assert.equal(provider.isConfigured(), false);

  const resposta = await provider.searchWeb({ query: 'teste', channel: 'web' });
  assert.equal(resposta.ok, false);
  assert.equal(resposta.status, 503);
  assert.match(resposta.erro, /GOOGLE_CSE_API_KEY/);
});

test('normaliza resultados e descarta item sem título ou sem link', async () => {
  const provider = new GoogleCseProvider({
    apiKey: 'chave',
    searchEngineId: 'cx',
    fetchImpl: async () => jsonResponse(RESPOSTA_COM_ITENS),
  });

  const resposta = await provider.searchWeb({ query: '"EMPRESA" site:tce.pe.gov.br', channel: 'web' });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.results.length, 1);
  assert.equal(resposta.results[0].domain, 'tce.pe.gov.br');
  assert.equal(resposta.results[0].publishedAt, '2026-03-18T10:00:00.000Z');
  assert.equal(resposta.totalFound, 128);
});

test('a consulta carrega chave, mecanismo, idioma e país', async () => {
  let urlChamada = '';
  const provider = new GoogleCseProvider({
    apiKey: 'chave-secreta',
    searchEngineId: 'cx-123',
    fetchImpl: async (url) => {
      urlChamada = url;
      return jsonResponse({ items: [] });
    },
  });

  await provider.searchWeb({ query: 'consulta ancorada', channel: 'web', count: 10 });
  const url = new URL(urlChamada);

  assert.equal(url.searchParams.get('key'), 'chave-secreta');
  assert.equal(url.searchParams.get('cx'), 'cx-123');
  assert.equal(url.searchParams.get('q'), 'consulta ancorada');
  assert.equal(url.searchParams.get('lr'), 'lang_pt');
  assert.equal(url.searchParams.get('cr'), 'countryBR');
});

test('zero resultado é resposta legítima, não falha', async () => {
  const provider = new GoogleCseProvider({
    apiKey: 'chave',
    searchEngineId: 'cx',
    // A API omite "items" quando nada casa com a consulta.
    fetchImpl: async () => jsonResponse({ searchInformation: { totalResults: '0' } }),
  });

  const resposta = await provider.searchWeb({ query: 'nada casa', channel: 'web' });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.results.length, 0);
});

test('cota diária esgotada vira fonte indisponível, não ausência de achado', async () => {
  const provider = new GoogleCseProvider({
    apiKey: 'chave',
    searchEngineId: 'cx',
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 429 }),
  });

  const resposta = await provider.searchWeb({ query: 'consulta', channel: 'web' });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.status, 429);
  assert.match(resposta.erro, /[Cc]ota diária/);
});

test('chave recusada explica a causa provável', async () => {
  const provider = new GoogleCseProvider({
    apiKey: 'chave',
    searchEngineId: 'cx',
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 403 }),
  });

  const resposta = await provider.searchWeb({ query: 'consulta', channel: 'web' });

  assert.equal(resposta.status, 403);
  assert.match(resposta.erro, /Custom Search API/);
});

test('não atende o canal de notícias, para preservar a cota diária', async () => {
  const provider = new GoogleCseProvider({ apiKey: 'chave', searchEngineId: 'cx' });

  assert.equal(provider.supportsChannel('news'), false);
  assert.equal(provider.supportsChannel('web'), true);

  const resposta = await provider.searchWeb({ query: 'teste', channel: 'news' });
  assert.equal(resposta.ok, false);
  assert.equal(resposta.status, 400);
});

test('entra na busca combinada assim que recebe as credenciais', async () => {
  const anterior = { key: process.env.GOOGLE_CSE_API_KEY, cx: process.env.GOOGLE_CSE_CX };
  process.env.GOOGLE_CSE_API_KEY = 'chave';
  process.env.GOOGLE_CSE_CX = 'cx';
  delete require.cache[require.resolve('../src/services/search/composite-search.provider')];

  try {
    const { CompositeSearchProvider } = require('../src/services/search/composite-search.provider');
    const composto = new CompositeSearchProvider({ persistentUse: true });
    const cse = composto.providers.find((provider) => provider.id === 'google-cse');

    assert.ok(cse, 'o provedor precisa estar registrado na busca combinada');
    assert.equal(cse.isConfigured(), true);
    assert.equal(composto.supportsChannel('web'), true);
  } finally {
    if (anterior.key === undefined) delete process.env.GOOGLE_CSE_API_KEY;
    else process.env.GOOGLE_CSE_API_KEY = anterior.key;
    if (anterior.cx === undefined) delete process.env.GOOGLE_CSE_CX;
    else process.env.GOOGLE_CSE_CX = anterior.cx;
    delete require.cache[require.resolve('../src/services/search/composite-search.provider')];
  }
});
