const test = require('node:test');
const assert = require('node:assert/strict');
const { OfficialGazetteService, PE_TERRITORY_IDS } = require('../src/services/official-gazette.service');

const EMPRESA = { cnpj: '10811370000162', razaoSocial: 'GUERRA CONSTRUCOES LTDA' };

function captureRequests() {
  const urls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    urls.push(new URL(String(url)));
    return { ok: true, status: 200, json: async () => ({ total_gazettes: 0, gazettes: [] }) };
  };
  return { urls, restore: () => { global.fetch = originalFetch; } };
}

test('sem recorte explícito, a busca fica nos municípios de PE e declara a lacuna', async () => {
  OfficialGazetteService.clearCache();
  const { urls, restore } = captureRequests();
  try {
    const result = await OfficialGazetteService.search(EMPRESA);
    assert.ok(urls.length > 0);
    for (const url of urls) {
      assert.deepEqual(url.searchParams.getAll('territory_ids'), [...PE_TERRITORY_IDS]);
    }
    assert.equal(result.ok, true);
    assert.equal(result.territorialScope.territoryIds.length, PE_TERRITORY_IDS.length);
    assert.match(result.territorialScope.limitacao, /Ipojuca/);
  } finally {
    restore();
  }
});

test('lista vazia explícita continua pesquisando todos os territórios', async () => {
  OfficialGazetteService.clearCache();
  const { urls, restore } = captureRequests();
  try {
    const result = await OfficialGazetteService.search(EMPRESA, { territoryIds: [] });
    for (const url of urls) assert.deepEqual(url.searchParams.getAll('territory_ids'), []);
    assert.doesNotMatch(result.territorialScope.limitacao, /Ipojuca/);
  } finally {
    restore();
  }
});
