// ==========================================================
// DILIGÊNCIA 360 — Preenchimento da planilha oficial de SUAPE
//
// Escrever dentro do arquivo verdadeiro só vale se nenhuma fórmula for
// tocada e se a marca cair na coluna certa. As fórmulas de red flag
// leem SÓ a coluna L (`N23 = OR(L23="X"; L24="X")`); a coluna M é a
// marca visível do "Não". Trocar as duas inverteria a classificação sem
// que nada acusasse — é o defeito mais caro possível aqui.
// ==========================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const { setGoogleSheetsClientForTests } = require('../src/config/google-sheets');
const { IntegritySheetRepository } = require('../src/repositories/integrity-sheet.repository');

/**
 * Células de fórmula, por aba.
 *
 * A lista precisa ser por aba porque os endereços colidem: na aba de
 * Avaliação, `D8` é `=CheckList!D6` — fórmula; na CheckList, `D8` é a
 * data de constituição — entrada. Uma lista só de endereços proibiria
 * justamente a célula que o sistema precisa escrever.
 */
const CELULAS_DE_FORMULA = {
  'Avaliação de Integridade': [
    'J16', 'N23', 'N28', 'N29', 'N40', 'L44', 'M44', 'B48',
    'D8', 'K8', 'D9', 'D10', 'K10', 'D11', 'D12', 'D13',
  ],
  CheckList: ['Q187', 'R187', 'Q231', 'R231'],
};

function enderecosEscritos(escritas) {
  return escritas.map((e) => e.range);
}

function valorEm(escritas, range) {
  return escritas.find((e) => e.range === range)?.values?.[0]?.[0];
}

test('nenhuma célula de fórmula é escrita', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    cadastro: { razaoSocial: 'X' },
    redFlags: { '4.4': true },
    maturidade: { '8.1': true },
    cadastros: { ceis: true },
  });

  for (const [aba, celulas] of Object.entries(CELULAS_DE_FORMULA)) {
    for (const celula of celulas) {
      const alvo = `'${aba}'!${celula}`;
      assert.ok(
        !enderecosEscritos(escritas).includes(alvo),
        `${alvo} guarda fórmula oficial e não pode ser sobrescrita`,
      );
    }
  }
});

test('o X da red flag vai na coluna L, que é a única que as fórmulas leem', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    redFlags: { '4.4': true, '5.2': false },
  });

  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!L23"), 'X', 'sim marca a coluna L');
  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!M23"), '', 'sim não marca a coluna Não');

  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!L24"), '', 'não pode marcar L, que dispara o gatilho');
  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!M24"), 'X', 'não marca a coluna M');
});

test('cada item cai na linha que a fórmula espera', () => {
  // `N28` lista as linhas uma a uma: L28, L30, L31, L32, L33, L34, L35,
  // L36. E `N29` é só L29. Então 7.1 tem de ser a linha 29 e 7.2 a 28 —
  // trocá-las mudaria Médio por Alto.
  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG['7.1'], 29);
  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG['7.2'], 28);
  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG['4.4'], 23);
  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG['5.2'], 24);
  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG.alcadaConselho, 40);
});

test('item sem resposta limpa as duas colunas, e não vira "não"', () => {
  const escritas = IntegritySheetRepository.montarEscritas({ redFlags: { '4.4': null } });

  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!L23"), '');
  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!M23"), '');
});

test('identificação da empresa vai para a CheckList, que é onde o dado entra', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    cadastro: {
      razaoSocial: 'TMP TERMINAIS S/A',
      cnpj: '56.211.027/0002-69',
      dataConstituicao: '05/05/2025',
    },
  });

  assert.equal(valorEm(escritas, "'CheckList'!D6"), 'TMP TERMINAIS S/A');
  assert.equal(valorEm(escritas, "'CheckList'!N6"), '56.211.027/0002-69');
  // `D8` da CheckList é entrada; `D8` da Avaliação é `=CheckList!D6`.
  assert.equal(valorEm(escritas, "'CheckList'!D8"), '05/05/2025');
  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!D8"), undefined);
});

test('maturidade sem resposta volta para "Selecione", o estado inicial da lista', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    maturidade: { '8.1': true, '8.2': false, '8.3': null },
  });

  assert.equal(valorEm(escritas, "'CheckList'!C187"), 'SIM');
  assert.equal(valorEm(escritas, "'CheckList'!C191"), 'NÃO');
  assert.equal(valorEm(escritas, "'CheckList'!C195"), 'Selecione');
});

test('os oito cadastros ocupam N231 a N238, na ordem do item 9.2', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    cadastros: { ceis: true, decisoesAdversas: true },
  });

  assert.equal(valorEm(escritas, "'CheckList'!N231"), 'x', 'CEIS é o primeiro');
  assert.equal(valorEm(escritas, "'CheckList'!N232"), '', 'CNEP não consta');
  assert.equal(valorEm(escritas, "'CheckList'!N238"), 'x', 'decisões adversas é o oitavo');
});

// ==========================================================
// Conferência: a planilha de SUAPE confere o cálculo do sistema
// ==========================================================

class PlanilhaFalsa {
  constructor({ abas = ['CheckList', 'Avaliação de Integridade'], calculado = {} } = {}) {
    this.abas = abas;
    this.calculado = calculado;
    this.escritas = null;
  }

  isConfigured() { return true; }

  async listSheetTitles() { return this.abas; }

  async batchUpdateValues(dados) { this.escritas = dados; return {}; }

  async batchGetValues(ranges) {
    return Object.fromEntries(ranges.map((range) => [range, this.calculado[range] ?? null]));
  }
}

test('divergência entre a planilha e o sistema é relatada, não engolida', async () => {
  setGoogleSheetsClientForTests(new PlanilhaFalsa({
    calculado: { "'Avaliação de Integridade'!J16": 'Muito Alto' },
  }));

  const resultado = await IntegritySheetRepository.preencher({
    cadastro: { razaoSocial: 'X' },
    redFlags: { alcadaConselho: true },
    classificacaoDoSistema: 'Alto',
  });

  assert.equal(resultado.ok, true);
  assert.deepEqual(resultado.divergencia, { sistema: 'Alto', planilha: 'Muito Alto' });
});

test('quando as duas concordam, não há divergência a relatar', async () => {
  setGoogleSheetsClientForTests(new PlanilhaFalsa({
    calculado: { "'Avaliação de Integridade'!J16": 'Baixo' },
  }));

  const resultado = await IntegritySheetRepository.preencher({
    cadastro: { razaoSocial: 'X' },
    classificacaoDoSistema: 'Baixo',
  });

  assert.equal(resultado.divergencia, null);
  assert.equal(resultado.resultado.classificacao, 'Baixo');
});

test('aba ausente é dita com o remédio, em vez de escrever no lugar errado', async () => {
  setGoogleSheetsClientForTests(new PlanilhaFalsa({ abas: ['Diligencias'] }));

  const resultado = await IntegritySheetRepository.preencher({ cadastro: { razaoSocial: 'X' } });

  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /CheckList/);
  assert.match(resultado.erro, /Copiar para/);
});
