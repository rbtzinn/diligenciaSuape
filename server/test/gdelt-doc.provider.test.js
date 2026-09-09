const test = require('node:test');
const assert = require('node:assert/strict');

test('GDELT pesquisa um ano por padrão, sem limitar ao trimestre implícito', async () => {
  let url;
  const provider = new GdeltDocProvider({ fetchImpl: async (value) => { url = new URL(value); return jsonResponse({ articles: [] }); } });
  await provider.searchWeb({ query: '"Empresa Exemplo"' });
  assert.equal(url.searchParams.get('timespan'), '1year');
});

const {
  GdeltDocProvider,
  normalizeSeenDate,
} = require('../src/services/search/gdelt-doc.provider');
const { CompositeSearchProvider } = require('../src/services/search/composite-search.provider');

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

test('GDELT DOC usa ArtList JSON, limita registros e normaliza artigos', async () => {
  let capturedUrl;
  let capturedOptions;
  const provider = new GdeltDocProvider({
    fetchImpl: async (url, options) => {
      capturedUrl = new URL(url);
      capturedOptions = options;
      return jsonResponse({
        articles: [
          {
            title: 'Operação apura contratos públicos',
            url: 'https://www.jornal.test/politica/operacao',
            url_mobile: 'https://m.jornal.test/politica/operacao',
            domain: 'JORNAL.TEST',
            seendate: '20260828T143000Z',
            socialimage: 'https://jornal.test/imagem.jpg',
            language: 'Portuguese',
            sourcecountry: 'Brazil',
          },
          {
            title: 'URL incompatível',
            url: 'ftp://example.test/noticia',
          },
        ],
      });
    },
  });

  const result = await provider.searchWeb({
    query: '"Empresa Exemplo" investigação',
    channel: 'news',
    count: 999,
    freshness: 'pm',
    timeoutMs: 3456,
  });

  assert.equal(capturedUrl.origin, 'https://api.gdeltproject.org');
  assert.equal(capturedUrl.pathname, '/api/v2/doc/doc');
  assert.equal(capturedUrl.searchParams.get('query'), '"Empresa Exemplo" investigação');
  assert.equal(capturedUrl.searchParams.get('mode'), 'ArtList');
  assert.equal(capturedUrl.searchParams.get('format'), 'json');
  assert.equal(capturedUrl.searchParams.get('maxrecords'), '250');
  assert.equal(capturedUrl.searchParams.get('sort'), 'HybridRel');
  assert.equal(capturedUrl.searchParams.get('timespan'), '1month');
  assert.equal(capturedOptions.timeoutMs, 3456);
  assert.equal(capturedOptions.headers.Accept, 'application/json');

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'GDELT DOC 2.0');
  assert.deepEqual(result.providerSources, ['gdelt-doc']);
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0], {
    title: 'Operação apura contratos públicos',
    url: 'https://www.jornal.test/politica/operacao',
    domain: 'jornal.test',
    snippet: '',
    publishedAt: '2026-08-28T14:30:00Z',
    seenDate: '20260828T143000Z',
    sourceName: 'jornal.test',
    language: 'Portuguese',
    sourceCountry: 'Brazil',
    socialImage: 'https://jornal.test/imagem.jpg',
    mobileUrl: 'https://m.jornal.test/politica/operacao',
    providerSources: ['gdelt-doc'],
  });
  assert.equal(result.attempts[0].providerId, 'gdelt-doc');
  assert.equal(result.attempts[0].resultCount, 1);
});

test('GDELT DOC preserva erro HTTP e detalhe retornado pelo upstream', async () => {
  const provider = new GdeltDocProvider({
    fetchImpl: async () => textResponse('{"message":"query too short"}', { ok: false, status: 400 }),
  });

  const result = await provider.searchWeb({ query: 'x', channel: 'news' });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.erro, /query too short/);
  assert.equal(result.results.length, 0);
  assert.equal(result.attempts[0].ok, false);
});

test('GDELT DOC não converte resposta inválida em ausência de notícias', async (t) => {
  await t.test('JSON inválido', async () => {
    const provider = new GdeltDocProvider({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('invalid json'); },
      }),
    });

    const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.erro, /JSON inválido/);
  });

  await t.test('schema sem articles', async () => {
    const provider = new GdeltDocProvider({
      fetchImpl: async () => jsonResponse({ status: 'ok' }),
    });

    const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.erro, /lista de artigos/);
  });
});

test('GDELT DOC diferencia timeout e rejeita canal web sem chamar a rede', async (t) => {
  await t.test('timeout', async () => {
    const provider = new GdeltDocProvider({
      fetchImpl: async () => { throw new Error('Tempo limite de consulta esgotado (timeout)'); },
    });

    const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 504);
    assert.match(result.erro, /Tempo limite/);
  });

  await t.test('canal incompatível', async () => {
    let called = false;
    const provider = new GdeltDocProvider({
      fetchImpl: async () => {
        called = true;
        return jsonResponse({ articles: [] });
      },
    });

    const result = await provider.searchWeb({ query: 'empresa', channel: 'web' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(called, false);
  });
});

test('normaliza datas compactas do GDELT sem alterar valor desconhecido', () => {
  assert.equal(normalizeSeenDate('20260828T143000Z'), '2026-08-28T14:30:00Z');
  assert.equal(normalizeSeenDate('valor-desconhecido'), 'valor-desconhecido');
  assert.equal(normalizeSeenDate(''), undefined);
});

test('busca composta registra os provedores na ordem de preferência', () => {
  const provider = new CompositeSearchProvider({
    brave: { apiKey: '' },
  });

  assert.deepEqual(
    provider.providers.map((source) => source.id),
    ['brave', 'google-news-rss', 'gdelt-doc', 'searxng', 'duckduckgo-lite'],
  );
});
