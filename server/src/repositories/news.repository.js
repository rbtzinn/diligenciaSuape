// ==========================================================
// DILIGÊNCIA 360 — Publicações de reputação no Google Sheets
//
// O histórico já guardava as notícias: elas entram no retrato da
// diligência, que vai comprimido e fatiado em pedaços de base64 nas
// linhas de payload. Isso serve para o sistema reler, e não serve para
// nada mais — quem abre a planilha vê texto embaralhado.
//
// Esta aba existe para o outro lado: uma linha por publicação, legível
// no celular, filtrável e ordenável pela própria planilha, com o link
// clicável. É derivada do retrato, nunca a fonte dele: apagar esta aba
// não perde diligência nenhuma.
//
// A aba é recriada a cada gravação da mesma diligência, em vez de
// receber linhas novas por cima. Salvar duas vezes é o caso comum — o
// analista revisa, descarta uma matéria e salva de novo — e duplicar a
// lista tornaria a aba inútil justamente para quem a usa.
// ==========================================================

const { getGoogleSheetsClient } = require('../config/google-sheets');

const ABA = 'Noticias';

const CABECALHO = Object.freeze([
  'diligencia_id',
  'cnpj',
  'razao_social',
  'salvo_em',
  'sujeito_pesquisado',
  'titulo',
  'fonte',
  'link',
  'publicado_em',
  'termos_de_atencao',
  'correlacao',
  'status_revisao',
  'provedores',
  'trecho',
]);

const FORCA = Object.freeze({ high: 'Alta', medium: 'Média', low: 'Baixa' });
const REVISAO = Object.freeze({
  confirmed: 'Confirmada',
  discarded: 'Descartada',
  pending: 'Pendente',
});

let fila = Promise.resolve();

/** Serializa as gravações: duas diligências salvas juntas reescreveriam a mesma aba. */
function comTrava(operacao) {
  const corrente = fila.then(operacao, operacao);
  fila = corrente.catch(() => undefined);
  return corrente;
}

function texto(valor, limite = 500) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

function sujeitosDaPublicacao(item) {
  const nomes = [
    item?.subjectName,
    ...(Array.isArray(item?.relatedSubjects) ? item.relatedSubjects.map((s) => s?.subjectName) : []),
  ].filter(Boolean);
  return [...new Set(nomes)].join(' · ');
}

/** Uma publicação vira uma linha, na ordem do cabeçalho. */
function linhaDaPublicacao(item, diligencia, salvoEm) {
  return [
    texto(diligencia.id, 64),
    texto(diligencia.cnpj, 20),
    texto(diligencia.razaoSocial, 200),
    salvoEm,
    texto(sujeitosDaPublicacao(item), 300),
    texto(item?.title, 300),
    texto(item?.domain || item?.sourceName, 120),
    texto(item?.url, 500),
    texto(item?.publishedAt, 40),
    texto((Array.isArray(item?.matchedTerms) ? item.matchedTerms : []).join(', '), 300),
    FORCA[item?.matchStrength] || '',
    REVISAO[item?.status] || REVISAO.pending,
    texto((Array.isArray(item?.providerSources) ? item.providerSources : []).join(', '), 200),
    texto(item?.snippet, 500),
  ];
}

const NewsRepository = {
  ABA,
  CABECALHO,
  linhaDaPublicacao,

  /**
   * Reescreve as linhas desta diligência na aba de publicações.
   *
   * @returns {Promise<{ok: boolean, linhas?: number, abaCriada?: boolean, erro?: string}>}
   *   Nunca lança: a aba é um espelho, e perdê-la não pode derrubar a
   *   gravação do histórico, que é o dado de verdade.
   */
  async salvarPublicacoes({ diligencia, publicacoes }) {
    const cliente = getGoogleSheetsClient();
    if (!cliente.isConfigured()) {
      return { ok: false, erro: 'Planilha não configurada.' };
    }

    const itens = Array.isArray(publicacoes) ? publicacoes : [];
    const id = texto(diligencia?.id, 64);
    if (!id) return { ok: false, erro: 'Diligência sem identificador.' };

    try {
      return await comTrava(async () => {
        const abaCriada = await cliente.ensureSheet(ABA, [...CABECALHO]);

        const atuais = abaCriada ? [] : await cliente.getValues(`${ABA}!A2:N`);
        const deOutrasDiligencias = atuais.filter((linha) => texto(linha?.[0], 64) !== id);

        const salvoEm = new Date().toISOString();
        const novas = itens.map((item) => linhaDaPublicacao(item, {
          id,
          cnpj: diligencia?.cnpj,
          razaoSocial: diligencia?.razaoSocial,
        }, salvoEm));

        const corpo = [...deOutrasDiligencias, ...novas];

        // Limpar antes de escrever: sem isso, uma lista que encolheu
        // deixaria para trás as linhas do salvamento anterior.
        await cliente.clearValues(`${ABA}!A2:N`);
        if (corpo.length > 0) {
          await cliente.updateValues(`${ABA}!A2:N${corpo.length + 1}`, corpo);
        }

        return { ok: true, linhas: novas.length, abaCriada };
      });
    } catch (error) {
      console.error('[GoogleSheets] Aba de publicações não pôde ser atualizada:', error.message);
      return { ok: false, erro: error.message };
    }
  },
};

module.exports = { NewsRepository };
