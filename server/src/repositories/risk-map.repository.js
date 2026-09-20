// ==========================================================
// DILIGÊNCIA 360 — Linha do Mapa de Risco no Google Sheets
//
// A avaliação de integridade termina numa linha de 40 colunas, no
// layout do Mapa de Risco de SUAPE. Até aqui ela só podia ser copiada
// e colada à mão — que é exatamente o "colocar coisa por coisa" que a
// linha pronta veio resolver pela metade.
//
// Duas regras sustentam esta aba:
//
// 1. As 40 colunas oficiais ocupam A..AN, na ordem da planilha de
//    SUAPE, e nada é inserido no meio delas. Quem quiser continuar
//    copiando o bloco para outra planilha copia A..AN e cola.
//
// 2. A identificação da diligência vai em AO, depois do bloco oficial.
//    É o que permite regravar a linha certa quando o analista revisa e
//    salva de novo: sem chave, cada salvamento viraria uma linha nova e
//    o Mapa passaria a ter três versões da mesma diligência.
//
// O Mapa é um registro histórico e o analista escreve nele à mão. Por
// isso só a linha desta diligência é tocada: nada de reescrever a aba
// inteira, que apagaria ajuste feito na planilha.
// ==========================================================

const { getGoogleSheetsClient, columnLetter } = require('../config/google-sheets');

const ABA = 'MapaDeRisco';
const COLUNAS_OFICIAIS = 40;
const COLUNA_CHAVE = 'diligencia_id';
const TOTAL_COLUNAS = COLUNAS_OFICIAIS + 1;
const ULTIMA_COLUNA = columnLetter(TOTAL_COLUNAS);
const LIMITE_DA_CELULA = 2_000;

let fila = Promise.resolve();

function comTrava(operacao) {
  const corrente = fila.then(operacao, operacao);
  fila = corrente.catch(() => undefined);
  return corrente;
}

function celula(valor) {
  return String(valor ?? '').replace(/\r?\n/g, ' ').trim().slice(0, LIMITE_DA_CELULA);
}

const RiskMapRepository = {
  ABA,
  COLUNAS_OFICIAIS,
  COLUNA_CHAVE,

  /**
   * Grava (ou regrava) a linha desta diligência no Mapa de Risco.
   *
   * @param {object} entrada
   * @param {string} entrada.diligenciaId chave da linha, gravada em AO
   * @param {string[]} entrada.cabecalho os 40 títulos oficiais, na ordem
   * @param {string[]} entrada.valores os 40 valores, na mesma ordem
   * @returns {Promise<{ok: boolean, linha?: number, criada?: boolean, abaCriada?: boolean, erro?: string}>}
   *   Nunca lança: a planilha é um destino, e a falha dela precisa
   *   chegar à tela como falha da planilha, não como erro genérico.
   */
  async salvarLinha({ diligenciaId, cabecalho, valores }) {
    const cliente = getGoogleSheetsClient();
    if (!cliente.isConfigured()) {
      return { ok: false, erro: 'Planilha não configurada.' };
    }

    const id = celula(diligenciaId).slice(0, 64);
    if (!id) return { ok: false, erro: 'Diligência sem identificador.' };
    if (!Array.isArray(cabecalho) || cabecalho.length !== COLUNAS_OFICIAIS) {
      return { ok: false, erro: `O cabeçalho precisa ter ${COLUNAS_OFICIAIS} colunas.` };
    }
    if (!Array.isArray(valores) || valores.length !== COLUNAS_OFICIAIS) {
      return { ok: false, erro: `A linha precisa ter ${COLUNAS_OFICIAIS} colunas.` };
    }

    const titulos = [...cabecalho.map((titulo) => celula(titulo)), COLUNA_CHAVE];
    const linha = [...valores.map((valor) => celula(valor)), id];

    try {
      return await comTrava(async () => {
        const abaCriada = await cliente.ensureSheet(ABA, titulos);

        if (!abaCriada) {
          // Cabeçalho diferente significa que a aba não é mais a mesma
          // planilha que o sistema escreve. Gravar por cima colocaria
          // valor na coluna errada, e um Mapa errado é pior que um Mapa
          // sem a linha.
          const [titulosAtuais = []] = await cliente.getValues(`${ABA}!A1:${ULTIMA_COLUNA}1`);
          const divergente = titulos.some((titulo, indice) => celula(titulosAtuais[indice]) !== titulo);
          if (divergente) {
            return {
              ok: false,
              erro: `As colunas da aba ${ABA} não são as que o sistema escreve. Renomeie ou remova a aba para que ela seja recriada.`,
            };
          }
        }

        const existentes = abaCriada ? [] : await cliente.getValues(`${ABA}!A2:${ULTIMA_COLUNA}`);
        const posicao = existentes.findIndex((atual) => celula(atual?.[COLUNAS_OFICIAIS]) === id);

        if (posicao >= 0) {
          const numeroDaLinha = posicao + 2;
          await cliente.updateValues(`${ABA}!A${numeroDaLinha}:${ULTIMA_COLUNA}${numeroDaLinha}`, [linha]);
          return { ok: true, linha: numeroDaLinha, criada: false, abaCriada };
        }

        await cliente.appendValues(`${ABA}!A:${ULTIMA_COLUNA}`, [linha]);
        return { ok: true, linha: existentes.length + 2, criada: true, abaCriada };
      });
    } catch (error) {
      console.error('[GoogleSheets] Linha do Mapa de Risco não pôde ser gravada:', error.message);
      return { ok: false, erro: error.message };
    }
  },
};

module.exports = { RiskMapRepository };
