// ==========================================================
// DILIGÊNCIA 360 — Formulário de SUAPE preenchido na planilha
//
// Em vez de desenhar uma imitação do formulário, o sistema escreve
// dentro do arquivo verdadeiro. A formatação é a de SUAPE porque é a de
// SUAPE, e as fórmulas oficiais — J16, N23/N28/N29/N40, L44/M44, B48 —
// continuam sendo quem calcula.
//
// REGRA CENTRAL: só célula de entrada é escrita. Nenhuma fórmula é
// tocada. Sobrescrever J16 com o resultado que o sistema já tem seria
// mais simples e destruiria exatamente o que dá valor a isto: a
// planilha de SUAPE conferindo o cálculo do sistema.
//
// O MAPA DAS CÉLULAS MORA AQUI porque é conhecimento sobre o arquivo de
// destino, e não sobre a diligência. Duas coisas que o mapa precisa
// respeitar, e que não são óbvias olhando a tela:
//
//  - As fórmulas de red flag leem SÓ a coluna L. `N23` é
//    `=OR(L23="X";L24="X")`. O "x" da coluna M é a marca visível do
//    "Não" e nenhuma fórmula o lê. Marcar na coluna errada inverteria a
//    classificação sem que nada acusasse.
//
//  - A identificação da empresa não é digitada na aba de Avaliação: lá
//    D8 é `=CheckList!D6`. Quem recebe o dado é a CheckList, que é o
//    próprio Questionário de Diligência.
// ==========================================================

const { getGoogleSheetsClient } = require('../config/google-sheets');

const ABA_CHECKLIST = 'CheckList';
const ABA_AVALIACAO = 'Avaliação de Integridade';

/** Onde cada dado cadastral entra na CheckList. */
const CELULAS_CADASTRO = Object.freeze({
  razaoSocial: 'D6',
  cnpj: 'N6',
  objetoSocial: 'D7',
  dataConstituicao: 'D8',
  numeroEmpregados: 'N8',
  endereco: 'D9',
  paises: 'D10',
  servico: 'D11',
});

/**
 * Red flags: cada item na sua linha, coluna L (Sim) e M (Não).
 *
 * As linhas 28 a 36 são os itens 7.1 a 7.9, em sequência, como a coluna
 * B da planilha mostra. `N28` lê L28 e L30..L36 (itens 7.1 e 7.3 a 7.9,
 * que levam a Alto) e `N29` lê só L29 (item 7.2, que leva a Médio).
 *
 * Isto já esteve invertido aqui, com 7.1 apontando para a linha 29.
 * O texto do critério "Médio" da planilha (célula U56) diz "resposta
 * positiva para o item 7.1", mas o critério "Alto" logo acima (U55) já
 * lista 7.1 entre os seus — e a fórmula concorda com U55. O "7.1" em
 * U56 é erro de digitação de SUAPE: ali é o 7.2. Segui a fórmula, que é
 * quem calcula, e não o texto.
 */
const LINHAS_RED_FLAG = Object.freeze({
  '4.4': 23,
  '5.2': 24,
  '7.1': 28,
  '7.2': 29,
  '7.3': 30,
  '7.4': 31,
  '7.5': 32,
  '7.6': 33,
  '7.7': 34,
  '7.8': 35,
  '7.9': 36,
  alcadaConselho: 40,
});

/**
 * Onde cada red flag também é respondida dentro da CheckList.
 *
 * Nenhuma fórmula lê estas células — os gatilhos moram na coluna L da
 * aba de Avaliação. Mas a CheckList é o Questionário de Diligência que
 * vai junto ao processo, e deixá-la em branco enquanto a Avaliação
 * mostra as respostas faria o documento contradizer a si mesmo.
 *
 * A coluna varia: 5.2 é respondida em B89, e todo o resto na coluna C.
 * É assim no arquivo de SUAPE.
 */
const CELULAS_RED_FLAG_CHECKLIST = Object.freeze({
  '4.4': 'C69',
  '5.2': 'B89',
  '7.1': 'C103',
  '7.2': 'C112',
  '7.3': 'C122',
  '7.4': 'C131',
  '7.5': 'C140',
  '7.6': 'C150',
  '7.7': 'C159',
  '7.8': 'C168',
  '7.9': 'C177',
});

/**
 * Os três valores da lista suspensa, vindos de `Apoio!C3:C5`.
 *
 * São exatamente estes, com esta acentuação e esta caixa. As fórmulas
 * comparam sem diferenciar maiúscula, então "SIM" também calcularia
 * certo — mas mostraria na célula um valor fora da lista, que o Sheets
 * marca como inválido na cara do analista.
 */
const RESPOSTA_EM_BRANCO = 'Selecione';
const RESPOSTA_SIM = 'Sim';
const RESPOSTA_NAO = 'Não';

/** Bloco 8/9 da CheckList: a célula de resposta de cada item. */
const CELULAS_MATURIDADE = Object.freeze({
  '8.1': 'C187',
  '8.2': 'C191',
  '8.3': 'C195',
  '8.4': 'C199',
  '8.5': 'C203',
  '8.6': 'C207',
  '8.7': 'C211',
  '8.8': 'C215',
  '8.9': 'C219',
  '9.0': 'C223',
});

/** Item 9.2: os oito cadastros desabonadores, em N231..N238. */
const LINHAS_CADASTRO_DESABONADOR = Object.freeze([
  'ceis',
  'cnep',
  'cepim',
  'improbidadeCnj',
  'tcu',
  'tcePe',
  'trabalhoEscravo',
  'decisoesAdversas',
]);

/** Células de saída lidas de volta para conferência. */
const CELULAS_RESULTADO = Object.freeze({
  classificacao: `'${ABA_AVALIACAO}'!J16`,
  maturidadePercentual: `'${ABA_AVALIACAO}'!L44`,
  maturidadeRisco: `'${ABA_AVALIACAO}'!M44`,
  planoDeAcao: `'${ABA_AVALIACAO}'!B48`,
});

let fila = Promise.resolve();

function comTrava(operacao) {
  const corrente = fila.then(operacao, operacao);
  fila = corrente.catch(() => undefined);
  return corrente;
}

function texto(valor, limite = 500) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

/**
 * Resposta do terceiro na forma que a planilha espera.
 *
 * Item sem resposta devolve string vazia, que limpa a célula. Marcar
 * "Não" no lugar do silêncio inventaria declaração que ninguém prestou —
 * e, no caso das red flags, mudaria a classificação.
 */
function marca(resposta, coluna) {
  if (resposta !== true && resposta !== false) return '';
  const positiva = resposta === true;
  return (coluna === 'L' ? positiva : !positiva) ? 'X' : '';
}

/** Resposta na forma exata da lista suspensa da planilha. */
function opcaoDaLista(resposta) {
  if (resposta === true) return RESPOSTA_SIM;
  if (resposta === false) return RESPOSTA_NAO;
  return RESPOSTA_EM_BRANCO;
}

function montarEscritas({ cadastro = {}, redFlags = {}, maturidade = {}, cadastros = {} }) {
  const escritas = [];
  const celula = (aba, endereco, valor) => {
    escritas.push({ range: `'${aba}'!${endereco}`, values: [[valor]] });
  };

  for (const [campo, endereco] of Object.entries(CELULAS_CADASTRO)) {
    celula(ABA_CHECKLIST, endereco, texto(cadastro[campo]));
  }

  for (const [item, linha] of Object.entries(LINHAS_RED_FLAG)) {
    celula(ABA_AVALIACAO, `L${linha}`, marca(redFlags[item], 'L'));
    celula(ABA_AVALIACAO, `M${linha}`, marca(redFlags[item], 'M'));
  }

  for (const [item, endereco] of Object.entries(CELULAS_RED_FLAG_CHECKLIST)) {
    celula(ABA_CHECKLIST, endereco, opcaoDaLista(redFlags[item]));
  }

  for (const [item, endereco] of Object.entries(CELULAS_MATURIDADE)) {
    const resposta = maturidade[item];
    // A célula é uma lista suspensa cujo estado inicial é "Selecione";
    // é para ele que ela volta quando não há resposta.
    celula(ABA_CHECKLIST, endereco, opcaoDaLista(resposta));
  }

  LINHAS_CADASTRO_DESABONADOR.forEach((chave, indice) => {
    celula(ABA_CHECKLIST, `N${231 + indice}`, cadastros[chave] === true ? 'x' : '');
  });

  return escritas;
}

const IntegritySheetRepository = {
  ABA_CHECKLIST,
  ABA_AVALIACAO,
  CELULAS_CADASTRO,
  LINHAS_RED_FLAG,
  CELULAS_MATURIDADE,
  CELULAS_RED_FLAG_CHECKLIST,
  LINHAS_CADASTRO_DESABONADOR,
  opcaoDaLista,
  montarEscritas,
  marca,

  /**
   * Preenche o formulário e devolve o que a planilha calculou.
   *
   * Sempre nas mesmas células: cada diligência sobrescreve a anterior,
   * e não há o que limpar entre uma e outra.
   *
   * @returns {Promise<{ok: boolean, resultado?: object, divergencia?: object, erro?: string}>}
   */
  async preencher(entrada) {
    const cliente = getGoogleSheetsClient();
    if (!cliente.isConfigured()) {
      return { ok: false, erro: 'Planilha não configurada.' };
    }

    try {
      return await comTrava(async () => {
        const abas = await cliente.listSheets();
        const nomes = abas.map((aba) => aba.title);
        const faltando = [ABA_CHECKLIST, ABA_AVALIACAO].filter((aba) => !nomes.includes(aba));
        if (faltando.length > 0) {
          return {
            ok: false,
            erro: `A planilha não tem a aba ${faltando.join(' nem ')}. `
              + 'Copie as abas do modelo de SUAPE com "Copiar para", mantendo os nomes.',
          };
        }

        await cliente.batchUpdateValues(montarEscritas(entrada));

        // A planilha recalcula ao receber os valores; a leitura seguinte
        // já traz o resultado das fórmulas oficiais.
        const lido = await cliente.batchGetValues(Object.values(CELULAS_RESULTADO));
        const resultado = {
          classificacao: texto(lido[CELULAS_RESULTADO.classificacao], 20),
          maturidadePercentual: lido[CELULAS_RESULTADO.maturidadePercentual],
          maturidadeRisco: texto(lido[CELULAS_RESULTADO.maturidadeRisco], 20),
          planoDeAcao: texto(lido[CELULAS_RESULTADO.planoDeAcao], 4_000),
        };

        // A conferência é o ganho de escrever na planilha oficial em vez
        // de desenhar uma cópia: se as duas discordarem, uma das duas
        // está errada, e o analista precisa saber antes de decidir.
        const doSistema = texto(entrada.classificacaoDoSistema, 20);
        const divergencia = doSistema && resultado.classificacao && doSistema !== resultado.classificacao
          ? { sistema: doSistema, planilha: resultado.classificacao }
          : null;

        const aba = abas.find((item) => item.title === ABA_AVALIACAO);
        return { ok: true, resultado, divergencia, url: cliente.sheetUrl(aba?.sheetId) };
      });
    } catch (error) {
      console.error('[GoogleSheets] Formulário de integridade não pôde ser preenchido:', error.message);
      return { ok: false, erro: error.message };
    }
  },
};

module.exports = { IntegritySheetRepository };
