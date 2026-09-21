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

test('os itens 7.1 a 7.9 ficam nas linhas 28 a 36, em sequência', () => {
  // Isto já esteve invertido, com 7.1 na linha 29, e um teste guardava
  // a inversão como se fosse o certo. A coluna B da planilha resolve a
  // dúvida: B28 é "7.1 A pessoa jurídica exerce uma atividade
  // regulada?" e B29 é "7.2 Informar se são necessárias autorizações".
  const esperado = ['7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9'];
  esperado.forEach((item, indice) => {
    assert.equal(
      IntegritySheetRepository.LINHAS_RED_FLAG[item],
      28 + indice,
      `${item} deveria estar na linha ${28 + indice}`,
    );
  });

  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG['4.4'], 23);
  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG['5.2'], 24);
  assert.equal(IntegritySheetRepository.LINHAS_RED_FLAG.alcadaConselho, 40);
});

test('7.1 aciona o gatilho de Alto e 7.2 o de Médio, como as fórmulas leem', () => {
  // `N28` (Alto) = OR(L28, L30..L36). `N29` (Médio) = OR(L29).
  const linhasDeAlto = [28, 30, 31, 32, 33, 34, 35, 36];
  const { LINHAS_RED_FLAG } = IntegritySheetRepository;

  assert.ok(
    linhasDeAlto.includes(LINHAS_RED_FLAG['7.1']),
    'o item 7.1 precisa cair numa linha que N28 lê, ou a planilha diria Médio',
  );
  assert.equal(
    LINHAS_RED_FLAG['7.2'], 29,
    'o item 7.2 é o único que N29 lê; fora da 29 ele deixaria de produzir Médio',
  );
  assert.ok(!linhasDeAlto.includes(LINHAS_RED_FLAG['7.2']));
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

test('maturidade usa os três valores exatos da lista suspensa', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    maturidade: { '8.1': true, '8.2': false, '8.3': null },
  });

  // `Apoio!C3:C5` traz "Selecione", "Sim" e "Não", nesta acentuação e
  // nesta caixa. "SIM" calcularia certo, porque a comparação da fórmula
  // ignora maiúscula, mas o Sheets marcaria a célula como fora da lista.
  assert.equal(valorEm(escritas, "'CheckList'!C187"), 'Sim');
  assert.equal(valorEm(escritas, "'CheckList'!C191"), 'Não');
  assert.equal(valorEm(escritas, "'CheckList'!C195"), 'Selecione');
});

test('as red flags também são respondidas dentro da CheckList', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    redFlags: { '4.4': false, '5.2': true, '7.1': true, '7.9': null },
  });

  // Nenhuma fórmula lê estas células, mas a CheckList é o questionário
  // que vai ao processo: em branco, ela contradiria a aba de Avaliação.
  assert.equal(valorEm(escritas, "'CheckList'!C69"), 'Não');
  assert.equal(valorEm(escritas, "'CheckList'!B89"), 'Sim', '5.2 é respondida na coluna B, não na C');
  assert.equal(valorEm(escritas, "'CheckList'!C103"), 'Sim');
  assert.equal(valorEm(escritas, "'CheckList'!C177"), 'Selecione');
});

test('a resposta na CheckList não contradiz a marca da Avaliação', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    redFlags: { '4.4': true },
  });

  assert.equal(valorEm(escritas, "'Avaliação de Integridade'!L23"), 'X');
  assert.equal(valorEm(escritas, "'CheckList'!C69"), 'Sim');
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
    this.abas = abas.map((title, indice) => ({ title, sheetId: 100 + indice }));
    this.calculado = calculado;
    this.escritas = null;
  }

  isConfigured() { return true; }

  async listSheets() { return this.abas; }

  sheetUrl(sheetId) { return `https://docs.google.com/spreadsheets/d/ID/edit#gid=${sheetId}`; }

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
  // Sem o endereço, o analista teria de procurar a planilha para
  // conferir o que acabou de ser escrito.
  assert.match(resultado.url, /#gid=101$/);
});

test('aba ausente é dita com o remédio, em vez de escrever no lugar errado', async () => {
  setGoogleSheetsClientForTests(new PlanilhaFalsa({ abas: ['Diligencias'] }));

  const resultado = await IntegritySheetRepository.preencher({ cadastro: { razaoSocial: 'X' } });

  assert.equal(resultado.ok, false);
  assert.match(resultado.erro, /CheckList/);
  assert.match(resultado.erro, /Copiar para/);
});

// ==========================================================
// Demais campos do questionário
//
// A classificação sai de 22 itens. O questionário tem muito mais, e o
// resto se perdia na transcrição — a CheckList ia ao processo com o
// representante, o histórico e o ente regulador em branco.
// ==========================================================

test('as perguntas fora de fórmula têm células próprias, longe das red flags', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    extraChoices: { '1.2': true, '6.1': false, '9.4': null },
  });

  assert.equal(valorEm(escritas, "'CheckList'!C15"), 'Sim');
  assert.equal(valorEm(escritas, "'CheckList'!C97"), 'Não');
  assert.equal(valorEm(escritas, "'CheckList'!C246"), 'Selecione');

  // Nenhuma delas pode acabar marcando a coluna L da aba de Avaliação,
  // onde moram os gatilhos: ali uma resposta destas mudaria a
  // classificação. As células de red flag são escritas, mas vazias.
  const marcasNaColunaL = escritas
    .filter((e) => /'Avaliação de Integridade'!L\d+$/.test(e.range))
    .filter((e) => e.values[0][0] !== '');

  assert.deepEqual(marcasNaColunaL, [], 'escolha extra não pode marcar gatilho');
});

test('os campos de texto vão para as células do questionário', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    textFields: {
      ramoAtividade: 'Arquitetura e urbanismo',
      representanteNome: 'MARIA SOUZA',
      representanteEmail: 'maria@empresa.test',
      historicoSociedade: 'Constituída em 1987 por dois sócios.',
      responsavelIntegridade: 'Comitê de Ética',
    },
  });

  assert.equal(valorEm(escritas, "'CheckList'!N7"), 'Arquitetura e urbanismo');
  assert.equal(valorEm(escritas, "'CheckList'!D20"), 'MARIA SOUZA');
  assert.equal(valorEm(escritas, "'CheckList'!N22"), 'maria@empresa.test');
  assert.equal(valorEm(escritas, "'CheckList'!B30"), 'Constituída em 1987 por dois sócios.');
  assert.equal(valorEm(escritas, "'CheckList'!B227"), 'Comitê de Ética');
});

test('campo que a transcrição não trouxe é limpo, não herdado', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    textFields: { ramoAtividade: 'Arquitetura' },
  });

  // Manter o valor da diligência anterior atribuiria ao terceiro atual
  // uma declaração que quem prestou foi outro.
  assert.equal(valorEm(escritas, "'CheckList'!D20"), '');
  assert.equal(valorEm(escritas, "'CheckList'!B30"), '');
});

test('nenhum campo extra invade célula de fórmula', () => {
  const escritas = IntegritySheetRepository.montarEscritas({
    extraChoices: { '1.2': true, '6.1': true, '9.4': true, '9.5': true, '9.6': true },
    textFields: Object.fromEntries(
      Object.keys(IntegritySheetRepository.CELULAS_TEXTO).map((chave) => [chave, 'x']),
    ),
  });

  const proibidas = ['Q187', 'R187', 'Q231', 'R231'];
  for (const celula of proibidas) {
    assert.ok(
      !enderecosEscritos(escritas).includes(`'CheckList'!${celula}`),
      `${celula} guarda fórmula e não pode ser escrita`,
    );
  }
});

test('os endereços dos campos extras não colidem entre si', () => {
  const todos = [
    ...Object.values(IntegritySheetRepository.CELULAS_TEXTO),
    ...Object.values(IntegritySheetRepository.CELULAS_ESCOLHA_EXTRA),
    ...Object.values(IntegritySheetRepository.CELULAS_RED_FLAG_CHECKLIST),
    ...Object.values(IntegritySheetRepository.CELULAS_MATURIDADE),
    ...Object.values(IntegritySheetRepository.CELULAS_CADASTRO),
  ];

  assert.equal(new Set(todos).size, todos.length, 'duas chaves apontando para a mesma célula');
});
