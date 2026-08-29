const test = require('node:test');
const assert = require('node:assert/strict');

const { BraveSearchProvider } = require('../src/services/search/brave-search.provider');
const { GoogleNewsRssProvider } = require('../src/services/search/google-news-rss.provider');
const {
  CompositeSearchProvider,
  canonicalizeUrl,
} = require('../src/services/search/composite-search.provider');

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

function stubProvider({
  id,
  channels = ['news', 'web'],
  configured = true,
  response,
  calls,
}) {
  return {
    id,
    name: id,
    isConfigured: () => configured,
    supportsChannel: (channel) => channels.includes(channel),
    searchWeb: async (options) => {
      calls?.push(options);
      return typeof response === 'function' ? response(options) : response;
    },
  };
}

test('Brave News usa endpoint, limites e schema próprios de notícias', async () => {
  let capturedUrl;
  let capturedOptions;
  const provider = new BraveSearchProvider({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      capturedUrl = new URL(url);
      capturedOptions = options;
      return jsonResponse({
        query: { more_results_available: true },
        results: [{
          title: 'Operação apura contratos públicos',
          url: 'https://jornal.test/noticia',
          description: 'Descrição principal.',
          extra_snippets: ['Contexto adicional.', 'Descrição principal.'],
          page_age: '2 hours ago',
        }],
      });
    },
  });

  const result = await provider.searchWeb({
    query: 'empresa investigação',
    channel: 'news',
    count: 80,
    offset: 99,
    freshness: 'pw',
    timeoutMs: 3210,
  });

  assert.equal(capturedUrl.pathname, '/res/v1/news/search');
  assert.equal(capturedUrl.searchParams.get('count'), '50');
  assert.equal(capturedUrl.searchParams.get('offset'), '9');
  assert.equal(capturedUrl.searchParams.get('freshness'), 'pw');
  assert.equal(capturedUrl.searchParams.get('extra_snippets'), 'true');
  assert.equal(capturedOptions.headers['X-Subscription-Token'], 'test-key');
  assert.equal(capturedOptions.timeoutMs, 3210);
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'Brave News Search API');
  assert.equal(result.results[0].snippet, 'Descrição principal. Contexto adicional.');
  assert.deepEqual(result.results[0].providerSources, ['brave-news']);
  assert.equal(result.hasMore, true);
  assert.equal(result.attempts[0].channel, 'news');
});

test('Brave Web preserva schema web e limita a vinte resultados por página', async () => {
  let capturedUrl;
  const provider = new BraveSearchProvider({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      capturedUrl = new URL(url);
      return jsonResponse({
        web: {
          results: [{
            title: 'Cadastro oficial',
            url: 'https://www.gov.test/cadastro',
            description: 'Resultado cadastral.',
          }],
        },
      });
    },
  });

  const result = await provider.searchWeb({ query: 'empresa cnpj', channel: 'web', count: 40 });

  assert.equal(capturedUrl.pathname, '/res/v1/web/search');
  assert.equal(capturedUrl.searchParams.get('count'), '20');
  assert.equal(capturedUrl.searchParams.has('extra_snippets'), false);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].domain, 'gov.test');
  assert.deepEqual(result.providerSources, ['brave-web']);
});

test('Brave expõe erro HTTP real sem convertê-lo em resultado vazio bem-sucedido', async () => {
  const provider = new BraveSearchProvider({
    apiKey: 'test-key',
    fetchImpl: async () => textResponse('{"message":"rate limit"}', { ok: false, status: 429 }),
  });

  const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });

  assert.equal(result.ok, false);
  assert.equal(result.status, 429);
  assert.match(result.erro, /rate limit/);
  assert.equal(result.results.length, 0);
  assert.equal(result.attempts[0].ok, false);
});

test('Brave detecta JSON inválido como falha de upstream', async () => {
  const provider = new BraveSearchProvider({
    apiKey: 'test-key',
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

test('Google News RSS interpreta CDATA, HTML, entidades e origem', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Pesquisa</title>
        <item>
          <title><![CDATA[Empresa &amp; Sócios em apuração]]></title>
          <link>https://news.google.com/articles/abc?x=1&amp;y=2</link>
          <pubDate>Fri, 28 Aug 2026 12:00:00 GMT</pubDate>
          <description><![CDATA[<p>Texto &amp; detalhes &#xE9;.</p>]]></description>
          <source url="https://www.jornal.test/editoria">Jornal &amp; Dados</source>
        </item>
      </channel>
    </rss>`;
  let capturedUrl;
  let capturedOptions;
  const provider = new GoogleNewsRssProvider({
    fetchImpl: async (url, options) => {
      capturedUrl = new URL(url);
      capturedOptions = options;
      return textResponse(xml);
    },
  });

  const result = await provider.searchWeb({
    query: 'Empresa & Sócios',
    channel: 'news',
    count: 5,
    timeoutMs: 2780,
  });

  assert.equal(capturedUrl.searchParams.get('q'), 'Empresa & Sócios');
  assert.equal(capturedOptions.timeoutMs, 2780);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].title, 'Empresa & Sócios em apuração');
  assert.equal(result.results[0].url, 'https://news.google.com/articles/abc?x=1&y=2');
  assert.equal(result.results[0].snippet, 'Texto & detalhes é.');
  assert.equal(result.results[0].domain, 'jornal.test');
  assert.equal(result.results[0].sourceName, 'Jornal & Dados');
  assert.deepEqual(result.results[0].providerSources, ['google-news-rss']);
});

test('Google News RSS preserva falhas HTTP e XML inválido', async (t) => {
  await t.test('HTTP não OK', async () => {
    const provider = new GoogleNewsRssProvider({
      fetchImpl: async () => textResponse('indisponível', { ok: false, status: 503 }),
    });
    const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
  });

  await t.test('XML malformado', async () => {
    const provider = new GoogleNewsRssProvider({
      fetchImpl: async () => textResponse('<rss><channel><item><title>Sem fechamento</item></channel></rss>'),
    });
    const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.erro, /XML inválido/);
  });
});

test('Google News RSS diferencia timeout de outras falhas', async () => {
  const provider = new GoogleNewsRssProvider({
    fetchImpl: async () => { throw new Error('Tempo limite de consulta esgotado (timeout)'); },
  });

  const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });

  assert.equal(result.ok, false);
  assert.equal(result.status, 504);
  assert.match(result.erro, /Tempo limite/);
});

test('busca composta consulta fontes de notícias em paralelo e deduplica URLs canônicas', async () => {
  const calls = [];
  const brave = stubProvider({
    id: 'brave-news',
    channels: ['news'],
    calls,
    response: {
      ok: true,
      status: 200,
      provider: 'Brave News',
      providerSources: ['brave-news'],
      results: [
        {
          title: 'Empresa é alvo de operação',
          url: 'https://www.example.test/noticia/?utm_source=busca&id=7#trecho',
          domain: 'example.test',
          snippet: 'Trecho curto.',
        },
        {
          title: 'Segundo resultado',
          url: 'https://outro.test/segundo',
          domain: 'outro.test',
          snippet: 'Segundo.',
        },
      ],
      attempts: [{ provider: 'Brave News', providerId: 'brave-news', ok: true, status: 200, resultCount: 2 }],
      partial: false,
      hasMore: false,
    },
  });
  const rss = stubProvider({
    id: 'google-news-rss',
    channels: ['news'],
    calls,
    response: {
      ok: true,
      status: 200,
      provider: 'Google News RSS',
      providerSources: ['google-news-rss'],
      results: [
        {
          title: 'Empresa é alvo de operação',
          url: 'https://example.test/noticia?id=7&utm_medium=rss',
          domain: 'example.test',
          snippet: 'Trecho mais completo sobre a operação e os contratos investigados.',
        },
        {
          title: 'Terceiro resultado',
          url: 'https://terceiro.test/noticia',
          domain: 'terceiro.test',
          snippet: 'Terceiro.',
        },
      ],
      partial: false,
      hasMore: false,
    },
  });
  const provider = new CompositeSearchProvider({ providers: [brave, rss] });

  const result = await provider.searchWeb({
    query: 'empresa operação',
    channel: 'news',
    count: 10,
    freshness: 'pm',
    priority: 'P0',
    purpose: 'company_adverse',
    timeoutMs: 4321,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.channel === 'news'), true);
  assert.equal(calls.every((call) => call.priority === 'P0'), true);
  assert.equal(calls.every((call) => call.purpose === 'company_adverse'), true);
  assert.equal(calls.every((call) => call.timeoutMs === 4321), true);
  assert.equal(result.ok, true);
  assert.equal(result.partial, false);
  assert.equal(result.results.length, 3);
  assert.equal(result.results[0].url, 'https://example.test/noticia?id=7');
  assert.match(result.results[0].snippet, /mais completo/);
  assert.deepEqual(result.results[0].providerSources, ['brave-news', 'google-news-rss']);
  assert.deepEqual(result.providerSources, ['brave-news', 'google-news-rss']);
  assert.equal(result.attempts.length, 2);
});

test('busca composta sinaliza cobertura parcial quando uma fonte falha', async () => {
  const provider = new CompositeSearchProvider({
    providers: [
      stubProvider({
        id: 'fonte-ok',
        response: {
          ok: true,
          status: 200,
          provider: 'Fonte OK',
          results: [{ title: 'Notícia', url: 'https://fonte.test/noticia', snippet: 'Texto.' }],
        },
      }),
      stubProvider({
        id: 'fonte-falhou',
        response: {
          ok: false,
          status: 504,
          erro: 'Timeout',
          provider: 'Fonte falhou',
          results: [],
        },
      }),
    ],
  });

  const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });

  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts.find((attempt) => !attempt.ok).status, 504);
});

test('busca composta registra fonte opcional não configurada sem rebaixar fontes ativas', async () => {
  const provider = new CompositeSearchProvider({
    providers: [
      stubProvider({
        id: 'fonte-sem-chave',
        configured: false,
        response: { ok: true, status: 200, results: [] },
      }),
      stubProvider({
        id: 'fonte-aberta',
        response: {
          ok: true,
          status: 200,
          results: [{ title: 'Notícia', url: 'https://aberta.test/noticia' }],
        },
      }),
    ],
  });

  const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });

  assert.equal(result.ok, true);
  assert.equal(result.partial, false);
  assert.equal(result.results.length, 1);
  assert.equal(result.attempts[0].providerId, 'fonte-sem-chave');
  assert.equal(result.attempts[0].skipped, true);
  assert.equal(result.attempts[0].status, 503);
});

test('busca composta retorna falha quando todos os provedores falham', async () => {
  const provider = new CompositeSearchProvider({
    providers: [stubProvider({
      id: 'fonte-falhou',
      response: { ok: false, status: 502, erro: 'Falha upstream', results: [] },
    })],
  });

  const result = await provider.searchWeb({ query: 'empresa', channel: 'news' });

  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.equal(result.partial, false);
  assert.match(result.erro, /Falha upstream/);
});

test('busca composta só chama provedores aplicáveis ao canal solicitado', async () => {
  const webCalls = [];
  const newsCalls = [];
  const provider = new CompositeSearchProvider({
    providers: [
      stubProvider({
        id: 'web-only',
        channels: ['web'],
        calls: webCalls,
        response: { ok: true, status: 200, results: [] },
      }),
      stubProvider({
        id: 'news-only',
        channels: ['news'],
        calls: newsCalls,
        response: { ok: true, status: 200, results: [] },
      }),
    ],
  });

  const result = await provider.searchWeb({ query: 'cadastro', channel: 'web' });

  assert.equal(result.ok, true);
  assert.equal(webCalls.length, 1);
  assert.equal(newsCalls.length, 0);
});

test('canonicalização remove rastreamento sem remover parâmetros substantivos', () => {
  assert.equal(
    canonicalizeUrl('https://WWW.Example.test/noticia/?id=9&utm_source=x&fbclid=y#topo'),
    'https://example.test/noticia?id=9',
  );
});

test('Brave exige autorização explícita para persistir resultados em dossiês', () => {
  const transientProvider = new BraveSearchProvider({ apiKey: 'token-de-teste' });
  const licensedProvider = new BraveSearchProvider({
    apiKey: 'token-de-teste',
    allowPersistentResults: true,
  });

  assert.equal(transientProvider.allowsPersistentUse(), false);
  assert.equal(licensedProvider.allowsPersistentUse(), true);
});
