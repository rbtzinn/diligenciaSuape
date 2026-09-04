// ==========================================================
// DILIGÊNCIA 360 — Vocabulário da matriz de pesquisa
// ==========================================================
// Categorias, prioridades, estado de execução e catálogo de provedores.
//
// Uma decisão governa este arquivo: GERAR UMA CONSULTA NÃO É EXECUTÁ-LA. A
// matriz descreve o que faz sentido perguntar a cada fonte; se a pergunta foi
// feita, e o que a fonte respondeu, é assunto do `SOURCE_STATUS` da Fase 2.
// Misturar as duas coisas faria uma fonte nunca consultada aparecer como
// consultada e sem ocorrência — exatamente o defeito que a Fase 2 corrigiu.
//
// Por isso há dois eixos separados em cada consulta:
//   `status`       — o que aconteceu com a CONSULTA (planejada, executada…)
//   `sourceStatus` — o que a FONTE respondeu, e só existe após a execução.
// ==========================================================

const { SOURCE_STATUS } = require('../domain/source-status');

/**
 * Eixos de investigação. Reaproveitam os nomes já usados no dossiê e nas rotas,
 * para que a matriz e o relatório falem a mesma língua.
 */
const SEARCH_CATEGORY = Object.freeze({
  IDENTIDADE: 'IDENTIDADE',
  CONTRATOS: 'CONTRATOS',
  LICITACOES: 'LICITACOES',
  ADITIVOS: 'ADITIVOS',
  OBRAS: 'OBRAS',
  PAGAMENTOS: 'PAGAMENTOS',
  PROCESSOS: 'PROCESSOS',
  CONTROLE_EXTERNO: 'CONTROLE_EXTERNO',
  DIARIO_OFICIAL: 'DIARIO_OFICIAL',
  PNCP: 'PNCP',
  MEDIA: 'MEDIA',
  SANCOES: 'SANCOES',
  PESSOAS: 'PESSOAS',
  RELACIONAMENTOS: 'RELACIONAMENTOS',
});

/**
 * Prioridade responde "o que consultar primeiro", e nada além disso.
 *
 * Prioridade NÃO É RISCO. Uma consulta por CNPJ em fonte oficial é CRITICAL
 * porque é a que mais rende identidade confirmada por unidade de tempo — não
 * porque a empresa seja suspeita. Confundir os dois eixos faria uma empresa
 * bem documentada parecer mais arriscada justamente por ser fácil de verificar.
 */
const QUERY_PRIORITY = Object.freeze({
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

const PRIORITY_RANK = Object.freeze({ CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 });

/** Estado da CONSULTA. Não descreve o que a fonte respondeu. */
const QUERY_STATUS = Object.freeze({
  /** Gerada pela matriz e ainda não executada. Estado inicial de toda consulta. */
  PLANNED: 'PLANNED',
  /** Deliberadamente não executada (provedor ausente, orçamento, escolha humana). */
  SKIPPED: 'SKIPPED',
  /** Executada; a resposta da fonte está em `sourceStatus`. */
  EXECUTED: 'EXECUTED',
});

/**
 * Chance de a consulta trazer material de outra entidade.
 *
 * Estimativa sobre a CONSULTA, não veredito sobre um resultado: quem decide se
 * um documento é da empresa continua sendo o Entity Resolution da Fase 1. Aqui
 * o campo serve para ordenar o esforço e avisar quem lê a matriz de que aquela
 * pergunta é ruidosa por natureza.
 */
const FALSE_POSITIVE_RISK = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

/** Naturezas de identificador que uma consulta pode usar. */
const IDENTIFIER_KIND = Object.freeze({
  CNPJ: 'CNPJ',
  CNPJ_FORMATTED: 'CNPJ_FORMATTED',
  CORPORATE_NAME: 'CORPORATE_NAME',
  TRADE_NAME: 'TRADE_NAME',
  PARTNER_NAME: 'PARTNER_NAME',
  CONTRACT_NUMBER: 'CONTRACT_NUMBER',
  PROCESS_NUMBER: 'PROCESS_NUMBER',
});

/**
 * Catálogo de fontes. Todas públicas e gratuitas; nenhuma exige cartão.
 *
 * `implemented` diz se o Diligência 360 já possui adaptador para a fonte. As
 * marcadas como `false` são endpoints públicos verificados do TCE-PE que ainda
 * não têm adaptador: a matriz planeja a consulta e declara que ela não pode ser
 * executada hoje. Declarar o vazio é o oposto de fingir que ele não existe.
 */
const PROVIDERS = Object.freeze({
  'receita-cnpj': {
    label: 'Receita Federal — cadastro de CNPJ (BrasilAPI / Minha Receita)',
    categories: [SEARCH_CATEGORY.IDENTIDADE],
    requiresCnpj: true,
    allowsName: false,
    official: true,
    implemented: true,
  },
  'cgu-ceis': {
    label: 'CGU — CEIS (Empresas Inidôneas e Suspensas)',
    categories: [SEARCH_CATEGORY.SANCOES],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: true,
  },
  'cgu-cnep': {
    label: 'CGU — CNEP (Cadastro Nacional de Empresas Punidas)',
    categories: [SEARCH_CATEGORY.SANCOES],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: true,
  },
  'cgu-pep': {
    label: 'CGU — Pessoas Expostas Politicamente',
    categories: [SEARCH_CATEGORY.PESSOAS],
    requiresCnpj: false,
    allowsName: true,
    official: true,
    implemented: true,
  },
  'cgu-federal-exposure': {
    label: 'Portal da Transparência — contratos e pagamentos federais',
    categories: [SEARCH_CATEGORY.CONTRATOS, SEARCH_CATEGORY.PAGAMENTOS],
    requiresCnpj: true,
    allowsName: false,
    official: true,
    implemented: true,
  },
  'pncp-contratos': {
    label: 'PNCP — Portal Nacional de Contratações Públicas',
    categories: [SEARCH_CATEGORY.PNCP, SEARCH_CATEGORY.CONTRATOS, SEARCH_CATEGORY.LICITACOES],
    requiresCnpj: false,
    allowsName: true,
    official: true,
    implemented: true,
  },
  'tce-pe-processos': {
    label: 'TCE-PE — processos de controle externo',
    categories: [SEARCH_CATEGORY.CONTROLE_EXTERNO],
    requiresCnpj: false,
    allowsName: true,
    official: true,
    implemented: true,
  },
  'querido-diario': {
    label: 'Querido Diário — diários oficiais municipais',
    categories: [SEARCH_CATEGORY.DIARIO_OFICIAL],
    requiresCnpj: false,
    allowsName: true,
    official: true,
    implemented: true,
  },
  'datajud': {
    label: 'DataJud/CNJ — processos judiciais por numeração única',
    categories: [SEARCH_CATEGORY.PROCESSOS],
    requiresCnpj: false,
    allowsName: false,
    official: true,
    implemented: true,
  },
  'adverse-media': {
    label: 'Pesquisa pública multi-fonte (notícias e web)',
    categories: [SEARCH_CATEGORY.MEDIA],
    requiresCnpj: false,
    allowsName: true,
    official: false,
    implemented: true,
  },
  'offshore-leaks': {
    label: 'ICIJ Offshore Leaks — reconciliação nominal',
    categories: [SEARCH_CATEGORY.RELACIONAMENTOS],
    requiresCnpj: false,
    allowsName: true,
    official: false,
    implemented: true,
  },
  'minha-receita-grafo': {
    label: 'Minha Receita — expansão societária por CNPJ',
    categories: [SEARCH_CATEGORY.RELACIONAMENTOS],
    requiresCnpj: true,
    allowsName: false,
    official: true,
    implemented: true,
  },

  // Endpoints públicos e gratuitos do TCE-PE (Dados Abertos), sem chave, ainda
  // sem adaptador neste sistema. Planejáveis hoje, executáveis na próxima fase.
  'tce-pe-contratos': {
    label: 'TCE-PE Dados Abertos — Contratos',
    categories: [SEARCH_CATEGORY.CONTRATOS],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: false,
  },
  'tce-pe-aditivos': {
    label: 'TCE-PE Dados Abertos — Termos Aditivos',
    categories: [SEARCH_CATEGORY.ADITIVOS],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: false,
  },
  'tce-pe-licitacoes': {
    label: 'TCE-PE Dados Abertos — Licitações e licitantes',
    categories: [SEARCH_CATEGORY.LICITACOES],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: false,
  },
  'tce-pe-obras': {
    label: 'TCE-PE Dados Abertos — Obras e dados de contratação',
    categories: [SEARCH_CATEGORY.OBRAS],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: false,
  },
  'tce-pe-sancoes': {
    label: 'TCE-PE Dados Abertos — Sanções',
    categories: [SEARCH_CATEGORY.SANCOES],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: false,
  },
  'tce-pe-debitos-multas': {
    label: 'TCE-PE Dados Abertos — Débitos e multas',
    categories: [SEARCH_CATEGORY.CONTROLE_EXTERNO],
    requiresCnpj: true,
    allowsName: true,
    official: true,
    implemented: false,
  },
});

function providerExists(providerId) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, providerId);
}

function isPriorityAtLeast(priority, minimum) {
  return (PRIORITY_RANK[priority] ?? -1) >= (PRIORITY_RANK[minimum] ?? Number.POSITIVE_INFINITY);
}

module.exports = {
  SEARCH_CATEGORY,
  QUERY_PRIORITY,
  PRIORITY_RANK,
  QUERY_STATUS,
  FALSE_POSITIVE_RISK,
  IDENTIFIER_KIND,
  PROVIDERS,
  SOURCE_STATUS,
  providerExists,
  isPriorityAtLeast,
};
