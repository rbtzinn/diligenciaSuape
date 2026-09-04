// ==========================================================
// DILIGÊNCIA 360 — Inteligência contratual
// ==========================================================
// Monta o perfil de cada contrato a partir do que a camada TCE-PE já coletou.
//
// NÃO CONSULTA A REDE. Recebe o resultado de `TcePeIntelligenceService.collect`
// e trabalha sobre ele. Refazer a coleta aqui duplicaria requisições e criaria
// duas verdades sobre o mesmo contrato.
//
// O que produz: contrato, seus eventos, a linha do tempo desses eventos, as
// associações a obras, despesas e licitações — cada uma com a força do vínculo
// declarada — e a cobertura por fonte.
//
// O que NÃO produz: score, classificação de risco, alerta, limite legal,
// contagem interpretada ou qualquer juízo sobre a empresa. Um contrato com sete
// aditivos aparece aqui como um contrato com sete aditivos.
// ==========================================================

const { SOURCE_STATUS } = require('../domain/source-status');
const { RELATIONSHIP_TYPE } = require('../domain/relationship-type');
const {
  ASSOCIATION_CONFIDENCE,
  buildContract,
  buildContractCreatedEvent,
  buildContractClosureEvent,
  buildAdditiveEvent,
  associateAdditive,
  buildTimeline,
  dedupeEvents,
} = require('./contract.model');
const { buildContractTimeline } = require('./contract-timeline');

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Associa despesas ao contrato por identificador oficial.
 *
 * O dataset de despesas do TCE-PE não publica o código do contrato: publica
 * empenho, unidade gestora e histórico. Por isso a associação nunca chega a
 * CONFIRMED por aqui — e, principalmente, nunca é feita pelo CNPJ, que é o
 * mesmo em toda a carteira e ligaria qualquer pagamento a qualquer contrato.
 *
 * O caminho aceito é o histórico do empenho citar o número do contrato, o que
 * é indício documental e fica registrado como UNCERTAIN.
 */
function associateExpenses(contract, expenses) {
  if (!contract.numeroContrato) return [];
  const numero = text(contract.numeroContrato).replace(/^0+/, '');
  if (!numero) return [];

  const associations = [];
  for (const expense of expenses) {
    const historico = text(expense.historico);
    if (!historico) continue;

    // Exige unidade gestora coincidente além da menção: o mesmo número de
    // contrato existe em dezenas de órgãos diferentes.
    const sameUnit = text(expense.codigoUnidadeGestora) === text(contract.codigoUG)
      || text(expense.unidadeGestora).toUpperCase() === text(contract.unidadeGestora).toUpperCase();
    const mentionsContract = new RegExp(`(?<!\\d)0*${numero}\\s*/\\s*${text(contract.anoContrato)}(?!\\d)`)
      .test(historico);
    if (!mentionsContract || !sameUnit) continue;

    associations.push({
      tipo: 'DESPESA',
      confidence: ASSOCIATION_CONFIDENCE.UNCERTAIN,
      basis: 'O histórico do empenho cita o número do contrato e a unidade gestora coincide. '
        + 'O dataset de despesas do TCE-PE não publica o código do contrato, então o vínculo é '
        + 'documental e não está comprovado por identificador.',
      numeroEmpenho: expense.numeroEmpenho ?? null,
      anoReferencia: expense.anoReferencia ?? null,
      // Data repassada porque a linha do tempo posiciona o empenho por ela.
      dataEmpenho: expense.dataEmpenho ?? null,
      valorEmpenhado: expense.valorEmpenhado ?? null,
      valorLiquidado: expense.valorLiquidado ?? null,
      valorPago: expense.valorPago ?? null,
      unidadeGestora: expense.unidadeGestora ?? null,
      sourceUrl: expense.sourceUrl ?? null,
      retrievedAt: expense.retrievedAt ?? null,
    });
  }
  return associations;
}

/**
 * Associa licitações ao contrato pelo código do processo licitatório.
 * `codigoPL` é publicado nos dois datasets e é o único vínculo oficial.
 */
function associateBids(contract, bids) {
  const codigoPL = text(contract.codigoPL);
  if (!codigoPL) return [];
  return bids
    .filter((bid) => text(bid.codigoPL) === codigoPL)
    .map((bid) => ({
      tipo: 'LICITACAO',
      confidence: ASSOCIATION_CONFIDENCE.CONFIRMED,
      basis: `O código do processo licitatório coincide nos dois registros (${codigoPL}).`,
      codigoPL: bid.codigoPL,
      modalidade: bid.modalidade ?? null,
      objeto: bid.objeto ?? null,
      situacao: bid.situacao ?? null,
      adjudicada: bid.adjudicada ?? null,
      valorAdjudicadoLicitante: bid.valorAdjudicadoLicitante ?? null,
      // Datas repassadas porque a linha do tempo precisa delas para posicionar
      // a licitação. Sem data confiável ela não entra — não se inventa posição.
      dataPublicacaoHomologacao: bid.dataPublicacaoHomologacao ?? null,
      dataSessaoAbertura: bid.dataSessaoAbertura ?? null,
      relationshipType: bid.relationshipType ?? RELATIONSHIP_TYPE.UNKNOWN,
      sourceUrl: bid.sourceUrl ?? null,
      retrievedAt: bid.retrievedAt ?? null,
    }));
}

/**
 * Associa obras ao contrato.
 *
 * O TCE-PE não publica vínculo entre contrato e obra: `ObrasDadosContratacao`
 * liga obra a CNPJ, e nada liga obra a contrato. Empresa mais município não é
 * evidência de que aquela obra decorre daquele contrato, então nenhuma
 * associação é afirmada — as obras da entidade ficam registradas fora do
 * contrato, e este campo declara por quê.
 */
function associateWorks() {
  return {
    associacoes: [],
    limitacao: 'O TCE-PE não publica identificador que ligue obra a contrato. As obras coletadas '
      + 'pertencem à entidade, mas não é possível afirmar de qual contrato cada uma decorre.',
  };
}

/** Cobertura por fonte, sem colapsar os estados num status global. */
function buildCoverage(providers) {
  const byProvider = {};
  for (const report of providers) {
    byProvider[report.provider] = {
      status: report.status,
      quantidade: report.quantidade,
      erros: report.erros ?? [],
      warnings: report.warnings ?? [],
    };
  }
  return byProvider;
}

const ContractIntelligenceService = {
  /**
   * Constrói os perfis de contrato a partir da coleta do TCE-PE.
   *
   * @param {object} tceResult retorno de `TcePeIntelligenceService.collect`.
   * @returns {object} perfis, órfãos e cobertura.
   */
  analyze(tceResult = {}, options = {}) {
    const generatedAt = new Date().toISOString();
    const contractRecords = Array.isArray(tceResult.contratos) ? tceResult.contratos : [];
    const additiveRecords = Array.isArray(tceResult.aditivos) ? tceResult.aditivos : [];
    const bidRecords = Array.isArray(tceResult.licitacoes) ? tceResult.licitacoes : [];
    const expenseRecords = Array.isArray(tceResult.despesas) ? tceResult.despesas : [];
    const workRecords = Array.isArray(tceResult.obras) ? tceResult.obras : [];
    const providers = Array.isArray(tceResult.providers) ? tceResult.providers : [];
    const coverage = buildCoverage(providers);
    const uf = tceResult.entity?.uf ?? null;
    // Processos do TCE-PE, quando o chamador já os tem. A camada não consulta.
    const processes = Array.isArray(options.processes) ? options.processes : [];

    const contracts = contractRecords.map((record) => buildContract(record, { uf }));

    // Cada termo é ligado ao seu contrato antes de virar evento; o que não
    // encontra contrato nesta coleta é preservado como órfão declarado.
    const eventsByContract = new Map(contracts.map((contract) => [contract.id, []]));
    const orphanAdditives = [];
    let sequence = 1;

    for (const record of additiveRecords) {
      const association = associateAdditive(record, contracts);
      const event = buildAdditiveEvent(record, association.contract, sequence);
      sequence += 1;
      event.associationConfidence = association.confidence;
      event.associationBasis = association.basis;

      if (!association.contract) {
        orphanAdditives.push(event);
        continue;
      }
      eventsByContract.get(association.contract.id).push(event);
    }

    const worksNote = associateWorks();

    const profiles = contracts.map((contract) => {
      const additiveEvents = dedupeEvents(eventsByContract.get(contract.id) || []);
      // O evento de assinatura vem primeiro e nunca é substituído por aditivo.
      // O desfecho, quando a fonte o nomeia, fecha a sequência.
      const closure = buildContractClosureEvent(contract);
      const events = [buildContractCreatedEvent(contract), ...additiveEvents, ...(closure ? [closure] : [])];
      const timeline = buildTimeline(events);
      const expenses = associateExpenses(contract, expenseRecords);
      const bids = associateBids(contract, bidRecords);

      const perfil = {
        contrato: contract,
        eventos: events,
        aditivos: additiveEvents,
        timeline,
        relacionamentos: {
          licitacoes: bids,
          despesas: expenses,
          obras: worksNote.associacoes,
          obrasLimitacao: worksNote.limitacao,
        },
        documentos: [
          contract.linkArquivo ? { tipo: 'CONTRATO', url: contract.linkArquivo, retrievedAt: contract.retrievedAt } : null,
          ...additiveEvents
            .filter((event) => event.linkArquivo)
            .map((event) => ({
              tipo: 'TERMO_ADITIVO',
              numero: event.numeroTermoAditivo,
              url: event.linkArquivo,
              retrievedAt: event.retrievedAt,
            })),
        ].filter(Boolean),
        // Estados por fonte, preservados lado a lado: contrato SUCCESS com
        // obras EMPTY e processos PARTIAL é informação, e um status global
        // esconderia exatamente a parte que importa.
        sourceStatuses: {
          contrato: coverage['tce-pe-contratos']?.status ?? SOURCE_STATUS.NOT_APPLICABLE,
          aditivos: coverage['tce-pe-aditivos']?.status ?? SOURCE_STATUS.NOT_APPLICABLE,
          licitacoes: coverage['tce-pe-licitacoes']?.status ?? SOURCE_STATUS.NOT_APPLICABLE,
          obras: coverage['tce-pe-obras']?.status ?? SOURCE_STATUS.NOT_APPLICABLE,
          despesas: coverage['tce-pe-despesas-municipais']?.status ?? SOURCE_STATUS.NOT_APPLICABLE,
        },
        resumo: {
          // Contagens, não avaliações. Quantos aditivos existem é fato; se são
          // muitos é leitura, e não pertence a esta camada.
          totalEventos: events.length,
          totalAditivos: additiveEvents.length,
          aditivosComValorPositivo: additiveEvents.filter((event) => (event.value ?? 0) > 0).length,
          aditivosComValorNegativo: additiveEvents.filter((event) => (event.value ?? 0) < 0).length,
          aditivosSemValor: additiveEvents.filter((event) => event.value === null).length,
          documentos: (contract.linkArquivo ? 1 : 0)
            + additiveEvents.filter((event) => event.linkArquivo).length,
          ordenacaoTemporal: timeline.ordering,
        },
      };

      // Linha do tempo detalhada: precisa do perfil montado, porque cruza os
      // eventos do contrato com licitação, empenho e processo.
      perfil.timelineDetalhada = buildContractTimeline(perfil, { processes });
      return perfil;
    });

    const totalAdditiveEvents = profiles.reduce((total, profile) => total + profile.aditivos.length, 0);

    return {
      generatedAt,
      entity: tceResult.entity ?? null,
      contratos: profiles,
      // Termos cujo contrato de origem não veio nesta coleta. Preservados: o
      // termo existe, e descartá-lo perderia um fato oficial.
      aditivosOrfaos: orphanAdditives,
      cobertura: coverage,
      resumo: {
        contratos: profiles.length,
        aditivos: totalAdditiveEvents,
        aditivosOrfaos: orphanAdditives.length,
        eventos: profiles.reduce((total, profile) => total + profile.eventos.length, 0),
        contratosComAditivo: profiles.filter((profile) => profile.aditivos.length > 0).length,
        contratosSemAditivo: profiles.filter((profile) => profile.aditivos.length === 0).length,
        licitacoesAssociadas: profiles.reduce(
          (total, profile) => total + profile.relacionamentos.licitacoes.length, 0,
        ),
        despesasAssociadas: profiles.reduce(
          (total, profile) => total + profile.relacionamentos.despesas.length, 0,
        ),
        obrasDaEntidade: workRecords.length,
        documentos: profiles.reduce((total, profile) => total + profile.documentos.length, 0),
        timelinesIncompletas: profiles.filter((profile) => profile.timeline.ordering !== 'COMPLETE').length,
      },
      limitacao: 'Esta camada organiza fatos publicados pelo TCE-PE em contratos e eventos. Não avalia '
        + 'regularidade, não calcula percentual de acréscimo e não classifica risco: valor, prazo e '
        + 'justificativa são preservados como a fonte os publicou. Quantidade de aditivos e variação de '
        + 'valores são dados a interpretar, não conclusões. Nenhum vínculo entre contrato e pagamento, '
        + 'obra ou licitação é afirmado sem identificador oficial que o sustente.',
    };
  },
};

module.exports = { ContractIntelligenceService, associateExpenses, associateBids, buildCoverage };
