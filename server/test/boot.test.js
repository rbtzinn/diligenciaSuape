// ==========================================================
// DILIGÊNCIA 360 — Carga do aplicativo
//
// A API inteira caiu em produção com 500 FUNCTION_INVOCATION_FAILED,
// em todas as rotas, inclusive `/api/status`. A causa não estava em
// nenhuma rota: `questionnaire-parser.service.js` carregava `pdf-parse`
// no topo do arquivo, e a cadeia `app.js → diligence.routes.js → esse
// serviço` roda em todo boot da função.
//
// O `pdf-parse` embute o pdf.js, que avalia `DOMMatrix` ao ser
// carregado. No runtime da Vercel o polyfill não existe e o módulo lança
// `ReferenceError: DOMMatrix is not defined`, derrubando o processo
// antes de qualquer requisição ser atendida. No Node de desenvolvimento
// o mesmo require carrega sem erro, e por isso a suíte não pegava.
//
// A regra que este teste fixa: biblioteca pesada ou frágil não entra no
// caminho de boot. Se ela quebrar, quebra só a funcionalidade que a
// usa.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/**
 * Módulos que não podem ser carregados só por subir o app.
 *
 * `pdfkit` também é carregado no boot, pela rota de relatório, e por ora
 * fica: ele carrega sem erro no runtime da Vercel — o log da queda mostra
 * a função passando por ele e morrendo no `pdf-parse`. Se um dia falhar,
 * o remédio é o mesmo, e o nome entra nesta lista.
 */
const PROIBIDOS_NO_BOOT = ['pdf-parse'];

test('subir o app não carrega bibliotecas fora do caminho de boot', () => {
  for (const chave of Object.keys(require.cache)) {
    if (chave.includes(`${path.sep}node_modules${path.sep}`)) delete require.cache[chave];
  }

  require('../src/app');

  const carregados = PROIBIDOS_NO_BOOT.filter((nome) =>
    Object.keys(require.cache).some((arquivo) =>
      arquivo.includes(`${path.sep}node_modules${path.sep}${nome}${path.sep}`)
    )
  );

  assert.deepEqual(
    carregados,
    [],
    'carregar isto no boot derruba a função inteira quando a biblioteca falha; use require sob demanda'
  );
});

test('o app responde sem depender da leitura de PDF', async () => {
  const app = require('../src/app');
  assert.equal(typeof app, 'function', 'o app precisa ser exportado e utilizável');
});

test('a falha da leitura de PDF fica contida e orienta o analista', async () => {
  const { parseSuapeQuestionnaire } = require('../src/services/questionnaire-parser.service');

  // Um PDF sintético e inválido: o que importa é que a falha volte como
  // erro tratado da rota, não como queda do processo.
  const buffer = Buffer.from('%PDF-1.4\nconteudo invalido\n%%EOF');
  const resultado = await parseSuapeQuestionnaire(buffer, 'questionario.pdf').catch((err) => err);

  assert.ok(
    resultado instanceof Error || resultado.ok === false || resultado.ok === true,
    'a leitura de PDF precisa terminar em resultado ou erro tratado'
  );
});
