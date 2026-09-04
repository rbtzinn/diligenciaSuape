// ==========================================================
// DILIGÊNCIA 360 — Inteligência de dados abertos do TCE-PE
// ==========================================================
// Orquestra a coleta nos datasets públicos do Tribunal e devolve evidência
// normalizada, com identidade resolvida e estado de consulta declarado.
//
// O fluxo respeita a divisão de responsabilidades já estabelecida:
//
//   Entity Profile   — quem é a entidade                        (Fase 1)
//   Search Matrix    — o que perguntar                          (etapa anterior)
//   TCE Provider     — como consultar o TCE                     (este módulo)
//   Source Status    — a consulta funcionou?                    (Fase 2)
//   Entity Resolution— o resultado é mesmo desta entidade?      (Fase 1)
//
// Nenhuma dessas decisões é retomada aqui. Este módulo executa, normaliza e
// contabiliza.
//
// O QUE ESTA CAMADA NÃO FAZ: não pontua risco, não classifica irregularidade e
// não deriva conclusão de volume. Um contrato encontrado é um FATO; muitos
// contratos são exposição a documentar; um aditivo é um fato com valor
// preservado. A leitura jurídica pertence à análise humana e a fases seguintes.
// ==========================================================

const { SOURCE_STATUS, resolveSourceStatus } = require('../../domain/source-status');
const { RELATIONSHIP_TYPE } = require('../../domain/relationship-type');
const { MATCH_LEVEL, buildEntityProfile } = require('../../entity-resolution/entity-resolution');
const { generateSearchMatrix } = require('../../search-matrix/search-query-generator');
const { SEARCH_CATEGORY } = require('../../search-matrix/search-vocabulary');
const { queryDataset, MAX_ROWS_PER_QUERY } = require('./tce-pe.client');
const {
  normalizeContract,
  normalizeAdditive,
  normalizeBid,
  normalizeWork,
  normalizeWorkContracting,
  normalizeExpense,
  normalizeSupplier,
  dedupeRecords,
} = require('./tce-pe.adapters');

const SOURCE_PAGE = 'https://sistemas.tce.pe.gov.br/DadosAbertos/Exemplo!listar';

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

// Orçamento global, no mesmo padrão adotado na Fase 2 para diários e PNCP: a
// rota devolve o que concluiu em vez de ser encerrada pela plataforma no meio.
const GLOBAL_DEADLINE_MS = envInt('TCE_PE_DEADLINE_MS', 45_000, 10_000, 55_000);
const MAX_WORK_LOOKUPS = envInt('TCE_PE_MAX_WORK_LOOKUPS', 15, 0, 60);

/**
 * Descritor de cada provider desta fase. `datasets` liga o provider da matriz
 * de pesquisa aos métodos oficiais do TCE-PE que o atendem.
 *
 * `cnpjParam` é o nome exato do parâmetro documentado em cada método — eles
 * divergem entre datasets (`NumeroDocumentoAjustado`, `CPFCNPJ`, `CPF_CNPJ`,
 * `NUMERODOCUMENTOAJUSTADO`), e usar o nome errado devolve a base inteira em
 * vez de um erro, o que seria pior do que falhar.
 */
const TCE_PROVIDERS = Object.freeze({
  TCE_SUPPLIERS: {
    id: 'tce-pe-fornecedores',
    label: 'TCE-PE — Fornecedores',
    category: SEARCH_CATEGORY.IDENTIDADE,
    method: 'Fornecedores',
    cnpjParam: 'CPFCNPJ',
    normalize: normalizeSupplier,
  },
  TCE_CONTRACTS: {
    id: 'tce-pe-contratos',
    label: 'TCE-PE — Contratos',
    category: SEARCH_CATEGORY.CONTRATOS,
    method: 'Contratos',
    cnpjParam: 'NumeroDocumentoAjustado',
    normalize: normalizeContract,
  },
  TCE_ADDITIVES: {
    id: 'tce-pe-aditivos',
    label: 'TCE-PE — Termos Aditivos',
    category: SEARCH_CATEGORY.ADITIVOS,
    method: 'TermoAditivo',
    cnpjParam: 'NumeroDocumentoAjustado',
    normalize: normalizeAdditive,
  },
  TCE_BIDS: {
    id: 'tce-pe-licitacoes',
    label: 'TCE-PE — Licitações e licitantes',
    category: SEARCH_CATEGORY.LICITACOES,
    method: 'LicitacoesDetalhes',
    cnpjParam: 'NUMERODOCUMENTOAJUSTADO',
    normalize: normalizeBid,
  },
  TCE_WORKS: {
    id: 'tce-pe-obras',
    label: 'TCE-PE — Obras e dados de contratação',
    category: SEARCH_CATEGORY.OBRAS,
    method: 'ObrasDadosContratacao',
    cnpjParam: 'CPFCNPJ',
    normalize: normalizeWorkContracting,
  },
  TCE_EXPENSES_MUNICIPAL: {
    id: 'tce-pe-despesas-municipais',
    label: 'TCE-PE — Despesas Municipais',
    category: SEARCH_CATEGORY.PAGAMENTOS,
    method: 'DespesasMunicipais',
    cnpjParam: 'CPF_CNPJ',
    normalize: normalizeExpense,
  },
  TCE_EXPENSES_STATE: {
    id: 'tce-pe-despesas-estaduais',
    label: 'TCE-PE — Despesas Estaduais',
    category: SEARCH_CATEGORY.PAGAMENTOS,
    method: 'DespesasEstaduais',
    cnpjParam: 'CPF_CNPJ',
    normalize: normalizeExpense,
  },
});

/** Converte a natureza da falha do cliente no vocabulário da Fase 2. */
function statusFromFailure(kind) {
  if (kind === 'INVALID_RESPONSE') return SOURCE_STATUS.ERROR;
  if (kind === 'HTTP_ERROR') return SOURCE_STATUS.ERROR;
  return SOURCE_STATUS.UNAVAILABLE;
}

/**
 * Executa um provider e devolve o relatório completo da execução.
 *
 * Falha nunca vira lista vazia silenciosa: `status` distingue EMPTY (a fonte
 * respondeu e não há registro) de UNAVAILABLE (não foi possível perguntar).
 */
async function runProvider(descriptor, profile, params, options = {}) {
  const { deadlineAt, forceRefresh = false } = options;
  const executedQueries = [];
  const errors = [];
  const warnings = [];
  const retrievedAt = new Date().toISOString();

  if (deadlineAt && Date.now() >= deadlineAt) {
    return {
      provider: descriptor.id,
      providerLabel: descriptor.label,
      endpoint: descriptor.method,
      category: descriptor.category,
      status: SOURCE_STATUS.UNAVAILABLE,
      queriesExecutadas: 0,
      resultados: [],
      descartados: [],
      quantidade: 0,
      erros: ['Consulta não iniciada: o orçamento de tempo da rota se esgotou antes.'],
      warnings: [],
      retrievedAt,
    };
  }

  const response = await queryDataset(descriptor.method, params, { forceRefresh });
  executedQueries.push({
    endpoint: descriptor.method,
    params,
    url: response.url,
    ok: response.ok,
    linhas: response.rows.length,
    totalLinhas: response.totalRows,
    truncado: response.truncated,
    erro: response.erro,
  });

  if (!response.ok) {
    errors.push(response.erro);
    return {
      provider: descriptor.id,
      providerLabel: descriptor.label,
      endpoint: descriptor.method,
      category: descriptor.category,
      status: statusFromFailure(response.kind),
      queriesExecutadas: executedQueries,
      resultados: [],
      descartados: [],
      quantidade: 0,
      erros: errors,
      warnings,
      retrievedAt: response.retrievedAt,
    };
  }

  if (response.truncated) {
    warnings.push(
      `A fonte devolveu ${response.totalRows} registros e ${response.rows.length} foram processados `
      + `(teto local de ${MAX_ROWS_PER_QUERY}). A cobertura desta consulta está incompleta.`,
    );
  }

  const context = { method: descriptor.method, params, retrievedAt: response.retrievedAt };
  const normalized = response.rows.map((row) => descriptor.normalize(row, profile, context));

  // Falso positivo sai da lista principal e permanece auditável: um registro de
  // CNPJ divergente é justamente o que precisa ser mostrado como descartado.
  const retained = dedupeRecords(
    normalized.filter((record) => record.relationshipType !== RELATIONSHIP_TYPE.FALSE_POSITIVE),
  );
  const discarded = normalized
    .filter((record) => record.relationshipType === RELATIONSHIP_TYPE.FALSE_POSITIVE)
    .map((record) => ({
      tipo: record.tipo,
      razaoSocial: record.razaoSocial || record.nome || record.contratado || null,
      cpfCnpj: record.cpfCnpj || null,
      numeroContrato: record.numeroContrato || null,
      level: record.entityMatch?.level || MATCH_LEVEL.FALSE_POSITIVE,
      basis: record.entityMatch?.basis || null,
      sourceUrl: record.sourceUrl || null,
    }));

  const status = response.truncated
    ? SOURCE_STATUS.PARTIAL
    : resolveSourceStatus({ attempted: 1, succeeded: 1, resultCount: retained.length });

  return {
    provider: descriptor.id,
    providerLabel: descriptor.label,
    endpoint: descriptor.method,
    category: descriptor.category,
    status,
    queriesExecutadas: executedQueries,
    resultados: retained,
    descartados: discarded,
    quantidade: retained.length,
    descartadosCount: discarded.length,
    totalLinhasNaFonte: response.totalRows,
    truncado: response.truncated,
    cached: Boolean(response.cached),
    erros: errors,
    warnings,
    retrievedAt: response.retrievedAt,
  };
}

/**
 * Enriquece obras: `ObrasDadosContratacao` identifica o contratado mas não
 * descreve a obra, e `Obras` descreve a obra mas não traz CPF/CNPJ. O vínculo
 * só existe pelo código, e é por ele que a ficha é buscada.
 */
async function enrichWorks(contractingRecords, options = {}) {
  const { deadlineAt, forceRefresh = false } = options;
  const codes = [...new Set(contractingRecords.map((record) => record.codigoObra).filter(Boolean))]
    .slice(0, MAX_WORK_LOOKUPS);
  const works = [];
  const warnings = [];

  for (const code of codes) {
    if (deadlineAt && Date.now() >= deadlineAt) {
      warnings.push('Parte das fichas de obra não foi consultada: o orçamento de tempo se esgotou.');
      break;
    }
    const response = await queryDataset('Obras', { Codigo: code }, { forceRefresh });
    if (!response.ok) {
      warnings.push(`Ficha da obra ${code} indisponível: ${response.erro}`);
      continue;
    }
    for (const row of response.rows) {
      works.push(normalizeWork(row, {
        method: 'Obras',
        params: { Codigo: code },
        retrievedAt: response.retrievedAt,
      }));
    }
  }
  return { works: dedupeRecords(works), warnings };
}

const TcePeIntelligenceService = {
  TCE_PROVIDERS,

  /**
   * Coleta a exposição da entidade nos dados abertos do TCE-PE.
   *
   * @param {object} company dados cadastrais e QSA da entidade.
   * @param {object} [options]
   * @param {string[]} [options.providers] restringe os providers executados.
   * @param {boolean} [options.forceRefresh] ignora o cache.
   */
  async collect(company = {}, options = {}) {
    const profile = company && company.entityId ? company : buildEntityProfile(company);
    const consultedAt = new Date().toISOString();
    const cnpj = profile.cnpjNormalized;

    // Sem CNPJ não há consulta possível: todo dataset desta fase filtra por
    // documento. A busca nominal existe apenas em `Processos`, que continua sob
    // o serviço já validado e não é reimplementada aqui.
    if (cnpj.length !== 14) {
      return {
        ok: false,
        status: 400,
        sourceStatus: SOURCE_STATUS.NOT_APPLICABLE,
        provider: 'TCE-PE — Dados Abertos',
        sourceUrl: SOURCE_PAGE,
        consultadoEm: consultedAt,
        entity: { entityId: profile.entityId, cnpj: profile.cnpj || null, razaoSocial: profile.razaoSocial || null },
        providers: [],
        contratos: [],
        aditivos: [],
        licitacoes: [],
        obras: [],
        obrasContratacao: [],
        despesas: [],
        fornecedores: [],
        descartados: [],
        resumo: { contratos: 0, aditivos: 0, licitacoes: 0, obras: 0, despesas: 0, descartados: 0 },
        erro: 'Os datasets de contratos, aditivos, licitações, obras e despesas do TCE-PE filtram por '
          + 'CPF/CNPJ. Sem o CNPJ da entidade não há consulta possível nestes endpoints.',
        limitacao: 'A ausência de CNPJ não significa ausência de registros no TCE-PE.',
      };
    }

    // A matriz decide o que perguntar; este módulo apenas registra a decisão.
    // Nenhuma consulta da matriz é marcada como executada aqui: o que executa é
    // o provider, com os parâmetros documentados de cada dataset.
    const matrix = generateSearchMatrix(profile, {
      categories: [
        SEARCH_CATEGORY.IDENTIDADE, SEARCH_CATEGORY.CONTRATOS, SEARCH_CATEGORY.ADITIVOS,
        SEARCH_CATEGORY.LICITACOES, SEARCH_CATEGORY.OBRAS, SEARCH_CATEGORY.PAGAMENTOS,
      ],
    });
    const plannedQueries = matrix.queries.filter((query) => (
      query.providers.some((id) => id.startsWith('tce-pe'))
    ));

    const selected = Object.values(TCE_PROVIDERS).filter((descriptor) => (
      !options.providers || options.providers.includes(descriptor.id)
    ));

    const deadlineAt = Date.now() + GLOBAL_DEADLINE_MS;
    const reports = [];
    for (const descriptor of selected) {
      reports.push(await runProvider(
        descriptor,
        profile,
        { [descriptor.cnpjParam]: cnpj },
        { deadlineAt, forceRefresh: options.forceRefresh },
      ));
    }

    const byProvider = (id) => reports.find((report) => report.provider === id);
    const resultsOf = (id) => byProvider(id)?.resultados || [];

    const obrasContratacao = resultsOf('tce-pe-obras');
    const { works, warnings: workWarnings } = obrasContratacao.length > 0
      ? await enrichWorks(obrasContratacao, { deadlineAt, forceRefresh: options.forceRefresh })
      : { works: [], warnings: [] };
    const worksReport = byProvider('tce-pe-obras');
    if (worksReport && workWarnings.length > 0) worksReport.warnings.push(...workWarnings);

    const despesas = [
      ...resultsOf('tce-pe-despesas-municipais'),
      ...resultsOf('tce-pe-despesas-estaduais'),
    ];
    const descartados = reports.flatMap((report) => (report.descartados || []).map((item) => ({
      ...item,
      provider: report.provider,
    })));

    const succeeded = reports.filter((report) => (
      report.status === SOURCE_STATUS.SUCCESS
      || report.status === SOURCE_STATUS.EMPTY
      || report.status === SOURCE_STATUS.PARTIAL
    )).length;
    const totalResults = reports.reduce((total, report) => total + report.quantidade, 0);
    const anyPartial = reports.some((report) => report.status === SOURCE_STATUS.PARTIAL);
    const sourceStatus = succeeded === 0
      ? SOURCE_STATUS.UNAVAILABLE
      : anyPartial || succeeded < reports.length
        ? SOURCE_STATUS.PARTIAL
        : resolveSourceStatus({ attempted: reports.length, succeeded, resultCount: totalResults });

    return {
      ok: succeeded > 0,
      status: succeeded > 0 ? 200 : 503,
      sourceStatus,
      provider: 'TCE-PE — Dados Abertos',
      sourceUrl: SOURCE_PAGE,
      consultadoEm: consultedAt,
      entity: {
        entityId: profile.entityId,
        cnpj: profile.cnpj,
        cnpjNormalizado: cnpj,
        razaoSocial: profile.razaoSocial || null,
        municipio: profile.municipio || null,
        uf: profile.uf || null,
      },
      // Relatório por provider, sem esconder falha: é o que a camada de
      // cobertura consumirá para saber o que foi e o que não foi consultado.
      providers: reports.map((report) => ({
        provider: report.provider,
        providerLabel: report.providerLabel,
        endpoint: report.endpoint,
        category: report.category,
        status: report.status,
        queriesExecutadas: report.queriesExecutadas,
        quantidade: report.quantidade,
        descartados: report.descartadosCount || 0,
        totalLinhasNaFonte: report.totalLinhasNaFonte ?? null,
        truncado: Boolean(report.truncado),
        erros: report.erros,
        warnings: report.warnings,
        retrievedAt: report.retrievedAt,
      })),
      contratos: resultsOf('tce-pe-contratos'),
      aditivos: resultsOf('tce-pe-aditivos'),
      licitacoes: resultsOf('tce-pe-licitacoes'),
      obrasContratacao,
      obras: works,
      despesas,
      fornecedores: resultsOf('tce-pe-fornecedores'),
      descartados,
      // Consultas que a matriz planejou para o TCE, declaradas sem execução:
      // planejar não é consultar, e o campo existe para deixar isso explícito.
      matrizDePesquisa: {
        planejadas: plannedQueries.length,
        consultas: plannedQueries.map((query) => ({
          query: query.query,
          category: query.category,
          priority: query.priority,
          providers: query.providers,
          status: query.status,
          reason: query.reason,
        })),
      },
      resumo: {
        contratos: resultsOf('tce-pe-contratos').length,
        aditivos: resultsOf('tce-pe-aditivos').length,
        licitacoes: resultsOf('tce-pe-licitacoes').length,
        obras: works.length,
        obrasContratacao: obrasContratacao.length,
        despesas: despesas.length,
        fornecedores: resultsOf('tce-pe-fornecedores').length,
        descartados: descartados.length,
        // Estágios da despesa somados por natureza, nunca entre si.
        valorEmpenhado: despesas.reduce((total, item) => total + (item.valorEmpenhado || 0), 0),
        valorLiquidado: despesas.reduce((total, item) => total + (item.valorLiquidado || 0), 0),
        valorPago: despesas.reduce((total, item) => total + (item.valorPago || 0), 0),
        providersConsultados: reports.length,
        providersIndisponiveis: reports.filter((report) => (
          report.status === SOURCE_STATUS.UNAVAILABLE || report.status === SOURCE_STATUS.ERROR
        )).length,
      },
      limitacao: 'Coleta restrita aos datasets públicos do TCE-PE que aceitam filtro por CPF/CNPJ. '
        + 'A identidade de cada registro é confirmada pelo documento publicado pela própria fonte; '
        + 'registros de CNPJ divergente são separados como descartados. Ausência de registro significa '
        + 'que não foram encontrados registros na consulta realizada, e não que a empresa não possua '
        + 'contratos, obras ou despesas — a cobertura dos dados abertos do Tribunal é a que o próprio '
        + 'Tribunal publica. Nenhum valor ou percentual aqui coletado constitui, por si só, indício de '
        + 'irregularidade.',
    };
  },
};

module.exports = { TcePeIntelligenceService, TCE_PROVIDERS, runProvider, statusFromFailure };
