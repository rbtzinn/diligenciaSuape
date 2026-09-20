// ==========================================================
// DILIGÊNCIA 360 — Bing News RSS
//
// Segunda fonte gratuita de notícia. O que estes testes fixam é o que
// ela acrescenta ao Google News: o endereço do veículo em vez de um
// redirecionamento, e falha declarada em vez de lista vazia.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const { BingNewsRssProvider } = require('../src/services/search/bing-news-rss.provider');

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:News="https://www.bing.com/news">
  <channel>
    <title>Bing News</title>
    <item>
      <title><![CDATA[Operação apura contratos no porto]]></title>
      <link>https://www.jornaldopovo.test/economia/operacao-porto</link>
      <description>O Ministério P&#250;blico apura contratos.</description>
      <pubDate>Fri, 18 Sep 2026 10:12:00 GMT</pubDate>
      <News:Source>Jornal do Povo</News:Source>
    </item>
    <item>
      <title>Sem link</title>
      <description>Item incompleto</description>
    </item>
    <item>
      <title>Protocolo inaceitável</title>
      <link>ftp://arquivo.test/noticia</link>
    </item>
  </channel>
</rss>`;

function rssResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => body };
}

test('a consulta vai em português do Brasil e pede o feed, não a página', async () => {
  let url;
  const provider = new BingNewsRssProvider({
    fetchImpl: async (value) => { url = new URL(value); return rssResponse(FEED); },
  });

  await provider.searchWeb({ query: '"TMP Terminais"' });

  assert.equal(url.searchParams.get('q'), '"TMP Terminais"');
  assert.equal(url.searchParams.get('format'), 'RSS');
  assert.equal(url.searchParams.get('setmkt'), 'pt-BR');
  assert.equal(url.searchParams.get('cc'), 'BR');
});

test('o domínio sai do endereço do veículo, que é a evidência do dossiê', async () => {
  const provider = new BingNewsRssProvider({ fetchImpl: async () => rssResponse(FEED) });

  const resultado = await provider.searchWeb({ query: 'porto' });

  assert.equal(resultado.ok, true);
  assert.equal(resultado.results.length, 1, 'item sem link e link não-http são descartados');

  const [noticia] = resultado.results;
  assert.equal(noticia.url, 'https://www.jornaldopovo.test/economia/operacao-porto');
  assert.equal(noticia.domain, 'jornaldopovo.test', 'sem o www e vindo do link, não de um rótulo');
  assert.equal(noticia.sourceName, 'Jornal do Povo');
  assert.equal(noticia.title, 'Operação apura contratos no porto', 'CDATA precisa ser desembrulhado');
  assert.match(noticia.snippet, /Ministério Público/, 'entidade numérica precisa ser decodificada');
  assert.deepEqual(noticia.providerSources, ['bing-news-rss']);
});

test('página HTML no lugar do feed é falha declarada, nunca "nada consta"', async () => {
  const provider = new BingNewsRssProvider({
    fetchImpl: async () => rssResponse('<!doctype html><html><body>sem resultados</body></html>'),
  });

  const resultado = await provider.searchWeb({ query: 'empresa' });

  assert.equal(resultado.ok, false);
  assert.equal(resultado.results.length, 0);
  assert.match(resultado.erro, /feed/i);
});

test('erro HTTP e tempo esgotado chegam com o motivo, não como lista vazia', async () => {
  const comErro = new BingNewsRssProvider({ fetchImpl: async () => rssResponse('', { ok: false, status: 429 }) });
  const negado = await comErro.searchWeb({ query: 'empresa' });
  assert.equal(negado.ok, false);
  assert.equal(negado.status, 429);

  const lento = new BingNewsRssProvider({
    fetchImpl: async () => { throw new Error('tempo limite excedido'); },
  });
  const estourado = await lento.searchWeb({ query: 'empresa' });
  assert.equal(estourado.status, 504);
  assert.match(estourado.erro, /Tempo limite/i);
});

test('só atende o canal de notícias', async () => {
  const provider = new BingNewsRssProvider({ fetchImpl: async () => rssResponse(FEED) });

  assert.equal(provider.supportsChannel('news'), true);
  assert.equal(provider.supportsChannel('web'), false);

  const recusado = await provider.searchWeb({ query: 'empresa', channel: 'web' });
  assert.equal(recusado.ok, false);
  assert.equal(recusado.status, 400);
});

test('entra na busca composta gratuita, ao lado do Google News', () => {
  const { CompositeSearchProvider } = require('../src/services/search/composite-search.provider');
  const composto = new CompositeSearchProvider({ persistentUse: true, freeOnly: true });

  const ids = composto.providers.map((provider) => provider.id);
  assert.ok(ids.includes('bing-news-rss'), `provedores: ${ids.join(', ')}`);
  assert.ok(ids.includes('google-news-rss'), 'a fonte nova soma, não substitui');
});
