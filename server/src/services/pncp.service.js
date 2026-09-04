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
const { SOURCE_STATUS } = require('../domain/source-status');
const {
  MATCH_LEVEL,
  buildEntityProfile,
  resolveEntityMatch,
} = require('../entity-resolution/entity-resolution');

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
// O detalhamento de contrato responde em 7 a 17 s, medido. O limite fica acima
// da pior medição, e nunca ultrapassa o que resta do orçamento da rota.
const REQUEST_TIMEOUT_MS = envInt('PNCP_TIMEOUT_MS', 25_000, 5_000, 40_000);
// O gargalo do PNCP é latência, não vazão: cada detalhamento leva mais de 10 s
// esperando o servidor. Medido, 24 detalhamentos simultâneos terminaram em
// 10,9 s com 24 de 24 respostas — a mesma latência de um só. Com concorrência
// 4, os mesmos 30 candidatos não cabiam no orçamento e metade ficava sem
// confirmação de CNPJ, que é justamente o passo que separa candidato de
// contrato da empresa.
const CONCURRENCY = envInt('PNCP_CONCURRENCY', 16, 1, 24);
// O PNCP derruba a conexão com ECONNRESET de forma aleatória, e em rajadas: a
// mesma consulta repetida alterna sucesso e queda sem padrão de horário, tipo
// de documento ou termo. Sem retentativa o adaptador reportaria ausência de
// contrato por falha de rede.
//
// Medido, 12 consultas por política: com 3 tentativas, 5 desistiram; com 6,
// uma; com 8, nenhuma. A queda chega em ~200 ms, então tentar de novo é barato
// — o custo médio por consulta sobe de 819 ms para 1283 ms. Insistir custa
// menos do que declarar indisponível uma fonte que responde.
const MAX_ATTEMPTS = envInt('PNCP_MAX_ATTEMPTS', 8, 1, 12);

// Orçamento global da rota. Sem ele, uma execução ruim encadeia buscas por
// variante e até 30 detalhamentos com três tentativas cada, e passa dos 60 s de
// `maxDuration` da função serverless. A função é morta no meio, o navegador não
// recebe resposta nenhuma e o `fetch` do cliente rejeita com "Failed to fetch" —
// que era exatamente o erro relatado. Devolver parcial dentro do prazo troca
// uma falha opaca por uma cobertura declarada.
const GLOBAL_DEADLINE_MS = envInt('PNCP_DEADLINE_MS', 45_000, 10_000, 55_000);

// Espera entre tentativas.
//
// Duas causas de falha, duas esperas. A conexão derrubada não melhora com
// espera maior — medido: esperar 1200 ms em vez de 200 ms não reduziu a taxa
// de queda —, então ali a espera é curta e constante, só para não repetir no
// mesmo instante. Já o HTTP 5xx indica servidor sobrecarregado, onde recuar
// progressivamente é o comportamento correto; o teto evita que a última
// tentativa sozinha consuma o orçamento da rota.
const RETRY_BASE_DELAY_MS = envInt('PNCP_RETRY_BASE_DELAY_MS', 250, 50, 3_000);
const RETRY_MAX_DELAY_MS = envInt('PNCP_RETRY_MAX_DELAY_MS', 2_500, 250, 10_000);

// Espera de servidor sobrecarregado: dobra a cada rodada, com teto.
function backoffDelay(attempt) {
  return Math.min(RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)), RETRY_MAX_DELAY_MS);
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

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

async function fetchJson(url, { timeoutMs = REQUEST_TIMEOUT_MS, attempts = MAX_ATTEMPTS, deadlineAt } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // Retentativa que estoura o orçamento da rota não recupera nada: só faz o
    // cliente desistir antes de receber o parcial que já existe.
    const restante = deadlineAt ? deadlineAt - Date.now() : Infinity;
    if (restante <= 1_000) {
      lastError = lastError || new Error('Orçamento de tempo da consulta ao PNCP esgotado.');
      break;
    }
    try {
      const response = await safeFetch(url, {
        timeoutMs: Math.min(timeoutMs, Math.max(1_000, restante)),
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
        if (attempt < attempts) await delay(backoffDelay(attempt));
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error.status && error.status < 500) break;
      if (attempt < attempts) await delay(RETRY_BASE_DELAY_MS);
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

async function searchDocuments(query, documentType, options = {}) {
  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}`
    + `&tipos_documento=${encodeURIComponent(documentType)}`
    + `&pagina=1&tam_pagina=${RESULTS_PER_QUERY}`;

  const payload = await fetchJson(url, options);

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

async function fetchContractDetail({ orgaoCnpj, ano, sequencial }, options = {}) {
  return fetchJson(`${DETAIL_BASE}/${orgaoCnpj}/contratos/${ano}/${sequencial}`, options);
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

function buildContract(detail, searchItem, investigatedCnpj, profile) {
  const supplierCnpj = onlyDigits(detail?.niFornecedor);
  const confirmed = Boolean(supplierCnpj) && supplierCnpj === onlyDigits(investigatedCnpj);

  // No PNCP o CNPJ do fornecedor é campo estruturado do documento, não texto
  // solto: quando ele bate, a identidade está confirmada pela própria fonte e
  // não há o que interpretar. A camada de resolução entra apenas para os casos
  // nominais, em que o portal não nomeia quem assinou.
  let entityMatch = null;
  if (profile) {
    entityMatch = confirmed
      ? {
        level: MATCH_LEVEL.CONFIRMED,
        score: 100,
        confidence: 100,
        basis: 'CNPJ do fornecedor no documento do PNCP é o da empresa investigada.',
        signals: [{
          code: 'EXACT_CNPJ',
          label: 'CNPJ do fornecedor coincide no registro oficial',
          points: 100,
          matched: true,
          detail: formatCnpj(supplierCnpj),
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
      }
      // Fornecedor conhecido e diferente do investigado: homônimo, não é ela.
      : supplierCnpj
        ? {
          level: MATCH_LEVEL.FALSE_POSITIVE,
          score: -100,
          confidence: 0,
          basis: `O contrato foi assinado por outro CNPJ (${formatCnpj(supplierCnpj)}).`,
          signals: [{
            code: 'INCOMPATIBLE_IDENTIFIER',
            label: 'O fornecedor do contrato é outra pessoa jurídica',
            points: -100,
            matched: false,
            detail: formatCnpj(supplierCnpj),
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
        }
        : resolveEntityMatch(profile, {
          text: [
            text(detail?.nomeRazaoSocialFornecedor),
            text(detail?.objetoContrato) || text(searchItem?.description),
            text(searchItem?.title),
            text(detail?.unidadeOrgao?.municipioNome) || text(searchItem?.municipio_nome),
            text(detail?.unidadeOrgao?.ufSigla) || text(searchItem?.uf),
          ].filter(Boolean).join(' '),
        });
  }

  return {
    entityMatch,
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
   * Sonda de conectividade, exposta no /api/status sob demanda.
   *
   * O adaptador funciona da máquina do desenvolvedor e pode não funcionar da
   * função serverless: o DuckDuckGo já bloqueia esta implantação por IP de
   * datacenter. Sem uma sonda executada de dentro do ambiente publicado, não há
   * como distinguir "empresa sem contrato" de "PNCP recusa a origem".
   */
  async probe() {
    const iniciadoEm = Date.now();
    try {
      const { total, items } = await searchDocuments('prefeitura', 'contrato');
      return {
        alcancavel: true,
        tempoMs: Date.now() - iniciadoEm,
        totalDaConsultaDeControle: total,
        itensRecebidos: items.length,
      };
    } catch (error) {
      return {
        alcancavel: false,
        tempoMs: Date.now() - iniciadoEm,
        status: error.status || null,
        erro: error.message,
        detalhe: error.detail || null,
      };
    }
  },

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
        sourceStatus: SOURCE_STATUS.ERROR,
        erro: 'Informe ao menos a razão social ou o CNPJ para consultar o PNCP.',
        contratos: [],
        contratacoes: [],
        consultadoEm,
      };
    }

    const variants = nameVariants(company);
    const profile = buildEntityProfile(company);
    const consultas = [];
    const contractCandidates = new Map();
    const procurementCandidates = new Map();
    let houveFalha = false;
    const deadlineAt = Date.now() + GLOBAL_DEADLINE_MS;
    let deadlineExceeded = false;

    for (const variant of variants) {
      for (const documentType of ['contrato', 'edital']) {
        // Consulta não iniciada por falta de tempo é lacuna declarada, e não
        // silêncio: sem isto a rota estourava o limite da função serverless e o
        // navegador via apenas "Failed to fetch".
        if (Date.now() >= deadlineAt) {
          deadlineExceeded = true;
          houveFalha = true;
          consultas.push({
            termo: variant,
            tipo: documentType,
            ok: false,
            naoIniciada: true,
            erro: 'Consulta não iniciada: o orçamento de tempo da rota se esgotou antes.',
          });
          continue;
        }

        try {
          const { total, items } = await searchDocuments(variant, documentType, { deadlineAt });
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
      if (Date.now() >= deadlineAt) {
        deadlineExceeded = true;
        houveFalha = true;
        return {
          origem: 'PNCP',
          numeroContrato: text(item?.title),
          orgao: text(item?.orgao_nome),
          url: item?.item_url ? `${PORTAL_BASE}${item.item_url}` : null,
          status: 'NAO_VERIFICADO',
          erro: 'Fornecedor não confirmado: o orçamento de tempo da rota se esgotou antes.',
        };
      }
      try {
        const detail = await fetchContractDetail(parsed, { deadlineAt });
        return buildContract(detail, item, cnpj, profile);
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

    // Distinção central: nenhuma consulta concluiu significa que o PNCP não foi
    // consultado, e não que a empresa não tem contrato. Antes o serviço devolvia
    // `ok: true` com lista vazia nos dois casos, e o dossiê registrava
    // "nenhum contrato confirmado" para uma empresa que podia ter dezenas.
    const consultasBemSucedidas = consultas.filter((consulta) => consulta.ok).length;
    const totalOcorrencias = confirmados.length + contratacoes.length;
    const indisponivel = consultas.length > 0 && consultasBemSucedidas === 0;

    if (indisponivel) {
      return {
        ok: false,
        status: 503,
        sourceStatus: SOURCE_STATUS.UNAVAILABLE,
        provider: 'PNCP — Portal Nacional de Contratações Públicas',
        consultadoEm,
        consultaParcial: true,
        deadlineExceeded,
        cnpjInvestigado: cnpj,
        variantesPesquisadas: variants,
        consultas,
        contratos: [],
        contratosDivergentes: [],
        contratosNaoVerificados: [],
        contratacoes: [],
        resumo: {
          confirmados: 0,
          divergentes: 0,
          naoVerificados: 0,
          contratacoesMencionadas: 0,
          valorTotalConfirmado: 0,
          orgaosDistintos: 0,
        },
        erro: consultas.find((consulta) => consulta.erro)?.erro || 'O PNCP não respondeu a nenhuma das consultas.',
        aviso: 'Não foi possível consultar o PNCP nesta execução. '
          + 'A ausência de contrato na tela não autoriza concluir que a empresa não possui contrato público.',
      };
    }

    return {
      ok: true,
      status: 200,
      sourceStatus: houveFalha
        ? SOURCE_STATUS.PARTIAL
        : totalOcorrencias > 0 ? SOURCE_STATUS.SUCCESS : SOURCE_STATUS.EMPTY,
      provider: 'PNCP — Portal Nacional de Contratações Públicas',
      consultadoEm,
      consultaParcial: houveFalha,
      deadlineExceeded,
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
