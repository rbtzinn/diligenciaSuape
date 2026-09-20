// ==========================================================
// DILIGÊNCIA 360 — Diretório de cache gravável
//
// Os dois serviços da CVM gravavam o ZIP baixado em `server/.cache/`.
// Na Vercel o código roda de um sistema de arquivos somente leitura, o
// `mkdir` falhava com EROFS antes do download, e a diligência mostrava
// "Cadastro CVM indisponível" — acusando a CVM por um erro nosso.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveCacheDir } = require('../src/utils/cacheDir');

test('devolve um diretório que existe e aceita escrita', () => {
  const diretorio = resolveCacheDir('teste-gravavel');

  assert.ok(fs.existsSync(diretorio), 'o diretório precisa já vir criado');
  fs.writeFileSync(path.join(diretorio, 'sonda.txt'), 'ok');
  assert.equal(fs.readFileSync(path.join(diretorio, 'sonda.txt'), 'utf8'), 'ok');
});

test('base indicada por variável de ambiente é respeitada', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-base-'));
  const anterior = process.env.CACHE_BASE_DIR;
  process.env.CACHE_BASE_DIR = base;
  try {
    assert.equal(resolveCacheDir('teste-base'), path.join(base, 'teste-base'));
  } finally {
    if (anterior === undefined) delete process.env.CACHE_BASE_DIR;
    else process.env.CACHE_BASE_DIR = anterior;
  }
});

test('base inutilizável não derruba a consulta: cai para um caminho gravável', () => {
  const anterior = process.env.CACHE_BASE_DIR;
  // Caminho sob um arquivo comum: criar diretório ali é impossível.
  const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cache-ruim-')), 'arquivo');
  fs.writeFileSync(arquivo, 'não sou diretório');
  process.env.CACHE_BASE_DIR = arquivo;
  try {
    const diretorio = resolveCacheDir('teste-fallback');
    assert.ok(fs.existsSync(diretorio));
    assert.ok(
      !diretorio.startsWith(arquivo),
      'a base inutilizável não pode ser escolhida'
    );
  } finally {
    if (anterior === undefined) delete process.env.CACHE_BASE_DIR;
    else process.env.CACHE_BASE_DIR = anterior;
  }
});

test('nenhum serviço da CVM grava dentro do código da aplicação', () => {
  for (const arquivo of ['cvm-fund-network.service.js', 'cvm-governance.service.js']) {
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', arquivo), 'utf8');
    assert.doesNotMatch(
      fonte,
      /'\.\.',\s*'\.\.',\s*'\.cache'/,
      `${arquivo} fixa o cache dentro do projeto; na Vercel esse caminho é somente leitura`
    );
  }
});
