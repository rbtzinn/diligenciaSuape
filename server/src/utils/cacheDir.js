// ==========================================================
// DILIGÊNCIA 360 — Onde os arquivos baixados podem ser gravados
//
// Os serviços da CVM baixam um ZIP grande e guardam em disco para não
// repetir o download a cada diligência. O caminho era `server/.cache/`,
// dentro do próprio código.
//
// Isso funciona no computador do analista e nunca funcionou na Vercel:
// lá o código roda a partir de um sistema de arquivos somente leitura, e
// só `/tmp` aceita escrita. O `fs.mkdir` falhava com EROFS antes mesmo
// do download começar, a exceção subia, e a tela mostrava "Cadastro CVM
// indisponível" — como se a CVM estivesse fora do ar, quando o problema
// era nosso.
//
// Aqui o diretório é resolvido uma vez: o de sempre quando dá para
// gravar, `/tmp` quando não dá. `/tmp` some entre execuções frias da
// função, então o cache acerta menos — mas errar o cache custa um
// download, e não conseguir gravar custava a consulta inteira.
// ==========================================================

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ_DO_PROJETO = path.join(__dirname, '..', '..');

const resolvidos = new Map();

/** Verdadeiro se der para criar o diretório e escrever nele. */
function gravavel(diretorio) {
  try {
    fs.mkdirSync(diretorio, { recursive: true });
    fs.accessSync(diretorio, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Diretório de cache utilizável para `nome`, já criado.
 *
 * @param {string} nome subpasta, ex.: 'cvm-funds'
 * @returns {string} caminho absoluto gravável
 */
function resolveCacheDir(nome) {
  const emCache = resolvidos.get(nome);
  if (emCache) return emCache;

  const candidatos = [
    process.env.CACHE_BASE_DIR && path.join(process.env.CACHE_BASE_DIR, nome),
    path.join(RAIZ_DO_PROJETO, '.cache', nome),
    path.join(os.tmpdir(), 'diligencia360-cache', nome),
  ].filter(Boolean);

  const escolhido = candidatos.find(gravavel) || path.join(os.tmpdir(), 'diligencia360-cache', nome);
  resolvidos.set(nome, escolhido);
  return escolhido;
}

module.exports = { resolveCacheDir };
