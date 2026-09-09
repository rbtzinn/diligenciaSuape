const test = require('node:test');
const assert = require('node:assert/strict');
const { researchNews } = require('../src/services/ai/news-research.service');

test('segunda rodada usa resultados reais, deduplica consultas e ignora links inseguros', async () => {
  let rounds = 0;
  const output = await researchNews({}, {}, {
    propose: async (_input, options) => {
      rounds++;
      if (rounds === 2) assert.equal(options.searchContext.resultados[0].title, 'Fonte real');
      return { consultas: [{ termo: 'Empresa notícia' }, { termo: `Empresa rodada ${rounds}` }] };
    },
    execute: async (queries) => ({ ok: true,
      consultasExecutadas: queries.map((q) => ({ ...q, ok: true })),
      resultados: [{ title: 'Fonte real', snippet: 'Trecho', url: 'https://example.com/noticia' },
        { title: 'Inseguro', url: 'javascript:alert(1)' }],
    }),
  });
  assert.equal(rounds, 2);
  assert.equal(output.consultasExecutadas.length, 3);
  assert.equal(output.resultados.length, 1);
});

test('preserva links quando o modelo falha na segunda rodada', async () => {
  let calls = 0;
  const output = await researchNews({}, {}, {
    propose: async () => { if (calls++) throw new Error('Cota esgotada'); return { consultas: [{ termo: 'Empresa' }] }; },
    execute: async () => ({ ok: true, consultasExecutadas: [{ ok: true }], resultados: [{ url: 'https://example.com', title: 'Notícia', snippet: '' }] }),
  });
  assert.equal(output.ok, true);
  assert.equal(output.resultados.length, 1);
  assert.equal(output.aviso, 'Cota esgotada');
});

test('falha de todos os buscadores não é apresentada como busca sem achados', async () => {
  const output = await researchNews({}, {}, {
    propose: async () => ({ consultas: [{ termo: 'Empresa' }] }),
    execute: async () => ({ ok: true, resultados: [], consultasExecutadas: [{ ok: false }] }),
  });
  assert.equal(output.ok, false);
  assert.ok(output.erro);
});
