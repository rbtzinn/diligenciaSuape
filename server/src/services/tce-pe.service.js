// ==========================================================
// DILIGÊNCIA 360 — Processos oficiais do TCE-PE por interessado
// API pública, gratuita e sem chave: sistemas.tce.pe.gov.br/DadosAbertos
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');
const { normalizeText } = require('../egos/domain/normalization');
const { nameVariants } = require('./pncp.service');

const BASE_URL = 'https://sistemas.tce.pe.gov.br/DadosAbertos';
const MAX_PROCESSES = 10;

function rowsFromResponse(payload, method) {
  const response = payload?.resposta;
  if (!response || response.status !== 'OK') {
    throw new Error(`TCE-PE retornou formato inválido em ${method}.`);
  }
  if (!response.conteudo) return [];
  return Array.isArray(response.conteudo) ? response.conteudo : [response.conteudo];
}

async function query(method, params) {
  const search = new URLSearchParams(params);
  const response = await safeFetch(`${BASE_URL}/${method}!json?${search}`, {
    headers: { Accept: 'application/json' },
    timeoutMs: 20_000,
  });
  if (!response.ok) throw new Error(`TCE-PE retornou HTTP ${response.status}.`);
  return rowsFromResponse(await response.json(), method);
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

function contractsMentioned(...texts) {
  const matches = texts
    .flatMap((text) => String(text || '').match(/(?<![\d.])\d{1,4}\/20\d{2}\b/g) || []);
  return [...new Set(matches)];
}

function mapProcess(row, match, details = {}) {
  const result = details.results?.[0] || {};
  const considerations = (details.considerations || []).map((item) => decodeHtml(item.Conteudo)).filter(Boolean).slice(0, 8);
  const determinations = (details.determinations || []).map((item) => decodeHtml(item.Conteudo)).filter(Boolean).slice(0, 8);
  const description = result.DescricaoProcesso || '';
  const processNumber = formatProcessNumber(result.Processo || row.Processo);
  const modality = result.Modalidade || row.Modalidade || '';
  const outcome = result.Resultado || '';
  const isAudit = /AUDITORIA|CAUTELAR/i.test(modality);
  const irregular = /IRREGULAR/i.test(outcome);
  return {
    processNumber,
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
    relevance: irregular && isAudit ? 'high' : isAudit ? 'medium' : 'low',
    attributionWarning: 'O resultado é do processo de controle externo. A empresa aparece nominalmente como interessada; isso não prova, por si só, fraude, dolo ou sanção contra ela.',
  };
}

const TcePeService = {
  async searchCompany(company = {}) {
    const variants = nameVariants(company);
    const consultedAt = new Date().toISOString();
    if (variants.length === 0) {
      return { ok: false, status: 400, erro: 'Razão social ou nome empresarial obrigatório.', processos: [], consultas: [], consultadoEm: consultedAt };
    }

    const candidates = new Map();
    const consultas = [];
    let partial = false;
    for (const variant of variants) {
      try {
        const rows = await query('Processos', { Interessado: variant });
        consultas.push({ termo: variant, ok: true, retornados: rows.length });
        for (const row of rows) {
          const match = matchCompanyName(row.Interessado, variants);
          if (!match) continue;
          const key = String(row.Processo || '').replace(/\D/g, '');
          if (!key) continue;
          const current = candidates.get(key);
          if (!current || match.confidence > current.match.confidence) candidates.set(key, { row, match });
        }
      } catch (error) {
        partial = true;
        consultas.push({ termo: variant, ok: false, erro: error.message });
      }
    }

    const selected = [...candidates.values()].slice(0, MAX_PROCESSES);
    if (candidates.size > MAX_PROCESSES) partial = true;
    const processos = await Promise.all(selected.map(async ({ row, match }) => {
      const formatted = formatProcessNumber(row.Processo);
      const details = { results: [], considerations: [], determinations: [] };
      const detailCalls = await Promise.allSettled([
        query('Resultados', { Processo: formatted }),
        query('Considerandos', { Processo: formatted }),
        query('Determinacoes', { Processo: formatted }),
      ]);
      if (detailCalls[0].status === 'fulfilled') details.results = detailCalls[0].value;
      else partial = true;
      if (detailCalls[1].status === 'fulfilled') details.considerations = detailCalls[1].value;
      else partial = true;
      if (detailCalls[2].status === 'fulfilled') details.determinations = detailCalls[2].value;
      else partial = true;
      return mapProcess(row, match, details);
    }));

    return {
      ok: consultas.some((item) => item.ok),
      provider: 'TCE-PE — API de Dados Abertos',
      sourceUrl: 'https://sistemas.tce.pe.gov.br/DadosAbertos/Exemplo!listar',
      consultadoEm: consultedAt,
      consultaParcial: partial,
      variantesPesquisadas: variants,
      consultas,
      processos: processos.sort((a, b) => (b.exercise || 0) - (a.exercise || 0)),
      resumo: {
        total: processos.length,
        auditorias: processos.filter((item) => /AUDITORIA/i.test(item.modality)).length,
        julgados: processos.filter((item) => /JULGADO/i.test(item.status)).length,
        resultadosIrregulares: processos.filter((item) => /IRREGULAR/i.test(item.outcome)).length,
        altaRelevancia: processos.filter((item) => item.relevance === 'high').length,
      },
      limitacao: 'A pesquisa é nominal porque a API de processos do TCE-PE não retorna o CNPJ do interessado. O sistema preserva o grau de correspondência e não atribui automaticamente à empresa a responsabilidade decidida no processo.',
    };
  },
};

module.exports = { TcePeService, formatProcessNumber, matchCompanyName, mapProcess, rowsFromResponse };
