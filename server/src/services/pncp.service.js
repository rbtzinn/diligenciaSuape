// ==========================================================
// DILIGÊNCIA 360 — PNCP (Portal Nacional de Contratações Públicas)
// ==========================================================
// Fonte direta de contrato público. Não depende de buscador: enquanto o canal
// web está bloqueado, esta é a via que traz contrato municipal e federal.
//
// Duas APIs distintas do PNCP, usadas em sequência:
//
// 1. Busca textual (/api/search) — a mesma que o portal usa. Aceita nome, mas
//    NÃO informa quem é o fornecedor: casa o termo no texto do documento. Um
//    resultado aqui é candidato, nunca conclusão.
// 2. Detalhe do contrato (/api/pncp/v1/orgaos/.../contratos/...) — traz
//    niFornecedor, o CNPJ de quem assinou.
//
// A confirmação é o passo 2 comparado ao CNPJ investigado. Sem ele, uma busca
// por "SOLIMP" traria contrato de qualquer empresa cujo edital cite a palavra.
//
// A API de consulta oficial (/api/consulta/v1/contratos) não serve aqui: filtra
// por órgão e data, nunca por fornecedor, e varrer o país inteiro passaria de
// um milhão de registros por ano.
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');

const SEARCH_ENDPOINT = 'https://pncp.gov.br/api/search/';
const DETAIL_BASE = 'https://pncp.gov.br/api/pncp/v1/orgaos';
const PORTAL_BASE = 'https://pncp.gov.br/app';

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

const RESULTS_PER_QUERY = envInt('PNCP_RESULTS_PER_QUERY', 20, 5, 50);
const MAX_CANDIDATES_DETAILED = envInt('PNCP_MAX_CANDIDATES', 30, 5, 60);
const REQUEST_TIMEOUT_MS = envInt('PNCP_TIMEOUT_MS', 20000, 5000, 40000);
const CONCURRENCY = envInt('PNCP_CONCURRENCY', 4, 1, 8);
// A API cai com frequência na primeira chamada e responde na seguinte. Sem
// retentativa o adaptador reportaria ausência de contrato por falha de rede.
const MAX_ATTEMPTS = envInt('PNCP_MAX_ATTEMPTS', 3, 1, 5);

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return text(value);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

async function fetchJson(url, { timeoutMs = REQUEST_TIMEOUT_MS, attempts = MAX_ATTEMPTS } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await safeFetch(url, {
        timeoutMs,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const error = new Error(`PNCP respondeu HTTP ${response.status}.`);
        error.status = response.status;
        error.detail = detail.slice(0, 200);
        // 4xx não melhora com retentativa; 5xx e instabilidade melhoram.
        if (response.status < 500) throw error;
        lastError = error;
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error.status && error.status < 500) break;
    }
  }
  throw lastError || new Error('Falha desconhecida ao consultar o PNCP.');
}

/**
 * Variantes do nome. O edital escreve a empresa pelo nome curto, e a razão
 * social inteira raramente aparece no texto indexado.
 */
function nameVariants(company) {
  const razao = text(company?.razaoSocial);
  const fantasia = text(company?.nomeFantasia);
  const variants = [];

  if (razao) variants.push(razao);

  const simplified = razao
    .replace(/\b(LTDA|LIMITADA|EIRELI|S\.?\s*A\.?|SOCIEDADE ANONIMA|ME|EPP)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (simplified && normalize(simplified) !== normalize(razao)) variants.push(simplified);

  if (fantasia && normalize(fantasia) !== normalize(razao)) variants.push(fantasia);

  const [firstToken] = normalize(simplified || razao).split(' ');
  // Termo curto demais casaria com meio edital do país.
  if (firstToken && firstToken.length >= 4) variants.push(firstToken.toUpperCase());

  const seen = new Set();
  return variants.filter((variant) => {
    const key = normalize(variant);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseItemUrl(itemUrl) {
  // /contratos/{cnpjOrgao}/{ano}/{sequencial} ou /compras/{cnpj}/{ano}/{seq}
  const match = String(itemUrl || '').match(/^\/(contratos|compras)\/(\d{14})\/(\d{4})\/(\d+)$/);
  if (!match) return null;
  return { kind: match[1], orgaoCnpj: match[2], ano: match[3], sequencial: match[4] };
}

async function searchDocuments(query, documentType) {
  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`
    + `&tipos_documento=${encodeURIComponent(documentType)}`
    + `&pagina=1&tam_pagina=${RESULTS_PER_QUERY}`;

  const payload = await fetchJson(url);

  // O endpoint de busca não é documentado no OpenAPI: é o que o portal consome.
  // Se o formato mudar, falhar é obrigatório — devolver lista vazia viraria
  // "nenhum contrato encontrado" para uma empresa que tem contrato.
  if (!payload || !Array.isArray(payload.items)) {
    const error = new Error('A busca do PNCP devolveu um formato inesperado.');
    error.status = 502;
    throw error;
  }

  return { total: Number(payload.total) || 0, items: payload.items };
}

async function fetchContractDetail({ orgaoCnpj, ano, sequencial }) {
  return fetchJson(`${DETAIL_BASE}/${orgaoCnpj}/contratos/${ano}/${sequencial}`);
}

async function mapWithConcurrency(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pump));
  return output;
}

function buildContract(detail, searchItem, investigatedCnpj) {
  const supplierCnpj = onlyDigits(detail?.niFornecedor);
  const confirmed = Boolean(supplierCnpj) && supplierCnpj === onlyDigits(investigatedCnpj);

  return {
    origem: 'PNCP',
    numeroControlePncp: text(detail?.numeroControlePNCP) || text(searchItem?.numero_controle_pncp),
    numeroContrato: text(detail?.numeroContratoEmpenho) || text(searchItem?.title),
    objeto: text(detail?.objetoContrato) || text(searchItem?.description),
    orgao: text(detail?.orgaoEntidade?.razaoSocial) || text(searchItem?.orgao_nome),
    orgaoCnpj: onlyDigits(detail?.orgaoEntidade?.cnpj) || onlyDigits(searchItem?.orgao_cnpj),
    unidade: text(detail?.unidadeOrgao?.nomeUnidade) || text(searchItem?.unidade_nome),
    municipio: text(detail?.unidadeOrgao?.municipioNome) || text(searchItem?.municipio_nome),
    uf: text(detail?.unidadeOrgao?.ufSigla) || text(searchItem?.uf),
    esfera: text(searchItem?.esfera_nome),
    modalidade: text(searchItem?.modalidade_licitacao_nome),
    fornecedorNome: text(detail?.nomeRazaoSocialFornecedor),
    fornecedorCnpj: supplierCnpj,
    fornecedorCnpjFmt: formatCnpj(supplierCnpj),
    valorGlobal: Number.isFinite(Number(detail?.valorGlobal)) ? Number(detail.valorGlobal) : null,
    valorInicial: Number.isFinite(Number(detail?.valorInicial)) ? Number(detail.valorInicial) : null,
    dataAssinatura: text(detail?.dataAssinatura) || text(searchItem?.data_assinatura),
    vigenciaInicio: text(detail?.dataVigenciaInicio) || text(searchItem?.data_inicio_vigencia),
    vigenciaFim: text(detail?.dataVigenciaFim) || text(searchItem?.data_fim_vigencia),
    // Confirmado = o CNPJ do fornecedor no documento é o da empresa investigada.
    // Divergente = homônimo ou menção de terceiro no texto do contrato.
    status: confirmed ? 'CONFIRMADO' : 'DIVERGENTE',
    url: searchItem?.item_url ? `${PORTAL_BASE}${searchItem.item_url}` : null,
    encontradoPor: searchItem?.__query || null,
  };
}

function buildProcurementCandidate(searchItem) {
  return {
    origem: 'PNCP',
    tipo: 'contratacao',
    titulo: text(searchItem?.title),
    objeto: text(searchItem?.description),
    orgao: text(searchItem?.orgao_nome),
    orgaoCnpj: onlyDigits(searchItem?.orgao_cnpj),
    municipio: text(searchItem?.municipio_nome),
    uf: text(searchItem?.uf),
    modalidade: text(searchItem?.modalidade_licitacao_nome),
    dataPublicacao: text(searchItem?.data_publicacao_pncp),
    url: searchItem?.item_url ? `${PORTAL_BASE}${searchItem.item_url}` : null,
    encontradoPor: searchItem?.__query || null,
    // A busca casou o nome no texto do edital. Isso não prova participação nem
    // vitória: o PNCP só nomeia o vencedor no contrato ou no resultado.
    status: 'MENCAO_NAO_CONFIRMADA',
  };
}

const PncpService = {
  nameVariants,
  parseItemUrl,

  /**
   * Busca contratos e contratações do PNCP para a empresa investigada.
   */
  async search(company = {}) {
    const cnpj = onlyDigits(company.cnpj);
    const consultadoEm = new Date().toISOString();

    if (!company.razaoSocial && !cnpj) {
      return {
        ok: false,
        status: 400,
        erro: 'Informe ao menos a razão social ou o CNPJ para consultar o PNCP.',
        contratos: [],
        contratacoes: [],
        consultadoEm,
      };
    }

    const variants = nameVariants(company);
    const consultas = [];
    const contractCandidates = new Map();
    const procurementCandidates = new Map();
    let houveFalha = false;

    for (const variant of variants) {
      for (const documentType of ['contrato', 'edital']) {
        try {
          const { total, items } = await searchDocuments(variant, documentType);
          consultas.push({ termo: variant, tipo: documentType, ok: true, total, retornados: items.length });

          for (const item of items) {
            const parsed = parseItemUrl(item?.item_url);
            if (!parsed) continue;
            const key = `${parsed.kind}|${parsed.orgaoCnpj}|${parsed.ano}|${parsed.sequencial}`;
            const enriched = { ...item, __query: variant };
            if (parsed.kind === 'contratos') {
              if (!contractCandidates.has(key)) contractCandidates.set(key, { parsed, item: enriched });
            } else if (!procurementCandidates.has(key)) {
              procurementCandidates.set(key, enriched);
            }
          }
        } catch (error) {
          houveFalha = true;
          consultas.push({
            termo: variant,
            tipo: documentType,
            ok: false,
            status: error.status || null,
            erro: error.message,
          });
        }
      }
    }

    const toDetail = [...contractCandidates.values()].slice(0, MAX_CANDIDATES_DETAILED);
    const detalhados = await mapWithConcurrency(toDetail, CONCURRENCY, async ({ parsed, item }) => {
      try {
        const detail = await fetchContractDetail(parsed);
        return buildContract(detail, item, cnpj);
      } catch (error) {
        houveFalha = true;
        return {
          origem: 'PNCP',
          numeroContrato: text(item?.title),
          orgao: text(item?.orgao_nome),
          url: item?.item_url ? `${PORTAL_BASE}${item.item_url}` : null,
          status: 'NAO_VERIFICADO',
          erro: `Não foi possível confirmar o fornecedor: ${error.message}`,
        };
      }
    });

    const confirmados = detalhados.filter((contract) => contract.status === 'CONFIRMADO');
    const divergentes = detalhados.filter((contract) => contract.status === 'DIVERGENTE');
    const naoVerificados = detalhados.filter((contract) => contract.status === 'NAO_VERIFICADO');
    const contratacoes = [...procurementCandidates.values()].map(buildProcurementCandidate);

    const valorTotalConfirmado = confirmados.reduce(
      (total, contract) => total + (Number(contract.valorGlobal) || 0),
      0,
    );

    return {
      ok: true,
      status: 200,
      provider: 'PNCP — Portal Nacional de Contratações Públicas',
      consultadoEm,
      consultaParcial: houveFalha,
      cnpjInvestigado: cnpj,
      variantesPesquisadas: variants,
      consultas,
      contratos: confirmados,
      contratosDivergentes: divergentes,
      contratosNaoVerificados: naoVerificados,
      contratacoes,
      resumo: {
        confirmados: confirmados.length,
        divergentes: divergentes.length,
        naoVerificados: naoVerificados.length,
        contratacoesMencionadas: contratacoes.length,
        valorTotalConfirmado,
        orgaosDistintos: new Set(confirmados.map((contract) => contract.orgaoCnpj)).size,
      },
      limitacao: 'A busca do PNCP casa o termo no texto do documento e não informa o fornecedor. '
        + 'Cada contrato é confirmado pelo CNPJ do fornecedor no detalhe; contratações (editais) '
        + 'permanecem como menção não confirmada, porque o portal só nomeia o vencedor no contrato.',
    };
  },
};

module.exports = { PncpService, nameVariants, parseItemUrl, buildContract };
