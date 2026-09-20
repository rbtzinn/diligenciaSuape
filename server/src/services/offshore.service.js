const { normalizeName } = require('../egos/domain/normalization');
const { nameSimilarity } = require('../egos/entity-resolution/entity-resolution.service');

const RECONCILE_URL = 'https://offshoreleaks.icij.org/api/v1/reconcile';

// ==========================================================
// Por que em lotes, e não numa chamada só
//
// A consulta antiga mandava a empresa e até 24 sócios num único POST
// com 15 s de prazo e nenhuma nova tentativa. O endpoint de
// reconciliação do ICIJ responde em tempo proporcional ao número de
// consultas, então o lote cheio era justamente o que estourava o
// prazo — e, quando estourava, a etapa inteira virava "Fonte
// indisponível", inclusive a consulta da própria empresa, que é a mais
// importante e a mais barata.
//
// Em lotes pequenos cada requisição responde dentro do prazo, uma falha
// derruba só o lote dela, e a empresa vai no primeiro lote. O que não
// foi consultado é declarado — ausência de consulta nunca vira "nada
// consta".
// ==========================================================

const TAMANHO_DO_LOTE = 6;
const PRAZO_POR_LOTE_MS = 12_000;
const PRAZO_TOTAL_MS = 35_000;
const MAXIMO_DE_SOCIOS = 24;

const esperar = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Um POST de reconciliação. Lança em timeout, rede ou HTTP não-ok. */
async function consultarLote(sources, prazoMs) {
  const queries = Object.fromEntries(
    sources.map((source, index) => [`q${index}`, { query: source.sourceName }])
  );

  const response = await fetch(RECONCILE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Diligencia360-SUAPE/2.0',
    },
    body: JSON.stringify({ type: 'Node', queries }),
    signal: AbortSignal.timeout(Math.max(2_000, prazoMs)),
  });

  if (!response.ok) {
    const erro = new Error(`ICIJ respondeu HTTP ${response.status}.`);
    erro.status = response.status;
    // 429 e 5xx são estado momentâneo do serviço; 4xx restante é pedido
    // malformado e repetir não muda o resultado.
    erro.valeRepetir = response.status === 429 || response.status >= 500;
    throw erro;
  }

  return response.json();
}

/** Tenta o lote uma segunda vez quando a falha foi de tempo ou de disponibilidade. */
async function consultarLoteComRetentativa(sources, prazoMs) {
  try {
    return await consultarLote(sources, prazoMs);
  } catch (error) {
    const porTempo = error.name === 'TimeoutError' || error.name === 'AbortError';
    if (!porTempo && !error.valeRepetir) throw error;
    await esperar(700);
    return consultarLote(sources, Math.min(prazoMs, 9_000));
  }
}

const OffshoreService = {
  async search({ company, shareholders = [] }) {
    const sources = [{
      sourceType: 'company',
      sourceName: company.razaoSocial,
      sourceReference: String(company.cnpj || '').replace(/\D/g, ''),
      aliases: [company.nomeFantasia].filter(Boolean),
    }];
    for (const shareholder of shareholders.slice(0, MAXIMO_DE_SOCIOS)) {
      if (!shareholder.nome_socio) continue;
      sources.push({
        sourceType: 'person',
        sourceName: shareholder.nome_socio,
        sourceReference: normalizeName(shareholder.nome_socio),
        aliases: [],
      });
    }

    const consultedAt = new Date().toISOString();
    const limite = Date.now() + PRAZO_TOTAL_MS;

    const candidates = [];
    const seen = new Set();
    const naoConsultados = [];
    const avisos = [];
    let lotesConsultados = 0;
    let ultimoErro = null;

    for (let inicio = 0; inicio < sources.length; inicio += TAMANHO_DO_LOTE) {
      const lote = sources.slice(inicio, inicio + TAMANHO_DO_LOTE);
      const restante = limite - Date.now();

      if (restante < 3_000) {
        // Sem tempo para uma tentativa honesta: declara e para.
        for (const source of sources.slice(inicio)) naoConsultados.push(source.sourceName);
        avisos.push('Prazo da consulta esgotado antes de percorrer todos os nomes.');
        break;
      }

      let payload;
      try {
        payload = await consultarLoteComRetentativa(lote, Math.min(PRAZO_POR_LOTE_MS, restante));
      } catch (error) {
        ultimoErro = error;
        for (const source of lote) naoConsultados.push(source.sourceName);
        avisos.push(`Lote não consultado (${lote.length} nome(s)): ${error.message}`);
        continue;
      }

      lotesConsultados += 1;

      for (let index = 0; index < lote.length; index += 1) {
        const source = lote[index];
        const results = Array.isArray(payload[`q${index}`]?.result) ? payload[`q${index}`].result : [];
        let acceptedForSource = 0;
        for (const item of results) {
          const similarity = nameSimilarity(source.sourceName, item.name);
          const aliasExact = source.aliases.some((alias) => normalizeName(alias) === normalizeName(item.name));
          if (!item.match && similarity < 0.92 && !aliasExact) continue;
          const uniqueKey = `${source.sourceType}:${source.sourceReference}:${item.id}`;
          if (seen.has(uniqueKey)) continue;
          seen.add(uniqueKey);
          const confidence = Math.min(69, Math.max(
            item.match ? 69 : 0,
            Math.round(similarity * 68),
            aliasExact ? 62 : 0
          ));
          candidates.push({
            sourceType: source.sourceType,
            sourceName: source.sourceName,
            sourceReference: source.sourceReference,
            id: String(item.id),
            name: item.name,
            description: item.description || 'Registro na base Offshore Leaks.',
            offshoreType: item.types?.[0]?.name || 'Node',
            score: Number(item.score) || 0,
            reconciliationMatch: item.match === true,
            confidence,
            url: `https://offshoreleaks.icij.org/nodes/${item.id}`,
          });
          acceptedForSource += 1;
          if (acceptedForSource >= 3) break;
        }
      }
    }

    const consultados = sources.length - naoConsultados.length;

    if (lotesConsultados === 0) {
      return {
        ok: false,
        status: ultimoErro?.status && ultimoErro.status < 500 ? ultimoErro.status : 503,
        erro: `Falha ao consultar ICIJ: ${ultimoErro?.message || 'nenhum lote respondeu dentro do prazo.'}`,
        totalQueries: sources.length,
        nomesConsultados: 0,
        nomesNaoConsultados: naoConsultados,
        candidates: [],
        consultadoEm: consultedAt,
      };
    }

    return {
      ok: true,
      status: 200,
      provider: 'ICIJ Offshore Leaks Reconciliation API',
      totalQueries: sources.length,
      nomesConsultados: consultados,
      nomesNaoConsultados: naoConsultados,
      // Resultado parcial nunca pode ser lido como "nada consta": o
      // analista precisa saber quais nomes ficaram sem verificação.
      parcial: naoConsultados.length > 0,
      avisos,
      candidates,
      consultadoEm: consultedAt,
      disclaimer: 'A presença na base não implica ilegalidade. Correspondências nominais podem ser homônimos e exigem validação humana.',
    };
  },
};

module.exports = { OffshoreService };
