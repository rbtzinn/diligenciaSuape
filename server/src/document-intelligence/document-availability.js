// ==========================================================
// DILIGÊNCIA 360 — Verificação de disponibilidade documental
// ==========================================================
// Confirma se o documento publicado pela fonte pode de fato ser obtido, sem
// baixá-lo inteiro.
//
// POR QUE NÃO BAIXAR: um contrato do LICON pesa de 1 a 5 MB, e uma empresa
// ativa tem centenas deles. Baixar tudo custaria minutos de rota e memória para
// produzir, no fim, imagens que esta fase não sabe ler.
//
// O QUE É FEITO NO LUGAR: `HEAD` devolve tipo e tamanho sem corpo algum; um
// `Range` de 512 bytes confirma a assinatura `%PDF-` e revela se o arquivo tem
// camada de texto. Verificado contra o servidor do TCE-PE: `HEAD` responde 200
// com `content-length`, `Range` responde 206, e documento inexistente responde
// 404 em HTML — os três casos são distinguíveis.
//
// A verificação é OPCIONAL e desligada por padrão. Consulta gerada não é
// consulta executada, e o mesmo vale aqui: a camada documental funciona inteira
// sem tocar na rede, apenas declarando os documentos como REFERENCED.
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');
const { DOCUMENT_STATUS } = require('./document.model');

function envInt(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

const TIMEOUT_MS = envInt('DOCUMENT_PROBE_TIMEOUT_MS', 12_000, 3_000, 30_000);
const CONCURRENCY = envInt('DOCUMENT_PROBE_CONCURRENCY', 4, 1, 8);
// Teto de documentos verificados por execução. Sem ele, uma empresa com
// trezentos contratos faria trezentas requisições numa rota só.
const MAX_PROBES = envInt('DOCUMENT_PROBE_MAX', 25, 0, 200);
const CACHE_TTL_MS = envInt('DOCUMENT_PROBE_CACHE_TTL_MS', 30 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000);
// 512 bytes bastam para o cabeçalho do PDF; o resto seria desperdício.
const RANGE_BYTES = 512;

const probeCache = new Map();

/**
 * Detecta camada de texto no cabeçalho do PDF.
 *
 * Heurística deliberadamente conservadora: `/Font` no primeiro bloco indica
 * texto; a ausência dele nos 512 bytes iniciais NÃO prova que o arquivo é
 * digitalizado, e por isso devolve `null` — desconhecido — em vez de `false`.
 * Afirmar "sem texto" a partir de meio quilobyte seria conclusão sem base.
 */
function detectTextLayer(headerBytes, contentType) {
  if (!headerBytes) return null;
  const head = headerBytes.toString('latin1');
  if (!head.startsWith('%PDF-')) {
    // Não é PDF: HTML e texto puro têm conteúdo legível por natureza.
    return /html|text|json|xml/i.test(String(contentType || '')) ? true : null;
  }
  if (/\/Font/.test(head)) return true;
  return null;
}

/**
 * Verifica um documento pela URL oficial.
 *
 * Nunca lança. Devolve sempre um resultado com o estado e a evidência da
 * verificação, para que a camada acima nunca precise interpretar exceção.
 */
async function probeDocument(url, options = {}) {
  const { timeoutMs = TIMEOUT_MS, forceRefresh = false } = options;
  const checkedAt = new Date().toISOString();
  const address = String(url || '').trim();

  if (!address) {
    return { status: DOCUMENT_STATUS.EMPTY, checkedAt, evidence: 'Nenhuma URL publicada pela fonte.' };
  }

  const cached = probeCache.get(address);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cached: true };
  }

  let head;
  try {
    head = await safeFetch(address, { method: 'HEAD', timeoutMs });
  } catch (error) {
    // Rede indisponível ou tempo esgotado. O documento pode existir; nós é que
    // não conseguimos alcançá-lo, e isso jamais vira "sem documento".
    const result = {
      status: DOCUMENT_STATUS.UNAVAILABLE,
      checkedAt,
      erro: error.message,
      evidence: `A URL publicada não respondeu: ${error.message}. A URL foi preservada.`,
    };
    return result;
  }

  if (!head.ok) {
    const result = {
      status: head.status === 404 ? DOCUMENT_STATUS.UNAVAILABLE : DOCUMENT_STATUS.ERROR,
      httpStatus: head.status,
      checkedAt,
      erro: `HTTP ${head.status}`,
      evidence: head.status === 404
        ? 'A URL publicada pela fonte responde HTTP 404. O documento foi referenciado, mas não está '
          + 'acessível no endereço informado.'
        : `A verificação da URL respondeu HTTP ${head.status}.`,
    };
    probeCache.set(address, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  const contentType = head.headers?.get?.('content-type') ?? null;
  const declaredLength = Number(head.headers?.get?.('content-length'));
  const bytes = Number.isFinite(declaredLength) ? declaredLength : null;

  // Amostra do cabeçalho, só para confirmar o formato real do arquivo.
  let headerBytes = null;
  let rangeSupported = false;
  try {
    const range = await safeFetch(address, {
      timeoutMs,
      headers: { Range: `bytes=0-${RANGE_BYTES - 1}` },
    });
    if (range.ok) {
      headerBytes = Buffer.from(await range.arrayBuffer());
      rangeSupported = range.status === 206;
    }
  } catch {
    // A amostra é complementar: sem ela a disponibilidade já está confirmada
    // pelo HEAD, e o formato apenas permanece desconhecido.
  }

  const isPdf = Boolean(headerBytes && headerBytes.toString('latin1').startsWith('%PDF-'));
  const result = {
    status: DOCUMENT_STATUS.AVAILABLE,
    httpStatus: head.status,
    contentType,
    bytes,
    isPdf,
    textLayer: detectTextLayer(headerBytes, contentType),
    checkedAt,
    evidence: `HTTP ${head.status}, ${contentType ?? 'tipo não informado'}`
      + `${bytes ? `, ${bytes} bytes` : ''}`
      + `${headerBytes ? `, assinatura "${headerBytes.slice(0, 5).toString('latin1')}"` : ''}`
      + `${rangeSupported ? ', verificado por requisição parcial de 512 bytes' : ''}.`,
  };
  probeCache.set(address, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Verifica vários documentos com concorrência limitada e teto declarado. */
async function probeDocuments(urls = [], options = {}) {
  const unique = [...new Set(urls.filter(Boolean))];
  const selected = unique.slice(0, MAX_PROBES);
  const results = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < selected.length) {
      const index = cursor;
      cursor += 1;
      results.set(selected[index], await probeDocument(selected[index], options));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selected.length) }, worker));

  return {
    results,
    verificados: selected.length,
    naoVerificados: unique.length - selected.length,
    // Documento não verificado permanece REFERENCED: não verificar não é
    // indisponibilidade, e a diferença precisa sobreviver.
    truncado: unique.length > selected.length,
  };
}

function clearCache() {
  probeCache.clear();
}

module.exports = { probeDocument, probeDocuments, detectTextLayer, clearCache, MAX_PROBES };
