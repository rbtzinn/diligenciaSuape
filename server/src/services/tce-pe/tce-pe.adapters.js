// ==========================================================
// DILIGÊNCIA 360 — Normalizadores dos datasets do TCE-PE
// ==========================================================
// Converte a linha bruta de cada dataset em registro estável, preservando a
// origem. Toda função aqui é pura: recebe linha e perfil, devolve registro.
//
// Três regras governam este arquivo:
//
// 1. O REGISTRO BRUTO NUNCA É DESCARTADO. Fica em `raw`, porque a normalização
//    é interpretação e interpretação precisa poder ser conferida contra o que a
//    fonte de fato publicou.
//
// 2. IDENTIDADE NÃO SE DECIDE AQUI. O adaptador chama o Entity Resolution da
//    Fase 1 e carrega o veredito; não inventa critério próprio, não usa
//    substring e não trata nome semelhante como confirmação.
//
// 3. NADA É INTERPRETADO COMO IRREGULARIDADE. Um aditivo de 37,73% é um número
//    preservado, não um alerta. A leitura jurídica pertence a fases posteriores
//    e à análise humana.
// ==========================================================

const { MATCH_LEVEL, resolveEntityMatch } = require('../../entity-resolution/entity-resolution');
const { RELATIONSHIP_TYPE } = require('../../domain/relationship-type');
const { datasetUrl } = require('./tce-pe.client');

const PROVIDER = 'TCE-PE — Dados Abertos';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Número com vírgula ou ponto decimal; `null` quando a fonte não informou. */
function amount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCnpj(value) {
  const raw = digits(value);
  if (raw.length !== 14) return text(value);
  return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function secureUrl(value) {
  const url = text(value);
  return url ? url.replace(/^http:\/\//i, 'https://') : null;
}

/** "18/12/2018 a 18/02/2019" — formato de vigência do TCE-PE. */
function parseValidity(value) {
  const raw = text(value);
  const dates = raw.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
  return { vigencia: raw || null, vigenciaInicio: dates[0] || null, vigenciaFim: dates[1] || null };
}

/** Esfera vem como "E " ou "M " — com espaço de preenchimento. */
function sphere(value) {
  const code = text(value).toUpperCase();
  if (code === 'E') return { esfera: 'E', esferaNome: 'Estadual' };
  if (code === 'M') return { esfera: 'M', esferaNome: 'Municipal' };
  return { esfera: code || null, esferaNome: null };
}

/**
 * Resolve identidade de um registro em que a fonte publica o CPF/CNPJ do
 * contratado como campo estruturado.
 *
 * Quando o CNPJ do registro é o da entidade, a identidade está confirmada pela
 * própria fonte oficial — não há texto a interpretar. Quando é outro CNPJ, o
 * registro é de outra empresa, e nome parecido não muda isso: é o caso da
 * homônima de outro estado. Só na ausência de documento a decisão volta para o
 * Entity Resolution, que julga o nome com o contexto disponível.
 */
function resolveByDocument(profile, rowDocument, contextText) {
  const rowCnpj = digits(rowDocument);
  const target = profile.cnpjNormalized;

  if (rowCnpj.length >= 11 && target.length === 14) {
    if (rowCnpj === target) {
      return {
        entityMatch: {
          level: MATCH_LEVEL.CONFIRMED,
          score: 100,
          confidence: 100,
          basis: 'CPF/CNPJ do contratado no registro oficial do TCE-PE é o da entidade investigada.',
          signals: [{
            code: 'EXACT_CNPJ',
            label: 'Identificador do contratado coincide no campo estruturado da fonte',
            points: 100,
            matched: true,
            detail: formatCnpj(rowCnpj),
          }],
          matched: {
            cnpj: true,
            corporateName: false,
            tradeName: false,
            municipality: false,
            state: false,
            partner: false,
            partnerName: null,
            knownContract: false,
            distinctiveTokenCoverage: 100,
          },
        },
        relationshipType: RELATIONSHIP_TYPE.CONTRACTOR,
      };
    }
    return {
      entityMatch: {
        level: MATCH_LEVEL.FALSE_POSITIVE,
        score: -100,
        confidence: 0,
        basis: `O registro pertence a outro CPF/CNPJ (${formatCnpj(rowCnpj)}). `
          + 'Nome empresarial semelhante não transfere a titularidade do registro.',
        signals: [{
          code: 'INCOMPATIBLE_IDENTIFIER',
          label: 'O contratado do registro é outra pessoa jurídica',
          points: -100,
          matched: false,
          detail: formatCnpj(rowCnpj),
        }],
        matched: {
          cnpj: false,
          corporateName: false,
          tradeName: false,
          municipality: false,
          state: false,
          partner: false,
          partnerName: null,
          knownContract: false,
          distinctiveTokenCoverage: 0,
        },
      },
      relationshipType: RELATIONSHIP_TYPE.FALSE_POSITIVE,
    };
  }

  // Sem documento na linha: a identidade volta a depender do nome e do contexto.
  const entityMatch = resolveEntityMatch(profile, { text: contextText });
  const confirmed = entityMatch.level === MATCH_LEVEL.CONFIRMED
    || entityMatch.level === MATCH_LEVEL.HIGH_CONFIDENCE;
  return {
    entityMatch,
    relationshipType: entityMatch.level === MATCH_LEVEL.FALSE_POSITIVE
      ? RELATIONSHIP_TYPE.FALSE_POSITIVE
      : confirmed ? RELATIONSHIP_TYPE.CONTRACTOR : RELATIONSHIP_TYPE.UNKNOWN,
  };
}

/** Proveniência comum a todo registro normalizado. */
function evidence(method, params, retrievedAt, linkArquivo) {
  return {
    source: PROVIDER,
    provider: 'tce-pe',
    endpoint: method,
    query: datasetUrl(method, params),
    params,
    // Documento oficial do registro, quando a fonte publica o arquivo.
    sourceUrl: secureUrl(linkArquivo) || datasetUrl(method, params),
    retrievedAt,
  };
}

// ==========================================================
// Contratos — método `Contratos`
// ==========================================================

function normalizeContract(row, profile, context = {}) {
  const { method = 'Contratos', params = {}, retrievedAt = new Date().toISOString() } = context;
  const identity = resolveByDocument(
    profile,
    row.NumeroDocumentoAjustado || row.CPF_CNPJ || row.NumeroDocumento,
    [row.RazaoSocial, row.Objeto, row.UnidadeGestora, row.Municipio].filter(Boolean).join(' '),
  );

  return {
    tipo: 'CONTRATO',
    // Código do contrato no LICON: identificador oficial, base da deduplicação.
    codigoContrato: text(row.CodigoContrato) || null,
    numeroContrato: text(row.NumeroContrato) || null,
    anoContrato: text(row.AnoContrato) || null,
    codigoPL: text(row.CodigoPL) || null,
    numeroProcesso: text(row.NumeroProcesso) || null,
    anoProcesso: text(row.AnoProcesso) || null,
    tipoProcesso: text(row.TipoProcesso) || null,
    unidadeGestora: text(row.UnidadeGestora) || null,
    unidadeOrcamentaria: text(row.UnidadeOrcamentaria) || null,
    siglaUG: text(row.SiglaUG) || null,
    codigoUG: text(row.CodigoUG) || null,
    ...sphere(row.Esfera),
    municipio: text(row.Municipio) || null,
    cpfCnpj: formatCnpj(row.NumeroDocumentoAjustado || row.CPF_CNPJ),
    cpfCnpjNormalizado: digits(row.NumeroDocumentoAjustado || row.CPF_CNPJ) || null,
    razaoSocial: text(row.RazaoSocial) || null,
    objeto: text(row.Objeto) || null,
    ...parseValidity(row.Vigencia),
    valor: amount(row.Valor),
    estagio: text(row.Estagio) || null,
    situacao: text(row.Situacao) || null,
    portariaComissaoLicitacao: text(row.PortariaComissaoLicitacao) || null,
    linkArquivo: secureUrl(row.LinkArquivo),
    ...identity,
    ...evidence(method, params, retrievedAt, row.LinkArquivo),
    raw: row,
  };
}

// ==========================================================
// Termos aditivos — método `TermoAditivo`
// ==========================================================

function normalizeAdditive(row, profile, context = {}) {
  const { method = 'TermoAditivo', params = {}, retrievedAt = new Date().toISOString() } = context;
  const identity = resolveByDocument(
    profile,
    row.NumeroDocumentoAjustado || row.CPF_CNPJ || row.NumeroDocumento,
    [row.RazaoSocial, row.ObjetoAditivo, row.UnidadeGestora, row.Municipio].filter(Boolean).join(' '),
  );

  return {
    tipo: 'TERMO_ADITIVO',
    numeroTermoAditivo: text(row.NumeroTermoAditivo) || null,
    anoTermoAditivo: text(row.AnoTermoAditivo) || null,
    numeroContrato: text(row.NumeroContrato) || null,
    anoContrato: text(row.AnoContrato) || null,
    codigoContrato: text(row.CodigoContrato) || null,
    unidadeGestora: text(row.UnidadeGestora) || null,
    siglaUG: text(row.SiglaUG) || null,
    codigoUG: text(row.CodigoUG) || null,
    ...sphere(row.Esfera),
    municipio: text(row.Municipio) || null,
    cpfCnpj: formatCnpj(row.NumeroDocumentoAjustado || row.CPF_CNPJ),
    cpfCnpjNormalizado: digits(row.NumeroDocumentoAjustado || row.CPF_CNPJ) || null,
    razaoSocial: text(row.RazaoSocial) || null,
    objetoAditivo: text(row.ObjetoAditivo) || null,
    // Preservada como a fonte publicou. O TCE-PE grava este campo com "?" no
    // lugar dos acentos — "acr?scimo" —, defeito do dado publicado e não da
    // leitura. Normalizar por conta própria apagaria a evidência do original.
    justificativaTermoAditivo: text(row.JustificativaTermoAditivo) || null,
    // Valor bruto preservado, com sinal. Negativo indica supressão na origem.
    // Nenhuma soma, nenhum percentual e nenhuma conclusão são derivados aqui:
    // acréscimo, reajuste e reequilíbrio têm naturezas jurídicas distintas, e
    // separá-las é trabalho da fase de inteligência contratual.
    valorTermoAditivo: amount(row.ValorTermoAditivo),
    ...parseValidity(row.Vigencia),
    estagio: text(row.Estagio) || null,
    situacao: text(row.Situacao) || null,
    linkArquivo: secureUrl(row.LinkArquivo),
    ...identity,
    ...evidence(method, params, retrievedAt, row.LinkArquivo),
    raw: row,
  };
}

// ==========================================================
// Licitações — método `LicitacoesDetalhes` (linha por licitante)
// ==========================================================

function normalizeBid(row, profile, context = {}) {
  const { method = 'LicitacoesDetalhes', params = {}, retrievedAt = new Date().toISOString() } = context;
  const identity = resolveByDocument(
    profile,
    row.NUMERODOCUMENTOAJUSTADO,
    [row.RAZAOSOCIAL, row.DESCRICAOOBJETO, row.UG].filter(Boolean).join(' '),
  );

  // A empresa é licitante. Só é contratada se a licitação lhe foi adjudicada;
  // participar de certame não é vencer certame.
  const adjudicated = /^S/i.test(text(row.ADJUDICADA)) || amount(row.TOTALADJUDICADOLICITANTE) > 0;
  const relationshipType = identity.relationshipType === RELATIONSHIP_TYPE.FALSE_POSITIVE
    ? RELATIONSHIP_TYPE.FALSE_POSITIVE
    : adjudicated ? RELATIONSHIP_TYPE.CONTRACTOR : RELATIONSHIP_TYPE.PARTY;

  return {
    tipo: 'LICITACAO',
    codigoPL: text(row.CODIGOPL) || null,
    numeroProcesso: text(row.NUMEROPROCESSO) || null,
    anoProcesso: text(row.ANOPROCESSO) || null,
    numeroModalidade: text(row.NUMEROMODALIDADE) || null,
    anoModalidade: text(row.ANOMODALIDADE) || null,
    modalidade: text(row.NOMEMODALIDADE) || null,
    natureza: text(row.NOMENATUREZA) || null,
    situacao: text(row.SITUACAOLICITACAO) || null,
    estagio: text(row.ESTAGIOLICITACAO) || null,
    unidadeGestora: text(row.UG) || null,
    codigoUG: text(row.CODIGOUG) || null,
    codigoMunicipio: text(row.CODIGOMUNICIPIO) || null,
    objeto: text(row.DESCRICAOOBJETO) || text(row.OBJETOCONFORMEEDITAL) || null,
    especificacaoObjeto: text(row.ESPECIFICACAOOBJETO) || null,
    cpfCnpj: formatCnpj(row.NUMERODOCUMENTOAJUSTADO),
    cpfCnpjNormalizado: digits(row.NUMERODOCUMENTOAJUSTADO) || null,
    razaoSocial: text(row.RAZAOSOCIAL) || null,
    resultadoHabilitacao: text(row.RESULTADOHABILITACAO) || null,
    adjudicada: text(row.ADJUDICADA) || null,
    // Valores separados: o adjudicado ao licitante não é o total da licitação.
    valorAdjudicadoLicitante: amount(row.TOTALADJUDICADOLICITANTE),
    valorAdjudicadoLicitacao: amount(row.TOTALADJUDICADOLICITACAO),
    valorOrcamentoEstimativo: amount(row.VALORORCAMENTOESTIMATIVO),
    quantidadeLicitantes: amount(row.QTDELICITANTES),
    dataEmissaoEdital: text(row.DATAEMISSAOEDITAL) || null,
    dataSessaoAbertura: text(row.DATASESSAOABERTURA) || null,
    dataPublicacaoHabilitacao: text(row.DATAPUBLICACAOHABILITACAO) || null,
    dataPublicacaoHomologacao: text(row.DATAPUBLICACAOHOMOLOGACAO) || null,
    linkArquivo: secureUrl(row.LinkArquivo),
    entityMatch: identity.entityMatch,
    relationshipType,
    ...evidence(method, params, retrievedAt, row.LinkArquivo),
    raw: row,
  };
}

// ==========================================================
// Obras — métodos `ObrasDadosContratacao` e `Obras`
// ==========================================================

function normalizeWorkContracting(row, profile, context = {}) {
  const { method = 'ObrasDadosContratacao', params = {}, retrievedAt = new Date().toISOString() } = context;
  const identity = resolveByDocument(
    profile,
    row.CPFCNPJ,
    [row.Pessoa, row.Bairro, row.Municipio].filter(Boolean).join(' '),
  );

  return {
    tipo: 'OBRA_CONTRATACAO',
    codigoObra: text(row.Obra) || null,
    contratado: text(row.Pessoa) || null,
    cpfCnpj: formatCnpj(row.CPFCNPJ),
    cpfCnpjNormalizado: digits(row.CPFCNPJ) || null,
    logradouro: text(row.Logradouro) || null,
    numero: text(row.Numero) || null,
    bairro: text(row.Bairro) || null,
    municipio: text(row.Municipio) || null,
    ...identity,
    ...evidence(method, params, retrievedAt, null),
    raw: row,
  };
}

/**
 * Ficha da obra. Não traz CPF/CNPJ: só é vinculada à entidade quando o código
 * veio de `ObrasDadosContratacao`, que é onde o contratado é identificado.
 */
function normalizeWork(row, context = {}) {
  const { method = 'Obras', params = {}, retrievedAt = new Date().toISOString() } = context;
  return {
    tipo: 'OBRA',
    codigoObra: text(row.Codigo) || null,
    titulo: text(row.Titulo) || null,
    municipio: text(row.Municipio) || null,
    localExecucao: text(row.LocalExecucao) || null,
    unidadeGestora: text(row.UG) || null,
    naturezaIntervencao: text(row.NaturezaIntervencao) || null,
    anoInicial: text(row.AnoInicial) || null,
    dataInicial: text(row.DataInicial) || null,
    dataUltimaAuditoria: text(row.DataUltimaAuditoria) || null,
    // Prazo original e prazo aditado publicados separadamente pela fonte.
    // Preservados como vieram: a comparação entre os dois é análise, não coleta.
    prazo: amount(row.Prazo),
    prazoAditado: amount(row.PrazoAditado),
    ...evidence(method, params, retrievedAt, null),
    raw: row,
  };
}

// ==========================================================
// Despesas — métodos `DespesasMunicipais` e `DespesasEstaduais`
// ==========================================================

function normalizeExpense(row, profile, context = {}) {
  const { method = 'DespesasMunicipais', params = {}, retrievedAt = new Date().toISOString() } = context;
  const identity = resolveByDocument(
    profile,
    row.CPF_CNPJ,
    [row.FORNECEDOR, row.NOME_FORNECEDOR, row.HISTORICO, row.NOMEUNIDADEGESTORA].filter(Boolean).join(' '),
  );

  return {
    tipo: 'DESPESA',
    esfera: method === 'DespesasEstaduais' ? 'E' : 'M',
    esferaNome: method === 'DespesasEstaduais' ? 'Estadual' : 'Municipal',
    unidadeGestora: text(row.NOMEUNIDADEGESTORA) || null,
    codigoUnidadeGestora: text(row.ID_UNIDADE_GESTORA) || null,
    unidadeOrcamentaria: text(row.UNIDADEORCAMENTARIA) || null,
    codigoMunicipio: text(row.CODIGO_MUNICIPIO) || null,
    credor: text(row.FORNECEDOR) || text(row.NOME_FORNECEDOR) || null,
    tipoCredor: text(row.TIPOCREDOR) || null,
    cpfCnpj: formatCnpj(row.CPF_CNPJ),
    cpfCnpjNormalizado: digits(row.CPF_CNPJ) || null,
    numeroEmpenho: text(row.NUMEROEMPENHO) || null,
    idEmpenho: text(row.ID_EMPENHO) || null,
    tipoEmpenho: text(row.TIPO_EMPENHO) || null,
    anoReferencia: text(row.ANOREFERENCIA) || null,
    mesReferencia: text(row.MESREFERENCIA) || null,
    dataEmpenho: text(row.DATAEMPENHO) || null,
    // Três estágios distintos da despesa pública. Mantidos separados porque
    // somá-los contaria o mesmo dinheiro até três vezes: empenhar é reservar,
    // liquidar é reconhecer a dívida e pagar é quitar.
    valorEmpenhado: amount(row.VALOREMPENHADO),
    valorLiquidado: amount(row.VALORLIQUIDADO),
    valorPago: amount(row.VALORPAGO),
    funcao: text(row.FUNCAO) || null,
    subfuncao: text(row.SUBFUNCAO) || null,
    programa: text(row.PROGRAMA) || null,
    acao: text(row.ACAO) || null,
    categoria: text(row.CATEGORIA) || null,
    elementoDespesa: text(row.ELEMENTODESPESA) || null,
    modalidade: text(row.MODALIDADE) || null,
    fonteRecurso: text(row.FONTERECURSO) || null,
    historico: text(row.HISTORICO) || null,
    ...identity,
    ...evidence(method, params, retrievedAt, null),
    raw: row,
  };
}

// ==========================================================
// Fornecedor — método `Fornecedores`
// ==========================================================

function normalizeSupplier(row, profile, context = {}) {
  const { method = 'Fornecedores', params = {}, retrievedAt = new Date().toISOString() } = context;
  const identity = resolveByDocument(profile, row.CPFCNPJ, text(row.NOME));
  return {
    tipo: 'FORNECEDOR',
    cpfCnpj: formatCnpj(row.CPFCNPJ),
    cpfCnpjNormalizado: digits(row.CPFCNPJ) || null,
    nome: text(row.NOME) || null,
    tipoCredor: text(row.TipoCredor) || null,
    ...identity,
    ...evidence(method, params, retrievedAt, null),
    raw: row,
  };
}

// ==========================================================
// Deduplicação
// ==========================================================

/**
 * Chave oficial de cada registro.
 *
 * A API devolve a mesma linha por consultas diferentes — o mesmo contrato
 * aparece na busca por CNPJ e na busca por nome. Deduplicar por identificador
 * oficial resolve isso sem apagar registros legitimamente distintos: contrato,
 * primeiro aditivo e segundo aditivo são três fatos, não um repetido.
 *
 * Nunca por nome: dois contratos diferentes da mesma empresa têm o mesmo nome.
 */
function dedupeKey(record) {
  switch (record.tipo) {
    case 'CONTRATO':
      return record.codigoContrato
        ? `CONTRATO:${record.codigoContrato}`
        : `CONTRATO:${record.numeroContrato}|${record.anoContrato}|${record.codigoUG || record.unidadeGestora}`;
    case 'TERMO_ADITIVO':
      // Um contrato tem vários aditivos; a chave precisa do número do termo.
      return `ADITIVO:${record.codigoContrato || record.numeroContrato}|${record.anoContrato}`
        + `|${record.numeroTermoAditivo}|${record.anoTermoAditivo}`;
    case 'LICITACAO':
      return record.codigoPL
        ? `LICITACAO:${record.codigoPL}|${record.cpfCnpjNormalizado || ''}`
        : `LICITACAO:${record.numeroProcesso}|${record.anoProcesso}|${record.codigoUG}|${record.cpfCnpjNormalizado || ''}`;
    case 'OBRA':
    case 'OBRA_CONTRATACAO':
      return `${record.tipo}:${record.codigoObra}|${record.cpfCnpjNormalizado || ''}`;
    case 'DESPESA':
      return `DESPESA:${record.idEmpenho || record.numeroEmpenho}|${record.anoReferencia}`
        + `|${record.codigoUnidadeGestora}|${record.mesReferencia || ''}`;
    case 'FORNECEDOR':
      return `FORNECEDOR:${record.cpfCnpjNormalizado}`;
    default:
      return `${record.tipo}:${JSON.stringify(record.raw ?? {})}`;
  }
}

/** Mantém a primeira ocorrência e registra quantas vezes a fonte repetiu. */
function dedupeRecords(records) {
  const merged = new Map();
  for (const record of records) {
    const key = dedupeKey(record);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...record, dedupeKey: key, duplicatesMerged: 0 });
      continue;
    }
    current.duplicatesMerged += 1;
  }
  return [...merged.values()];
}

module.exports = {
  PROVIDER,
  normalizeContract,
  normalizeAdditive,
  normalizeBid,
  normalizeWork,
  normalizeWorkContracting,
  normalizeExpense,
  normalizeSupplier,
  resolveByDocument,
  dedupeKey,
  dedupeRecords,
  parseValidity,
  amount,
  formatCnpj,
};
