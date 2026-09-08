// ==========================================================
// DILIGÊNCIA 360 — Processos oficiais do TCE-PE por interessado
// API pública, gratuita e sem chave: sistemas.tce.pe.gov.br/DadosAbertos
// ==========================================================

const { queryDataset, decodeByCharset, rowsFromResponse } = require('./tce-pe/tce-pe.client');
const { RELATIONSHIP_TYPE } = require('../domain/relationship-type');
const { normalizeText } = require('../egos/domain/normalization');
const { nameVariants } = require('./pncp.service');
const { SOURCE_STATUS, resolveSourceStatus } = require('../domain/source-status');
const { mapWithConcurrency } = require('../utils/concurrency');
const {
  MATCH_LEVEL,
  buildEntityProfile,
  resolveEntityMatch,
} = require('../entity-resolution/entity-resolution');

const MAX_PROCESSES = 10;

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

/*
 * ORÇAMENTO DE TEMPO
 *
 * A função serverless tem `maxDuration: 60` no server/vercel.json. Sem
 * um teto próprio, esta rota passava dele com facilidade: são até
 * quatro variantes de nome consultadas em série, a 20 s de timeout
 * cada, e só então até dez processos com três consultas de detalhe por
 * processo. Quatro variantes lentas já somam 80 s — a função morria no
 * meio, o navegador recebia conexão cortada e a fonte aparecia como
 * indisponível, sem nada do que já tinha sido apurado.
 *
 * O prazo abaixo faz a rota devolver o que concluiu. A consulta que não
 * chegou a começar vira lacuna declarada (`naoIniciada`), que é
 * diferente de fonte que recusou e diferente de fonte sem ocorrência.
 * É o mesmo desenho já usado nos diários oficiais.
 */
const CONCURRENCY = envInt('TCE_PE_CONCURRENCY', 3, 1, 5);
/** Abaixo disto não vale começar uma consulta: ela não terminaria. */
const MIN_SLICE_MS = 1_500;
// O piso precisa ser maior que `MIN_SLICE_MS`, senão um orçamento
// configurado abaixo dele faz nenhuma consulta começar — a rota
// devolveria "não iniciada" para tudo sem sequer tentar. O padrão
// continua sendo 40 s.
const GLOBAL_DEADLINE_MS = envInt('TCE_PE_DEADLINE_MS', 40_000, MIN_SLICE_MS * 2, 55_000);

// Classes processuais em que a empresa quase nunca é parte: o objeto é o ato de
// pessoal de um órgão. Quando o nome empresarial aparece num processo desses
// sem âncora nenhuma, é coincidência nominal, não vínculo.
const PERSONNEL_ACT_PATTERN = /APOSENTADORIA|PENS[AÃ]O|REFORMA|INATIVIDADE|ADMISS[AÃ]O DE PESSOAL|ATO DE PESSOAL/i;

// Marcadores de que o processo trata de contratação, que é onde uma empresa
// legitimamente figura.
const CONTRACT_CONTEXT_PATTERN = /CONTRATO|CONTRATA[CÇ][AÃ]O|LICITA[CÇ][AÃ]O|PREG[AÃ]O|CONCORR[EÊ]NCIA|EDITAL|ADITIVO|DISPENSA|INEXIGIBILIDADE|OBRA|SERVI[CÇ]O/i;

/**
 * Consulta um método dos Dados Abertos e devolve apenas as linhas.
 *
 * O transporte — charset, envelope, timeout e cache — mora no cliente
 * compartilhado desde a Fase 3, quando os adaptadores de contratos, aditivos,
 * licitações, obras e despesas passaram a precisar do mesmo tratamento. A falha
 * continua sendo lançada aqui porque `searchCompany` já a converte em consulta
 * parcial, e o comportamento validado na Fase 2 não muda.
 */
async function query(method, params, options = {}) {
  const response = await queryDataset(method, params, options);
  if (!response.ok) throw new Error(response.erro);
  return response.rows;
}

function formatProcessNumber(value) {
  const raw = String(value || '').trim();
  if (raw.includes('-')) return raw;
  if (/^\d{9}$/.test(raw)) return `${raw.slice(0, 8)}-${raw.slice(8)}`;
  const resource = raw.match(/^(\d{9})([A-Z]+\d+)$/i);
  return resource ? `${resource[1].slice(0, 8)}-${resource[1].slice(8)} ${resource[2]}` : raw;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function secureUrl(value) {
  return String(value || '').replace(/^http:\/\//i, 'https://') || null;
}

function matchCompanyName(interested, variants) {
  const normalizedInterested = normalizeText(interested);
  if (!normalizedInterested) return null;
  const normalizedVariants = variants.map(normalizeText).filter(Boolean);
  if (normalizedVariants.some((variant) => variant === normalizedInterested)) {
    return { strength: 'high', confidence: 95, basis: 'Nome empresarial coincidente na lista oficial de interessados.' };
  }
  const distinctive = normalizedVariants
    .flatMap((variant) => variant.split(' '))
    .filter((token) => token.length >= 5)
    .sort((a, b) => a.length - b.length)[0];
  if (distinctive && normalizedInterested.split(' ').includes(distinctive)) {
    return { strength: 'medium', confidence: 78, basis: `Termo distintivo “${distinctive}” coincide; o TCE-PE não fornece CNPJ neste cadastro.` };
  }
  return null;
}

/**
 * Resolve identidade e papel processual de um processo do TCE-PE.
 *
 * O cadastro de processos do TCE-PE não traz o CNPJ do interessado, então a
 * confirmação máxima vem do nome na lista oficial de interessados, corroborada
 * pelo teor da decisão. Um CNPJ que apareça no corpo do documento confirma.
 *
 * @param {object} profile perfil da entidade investigada.
 * @param {object} context campos textuais do processo.
 * @returns {{entityMatch: object, relationshipType: string, relevantToEntity: boolean}}
 */
function resolveProcessAttribution(profile, context = {}) {
  const interestedName = String(context.interestedName || '');
  const bodyText = [
    context.description,
    ...(Array.isArray(context.considerations) ? context.considerations : []),
    ...(Array.isArray(context.determinations) ? context.determinations : []),
  ].filter(Boolean).join(' ');

  // A lista de interessados é campo estruturado do TCE-PE: o nome ali tem
  // valor probatório diferente do mesmo nome solto no corpo da decisão.
  const interestedMatch = resolveEntityMatch(profile, { text: interestedName });
  const bodyMatch = resolveEntityMatch(profile, { text: bodyText });
  const entityMatch = interestedMatch.score >= bodyMatch.score ? interestedMatch : bodyMatch;

  const modality = String(context.modality || '');
  const type = String(context.type || '');
  const classification = `${type} ${modality} ${String(context.description || '')}`;
  const personnelAct = PERSONNEL_ACT_PATTERN.test(classification);
  const contractContext = CONTRACT_CONTEXT_PATTERN.test(classification) || CONTRACT_CONTEXT_PATTERN.test(bodyText);

  const identified = entityMatch.level === MATCH_LEVEL.CONFIRMED
    || entityMatch.level === MATCH_LEVEL.HIGH_CONFIDENCE;

  let relationshipType;
  if (entityMatch.level === MATCH_LEVEL.FALSE_POSITIVE) {
    relationshipType = RELATIONSHIP_TYPE.FALSE_POSITIVE;
  } else if (identified && interestedMatch.level !== MATCH_LEVEL.FALSE_POSITIVE) {
    // Nome na lista oficial de interessados: posição processual definida.
    relationshipType = contractContext ? RELATIONSHIP_TYPE.CONTRACTOR : RELATIONSHIP_TYPE.PARTY;
  } else if (identified) {
    // Identificada apenas pelo corpo da decisão: citada, não necessariamente parte.
    relationshipType = RELATIONSHIP_TYPE.MENTIONED;
  } else if (entityMatch.level === MATCH_LEVEL.POSSIBLE) {
    relationshipType = entityMatch.matched.partner ? RELATIONSHIP_TYPE.RELATED : RELATIONSHIP_TYPE.UNKNOWN;
  } else {
    relationshipType = RELATIONSHIP_TYPE.UNKNOWN;
  }

  // Ato de pessoal em que a empresa só é citada: o processo julga a
  // aposentadoria de um servidor, não a empresa. Fica auditável na lista, mas
  // não conta como processo relevante nem alimenta exposição.
  const incidentalPersonnelAct = personnelAct
    && !contractContext
    && relationshipType !== RELATIONSHIP_TYPE.CONTRACTOR
    && entityMatch.level !== MATCH_LEVEL.CONFIRMED;

  const relevantToEntity = relationshipType !== RELATIONSHIP_TYPE.FALSE_POSITIVE
    && relationshipType !== RELATIONSHIP_TYPE.UNKNOWN
    && !incidentalPersonnelAct;

  return {
    entityMatch,
    relationshipType,
    relevantToEntity,
    personnelAct,
    contractContext,
    incidentalPersonnelAct,
    attributionBasis: incidentalPersonnelAct
      ? 'O processo trata de ato de pessoal do órgão. O nome empresarial aparece incidentalmente e não caracteriza vínculo com o objeto julgado.'
      : entityMatch.basis,
  };
}

function contractsMentioned(...texts) {
  const matches = texts
    .flatMap((text) => String(text || '').match(/(?<![\d.])\d{1,4}\/20\d{2}\b/g) || []);
  return [...new Set(matches)];
}

function mapProcess(row, match, details = {}, profile = null) {
  const result = details.results?.[0] || {};
  const considerations = (details.considerations || []).map((item) => decodeHtml(item.Conteudo)).filter(Boolean).slice(0, 8);
  const determinations = (details.determinations || []).map((item) => decodeHtml(item.Conteudo)).filter(Boolean).slice(0, 8);
  const description = result.DescricaoProcesso || '';
  const processNumber = formatProcessNumber(result.Processo || row.Processo);
  const modality = result.Modalidade || row.Modalidade || '';
  const outcome = result.Resultado || '';
  const isAudit = /AUDITORIA|CAUTELAR/i.test(modality);
  const irregular = /IRREGULAR/i.test(outcome);

  const attribution = profile
    ? resolveProcessAttribution(profile, {
      interestedName: row.Interessado || '',
      description,
      considerations,
      determinations,
      modality,
      type: result.Tipo || row.Tipo || '',
    })
    : null;

  return {
    processNumber,
    entityMatch: attribution?.entityMatch || null,
    relationshipType: attribution?.relationshipType || RELATIONSHIP_TYPE.UNKNOWN,
    relevantToEntity: attribution ? attribution.relevantToEntity : true,
    attributionBasis: attribution?.attributionBasis || null,
    rawProcessNumber: String(row.Processo || '').replace(/[^A-Za-z0-9]/g, ''),
    interestedName: row.Interessado || '',
    matchStrength: match.strength,
    confidence: match.confidence,
    matchBasis: match.basis,
    type: result.Tipo || row.Tipo || '',
    modality,
    organization: result.NomeUJPrincipalProcesso || row.NomeUJ || '',
    municipality: result.MunicipioUJPrincipalProcesso || row.MunicipioUJ || '',
    sphere: String(result.EsferaUJPrincipalProcesso || row.Esfera || '').trim(),
    exercise: Number(result.ExercicioPrincipalProcesso || row.Exercicio) || null,
    status: result.StatusProcesso || row.Situacao || '',
    outcome,
    description,
    rapporteur: result.NomeRelator || '',
    collegiate: result.NomeColegiado || '',
    judgmentDate: result.DataSessaoJulgamento || '',
    decisionNumber: result.NumeroAcordaoParecer
      ? `${result.NumeroAcordaoParecer}/${result.AnoAcordaoParecer || ''}`.replace(/\/$/, '')
      : '',
    processUrl: secureUrl(result.LinkProcesso || row.LinkProcesso),
    decisionUrl: secureUrl(result.LinkDocumento),
    considerations,
    determinations,
    contractsMentioned: contractsMentioned(description, ...determinations),
    // Relevância só existe para processo cuja atribuição à empresa se sustenta.
    // Um ato de pessoal em que o nome apareceu por acaso não é "alta relevância"
    // ainda que a decisão tenha sido pela irregularidade da aposentadoria.
    relevance: attribution && !attribution.relevantToEntity
      ? 'none'
      : irregular && isAudit ? 'high' : isAudit ? 'medium' : 'low',
    attributionWarning: 'O resultado é do processo de controle externo. A empresa aparece nominalmente como interessada; isso não prova, por si só, fraude, dolo ou sanção contra ela.',
  };
}

const TcePeService = {
  async searchCompany(company = {}) {
    const variants = nameVariants(company);
    const consultedAt = new Date().toISOString();
    if (variants.length === 0) {
      return {
        ok: false,
        status: 400,
        sourceStatus: SOURCE_STATUS.ERROR,
        erro: 'Razão social ou nome empresarial obrigatório.',
        processos: [],
        consultas: [],
        consultadoEm: consultedAt,
      };
    }
    const profile = buildEntityProfile(company);

    const deadlineAt = Date.now() + GLOBAL_DEADLINE_MS;
    const remainingMs = () => deadlineAt - Date.now();
    let deadlineExceeded = false;

    const candidates = new Map();
    let partial = false;

    // As variantes são independentes entre si; consultá-las em série era
    // o que multiplicava o tempo total pelo número de variantes.
    const consultas = await mapWithConcurrency(variants, CONCURRENCY, async (variant) => {
      const slice = remainingMs();
      if (slice < MIN_SLICE_MS) {
        deadlineExceeded = true;
        partial = true;
        return {
          termo: variant,
          ok: false,
          naoIniciada: true,
          erro: 'Orçamento de tempo da consulta esgotado antes deste termo.',
        };
      }
      try {
        const rows = await query('Processos', { Interessado: variant }, { timeoutMs: slice });
        return { termo: variant, ok: true, retornados: rows.length, rows };
      } catch (error) {
        partial = true;
        return { termo: variant, ok: false, erro: error.message };
      }
    });

    // A escolha do melhor casamento acontece depois das consultas, e não
    // dentro delas: em paralelo, a ordem de chegada é indeterminada, e
    // decidir durante faria o resultado depender de quem respondeu antes.
    for (const consulta of consultas) {
      for (const row of consulta.rows || []) {
        const match = matchCompanyName(row.Interessado, variants);
        if (!match) continue;
        const key = String(row.Processo || '').replace(/\D/g, '');
        if (!key) continue;
        const current = candidates.get(key);
        if (!current || match.confidence > current.match.confidence) candidates.set(key, { row, match });
      }
      delete consulta.rows;
    }

    const selected = [...candidates.values()].slice(0, MAX_PROCESSES);
    if (candidates.size > MAX_PROCESSES) partial = true;
    const processos = await mapWithConcurrency(selected, CONCURRENCY, async ({ row, match }) => {
      const formatted = formatProcessNumber(row.Processo);
      const details = { results: [], considerations: [], determinations: [] };
      const slice = remainingMs();
      // Sem tempo para os detalhes, o processo ainda entra na lista: ele
      // foi encontrado, e omiti-lo esconderia um achado real. O que falta
      // é o conteúdo da decisão, e isso é consulta parcial.
      if (slice < MIN_SLICE_MS) {
        deadlineExceeded = true;
        partial = true;
        return mapProcess(row, match, details, profile);
      }
      const detailCalls = await Promise.allSettled([
        query('Resultados', { Processo: formatted }, { timeoutMs: slice }),
        query('Considerandos', { Processo: formatted }, { timeoutMs: slice }),
        query('Determinacoes', { Processo: formatted }, { timeoutMs: slice }),
      ]);
      if (detailCalls[0].status === 'fulfilled') details.results = detailCalls[0].value;
      else partial = true;
      if (detailCalls[1].status === 'fulfilled') details.considerations = detailCalls[1].value;
      else partial = true;
      if (detailCalls[2].status === 'fulfilled') details.determinations = detailCalls[2].value;
      else partial = true;
      return mapProcess(row, match, details, profile);
    });

    // Falso positivo e coincidência incidental saem da lista principal, mas
    // ficam registrados: descarte silencioso não é auditável.
    const relevantes = processos.filter((item) => item.relevantToEntity);
    const descartados = processos
      .filter((item) => !item.relevantToEntity)
      .map((item) => ({
        processNumber: item.processNumber,
        interestedName: item.interestedName,
        type: item.type,
        modality: item.modality,
        organization: item.organization,
        exercise: item.exercise,
        processUrl: item.processUrl,
        relationshipType: item.relationshipType,
        level: item.entityMatch?.level || null,
        score: item.entityMatch?.score ?? null,
        basis: item.attributionBasis,
      }));

    const consultasBemSucedidas = consultas.filter((item) => item.ok).length;
    const sourceStatus = resolveSourceStatus({
      attempted: consultas.length,
      succeeded: consultasBemSucedidas,
      resultCount: relevantes.length,
    });

    // Nenhuma consulta concluída: o dossiê precisa do motivo, não só do
    // estado. Sem isto a tela dizia "TCE-PE não respondeu" e parava aí,
    // e quem lia não sabia se a fonte estava fora do ar, se a consulta
    // estourou o tempo, ou se valia tentar de novo.
    const primeiraFalha = consultas.find((item) => !item.ok);
    const nenhumaConcluida = consultasBemSucedidas === 0;
    const naoIniciadas = consultas.filter((item) => item.naoIniciada).length;

    return {
      ok: consultas.some((item) => item.ok),
      sourceStatus,
      ...(nenhumaConcluida
        ? {
            erro: primeiraFalha?.erro || 'Nenhuma consulta ao TCE-PE foi concluída.',
            aviso: naoIniciadas === consultas.length
              ? 'A consulta esgotou o tempo disponível antes de qualquer termo ser pesquisado. '
                + 'A lista vazia não significa ausência de processo.'
              : 'A fonte não respondeu. A lista vazia não significa ausência de processo.',
          }
        : {}),
      consultasNaoIniciadas: naoIniciadas,
      provider: 'TCE-PE — API de Dados Abertos',
      sourceUrl: 'https://sistemas.tce.pe.gov.br/DadosAbertos/Exemplo!listar',
      consultadoEm: consultedAt,
      consultaParcial: partial,
      deadlineExceeded,
      variantesPesquisadas: variants,
      consultas,
      processos: relevantes.sort((a, b) => (b.exercise || 0) - (a.exercise || 0)),
      processosDescartados: descartados,
      falsePositivesDiscarded: descartados.length,
      resumo: {
        total: relevantes.length,
        descartados: descartados.length,
        contratante: relevantes.filter((item) => item.relationshipType === RELATIONSHIP_TYPE.CONTRACTOR).length,
        parte: relevantes.filter((item) => item.relationshipType === RELATIONSHIP_TYPE.PARTY).length,
        citada: relevantes.filter((item) => item.relationshipType === RELATIONSHIP_TYPE.MENTIONED).length,
        auditorias: relevantes.filter((item) => /AUDITORIA/i.test(item.modality)).length,
        julgados: relevantes.filter((item) => /JULGADO/i.test(item.status)).length,
        resultadosIrregulares: relevantes.filter((item) => /IRREGULAR/i.test(item.outcome)).length,
        altaRelevancia: relevantes.filter((item) => item.relevance === 'high').length,
      },
      limitacao: 'A pesquisa é nominal porque a API de processos do TCE-PE não retorna o CNPJ do interessado. '
        + 'A camada de resolução de identidade classifica cada processo em CONTRACTOR, PARTY, MENTIONED, RELATED, '
        + 'UNKNOWN ou FALSE_POSITIVE, e processos de ato de pessoal em que o nome empresarial aparece '
        + 'incidentalmente ficam fora da lista principal. O sistema não atribui automaticamente à empresa a '
        + 'responsabilidade decidida no processo.',
    };
  },
};

module.exports = {
  TcePeService,
  RELATIONSHIP_TYPE,
  decodeByCharset,
  formatProcessNumber,
  matchCompanyName,
  mapProcess,
  resolveProcessAttribution,
  rowsFromResponse,
};
