// ==========================================================
// DILIGÊNCIA 360 — Projeção do TCE-PE para o dossiê
// ==========================================================
// Reduz o resultado das camadas TCE-PE, contratual e documental ao que cabe
// num dossiê salvo, declarando tudo o que ficou de fora.
//
// POR QUE ISTO EXISTE: a coleta completa de uma empresa ativa mede 8,3 MB —
// medido contra GUERRA CONSTRUCOES LTDA, com 96 contratos, 239 aditivos e 245
// licitações. O corpo aceito pelo Express é 4 MB e o teto de resposta da função
// serverless é 4,5 MB. Sem projeção, a rota falharia na resposta e o dossiê
// falharia ao salvar — exatamente para as empresas que mais interessam.
//
// O QUE É CORTADO, E POR QUÊ É SEGURO:
//
//   `raw`  — 2,6 MB só de registros brutos. É a cópia integral do que a API
//            devolveu, e o dossiê já preserva `sourceUrl`, `endpoint`, `query` e
//            `params`: quem precisar do bruto reproduz a consulta.
//
//   caudas — listas longas são truncadas com o total real declarado. Um dossiê
//            que mostra 40 de 239 aditivos e diz isso é honesto; um que mostra
//            40 e silencia sobre os outros 199 não é.
//
// O QUE NUNCA É CORTADO: contagens, `sourceStatus` por fonte, descartes e as
// notas de cobertura. São eles que dizem o que foi consultado e o que não foi,
// e um dossiê sem isso vira lista sem contexto.
// ==========================================================

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

const MAX_CONTRACTS = envInt('DOSSIER_MAX_CONTRACTS', 40, 5, 200);
const MAX_ADDITIVES_PER_CONTRACT = envInt('DOSSIER_MAX_ADDITIVES', 20, 3, 100);
const MAX_TIMELINE_ENTRIES = envInt('DOSSIER_MAX_TIMELINE', 30, 5, 150);
const MAX_DOCUMENTS = envInt('DOSSIER_MAX_DOCUMENTS', 80, 10, 400);
const MAX_DISCARDED = envInt('DOSSIER_MAX_DISCARDED', 30, 5, 200);
const MAX_EXPENSES = envInt('DOSSIER_MAX_EXPENSES', 40, 5, 200);

/** Remove `raw` em profundidade. O bruto é reproduzível pela consulta salva. */
function stripRaw(value) {
  return JSON.parse(JSON.stringify(value ?? null), (key, item) => (key === 'raw' ? undefined : item));
}

/** Corta a lista e devolve o que foi cortado, para ser declarado. */
function cap(list, limit) {
  const all = Array.isArray(list) ? list : [];
  return { items: all.slice(0, limit), total: all.length, omitidos: Math.max(0, all.length - limit) };
}

/**
 * Projeta um perfil contratual: contrato, aditivos e linha do tempo, sem bruto
 * e com as caudas truncadas.
 */
function projectProfile(profile) {
  const aditivos = cap(profile.aditivos, MAX_ADDITIVES_PER_CONTRACT);
  const entries = cap(profile.timelineDetalhada?.entries, MAX_TIMELINE_ENTRIES);

  return {
    contrato: stripRaw(profile.contrato),
    aditivos: stripRaw(aditivos.items),
    aditivosTotal: aditivos.total,
    aditivosOmitidos: aditivos.omitidos,
    timelineDetalhada: profile.timelineDetalhada
      ? {
        ordering: profile.timelineDetalhada.ordering,
        entries: stripRaw(entries.items),
        entriesTotal: entries.total,
        entriesOmitidas: entries.omitidos,
        vigencia: profile.timelineDetalhada.vigencia,
        cobertura: profile.timelineDetalhada.cobertura,
        notasDeCobertura: profile.timelineDetalhada.notasDeCobertura,
        aviso: profile.timelineDetalhada.aviso,
        limitacao: profile.timelineDetalhada.limitacao,
      }
      : null,
    relacionamentos: profile.relacionamentos,
    documentos: profile.documentos,
    sourceStatuses: profile.sourceStatuses,
    resumo: profile.resumo,
  };
}

/**
 * Monta a projeção que vai ao dossiê.
 *
 * @param {object} input
 * @param {object} input.tceResult coleta do TCE-PE.
 * @param {object} input.contractIntelligence perfis contratuais.
 * @param {object} input.documentIntelligence catálogo documental.
 */
function projectForDossier({ tceResult = {}, contractIntelligence = {}, documentIntelligence = {} }) {
  const contratos = cap(contractIntelligence.contratos, MAX_CONTRACTS);
  const documentos = cap(documentIntelligence.documentos, MAX_DOCUMENTS);
  const descartados = cap(tceResult.descartados, MAX_DISCARDED);
  const despesas = cap(tceResult.despesas, MAX_EXPENSES);

  const omissoes = [];
  const declarar = (rotulo, corte) => {
    if (corte.omitidos > 0) {
      omissoes.push(`${corte.omitidos} de ${corte.total} ${rotulo} não foram incluídos no dossiê salvo.`);
    }
  };
  declarar('contratos', contratos);
  declarar('documentos', documentos);
  declarar('registros descartados', descartados);
  declarar('despesas', despesas);

  return {
    ok: tceResult.ok ?? false,
    sourceStatus: tceResult.sourceStatus ?? null,
    provider: tceResult.provider ?? null,
    sourceUrl: tceResult.sourceUrl ?? null,
    consultadoEm: tceResult.consultadoEm ?? null,
    entity: tceResult.entity ?? null,
    erro: tceResult.erro ?? undefined,

    // Estado por fonte: nunca truncado. É o que separa "não há" de "não sei".
    providers: tceResult.providers ?? [],
    resumo: tceResult.resumo ?? null,

    despesas: stripRaw(despesas.items),
    descartados: descartados.items,

    contractIntelligence: {
      generatedAt: contractIntelligence.generatedAt ?? null,
      contratos: contratos.items.map(projectProfile),
      contratosTotal: contratos.total,
      contratosOmitidos: contratos.omitidos,
      aditivosOrfaos: stripRaw(cap(contractIntelligence.aditivosOrfaos, MAX_ADDITIVES_PER_CONTRACT).items),
      cobertura: contractIntelligence.cobertura ?? {},
      resumo: contractIntelligence.resumo ?? null,
      limitacao: contractIntelligence.limitacao ?? null,
    },

    documentIntelligence: {
      generatedAt: documentIntelligence.generatedAt ?? null,
      documentos: stripRaw(documentos.items),
      documentosTotal: documentos.total,
      documentosOmitidos: documentos.omitidos,
      ausencias: documentIntelligence.ausencias ?? [],
      resumo: documentIntelligence.resumo ?? null,
      limitacao: documentIntelligence.limitacao ?? null,
    },

    // O dossiê precisa dizer que é um recorte, e de quanto.
    projecao: {
      aplicada: true,
      rawRemovido: true,
      omissoes,
      nota: 'O dossiê guarda uma projeção da coleta. Os registros brutos foram removidos e as listas '
        + 'longas foram truncadas para caber no limite de armazenamento. As contagens, o estado de cada '
        + 'fonte e os descartes são integrais. Cada registro preserva `endpoint`, `query` e `sourceUrl`, '
        + 'que permitem reproduzir a consulta original.',
    },
    limitacao: tceResult.limitacao ?? null,
  };
}

module.exports = { projectForDossier, projectProfile, stripRaw, cap };
