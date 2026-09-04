// ==========================================================
// DILIGÊNCIA 360 — Leitura integral do dossiê por IA gratuita
// A IA não pesquisa e não descobre fatos: ela lê o pacote de evidências
// coletado pelos provedores oficiais e redige a análise consolidada.
// Todo achado sem evidência citada é descartado antes de chegar à tela.
// ==========================================================

const { chat, isConfigured, listProviders } = require('./llm.provider');
const { buildEvidencePack } = require('./evidence-pack');

const ANALYSIS_VERSION = 'ai-dossier-v1';

const SEVERITIES = Object.freeze({
  critico: { ordem: 0, emoji: '🔴', rotulo: 'Crítico' },
  alto: { ordem: 1, emoji: '🔴', rotulo: 'Alto' },
  moderado: { ordem: 2, emoji: '🟠', rotulo: 'Moderado' },
  atencao: { ordem: 3, emoji: '🟡', rotulo: 'Atenção' },
  informativo: { ordem: 4, emoji: '⚪', rotulo: 'Informativo' },
  positivo: { ordem: 5, emoji: '🟢', rotulo: 'Positivo' },
});

const SYSTEM_PROMPT = [
  'Você é analista sênior de compliance e integridade, redigindo em português do Brasil para um dossiê de due diligence de fornecedores.',
  '',
  'REGRAS ABSOLUTAS:',
  '1. Você NÃO tem conhecimento próprio sobre a empresa. Use exclusivamente as evidências numeradas fornecidas.',
  '2. Toda afirmação factual precisa citar ao menos um identificador de evidência (ex.: "E12"). Achado sem citação é descartado pelo sistema.',
  '3. É proibido inventar número de processo, valor, data, órgão, nome ou sanção que não esteja literalmente nas evidências.',
  '4. Distinga com rigor três coisas diferentes: (a) sanção administrativa vigente aplicada à empresa; (b) contratação ou procedimento considerado irregular por órgão de controle; (c) menção jornalística ou investigação em curso. Nunca trate uma como a outra.',
  '5. Presunção de inocência e linguagem defensável: escreva "empresa contratada em procedimento posteriormente considerado irregular" e não "empresa fraudadora". Não afirme dolo, fraude ou culpa sem que a evidência traga decisão nesse sentido.',
  '6. Menção nominal em notícia é hipótese investigativa, não conclusão. Homônimo é homônimo: busca por nome sem CPF completo nunca confirma identidade.',
  '7. Ausência de achado NÃO é atestado de idoneidade. Registre a limitação da fonte.',
  '8. Risco aqui significa exposição e necessidade de análise, jamais culpabilidade.',
  '',
  'Responda SOMENTE com um objeto JSON válido, sem texto fora dele e sem cercas de código.',
].join('\n');

function outputContract() {
  return [
    'Formato exigido:',
    '{',
    '  "resumoExecutivo": "3 a 6 frases sobre o que o conjunto das evidências mostra, com citações [E#]",',
    '  "achados": [',
    '    {',
    '      "severidade": "critico|alto|moderado|atencao|informativo|positivo",',
    '      "eixo": "eixo da evidência principal",',
    '      "titulo": "frase curta e factual",',
    '      "analise": "2 a 5 frases explicando o que a evidência mostra e o que ela não permite concluir",',
    '      "evidencias": ["E1", "E7"],',
    '      "recomendacao": "ação concreta de compliance"',
    '    }',
    '  ],',
    '  "lacunas": ["o que não foi possível verificar e por quê"],',
    '  "perguntasAoFornecedor": ["perguntas objetivas para o due diligence questionnaire"],',
    '  "leituraDeExposicao": "parágrafo sobre o grau de exposição, sem afirmar culpa"',
    '}',
    '',
    'Cubra TODOS os eixos com evidências: cadastro, societário, sanções da empresa, sanções de pessoas, PEP, judicial, mídia e notícias, diários oficiais, rede societária, offshore e base interna. Não omita eixo que tenha evidência. Ordene os achados do mais severo ao menos severo.',
  ].join('\n');
}

function renderEvidence(evidencias) {
  return evidencias
    .map((item) => {
      const partes = [
        `[${item.id}] (${item.eixo}) ${item.titulo}`,
        item.detalhe && `    ${item.detalhe}`,
        `    Fonte: ${item.fonte}${item.data ? ` | Data: ${item.data}` : ''}${item.url ? ` | URL: ${item.url}` : ''}`,
      ];
      return partes.filter(Boolean).join('\n');
    })
    .join('\n');
}

function renderCoverage(cobertura) {
  return cobertura
    .map((item) => `- ${item.eixo}: ${item.status}${item.detalhe ? ` — ${item.detalhe}` : ''}`)
    .join('\n');
}

function buildUserPrompt(dossier, pack) {
  const identificacao = [
    `Empresa: ${dossier.razaoSocial || dossier.empresa?.razao_social || 'não informada'}`,
    `CNPJ: ${dossier.cnpjFmt || dossier.cnpj || 'não informado'}`,
    dossier.nomeFantasia && `Nome fantasia: ${dossier.nomeFantasia}`,
    `Data da análise: ${dossier.dataAnalise || new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  return [
    'ENTIDADE ANALISADA',
    identificacao,
    '',
    'COBERTURA DAS FONTES CONSULTADAS',
    renderCoverage(pack.cobertura) || '- Nenhuma cobertura registrada.',
    '',
    `EVIDÊNCIAS DISPONÍVEIS (${pack.evidencias.length} itens)`,
    renderEvidence(pack.evidencias) || 'Nenhuma evidência coletada.',
    pack.truncado
      ? `\nAVISO: o pacote foi limitado a ${pack.limite} evidências. Registre isso como lacuna.`
      : '',
    '',
    outputContract(),
  ].filter(Boolean).join('\n');
}

function parseJsonResponse(content) {
  const cleaned = String(content || '')
    .replace(/^﻿/, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Alguns modelos antecedem o JSON com uma frase; recorta do primeiro ao último delimitador.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeSeverity(value) {
  const key = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const aliases = {
    critica: 'critico',
    critical: 'critico',
    alta: 'alto',
    high: 'alto',
    media: 'moderado',
    medio: 'moderado',
    moderada: 'moderado',
    medium: 'moderado',
    baixa: 'atencao',
    baixo: 'atencao',
    low: 'atencao',
    info: 'informativo',
    informativa: 'informativo',
    positiva: 'positivo',
  };
  const resolved = aliases[key] || key;
  return SEVERITIES[resolved] ? resolved : 'informativo';
}

function asStringList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Descarta tudo que a IA afirmou sem lastro. É a trava anti-alucinação:
 * um achado só sobrevive se citar pelo menos um identificador existente.
 */
function validateFindings(rawFindings, evidenceIndex) {
  const aceitos = [];
  const descartados = [];

  for (const raw of Array.isArray(rawFindings) ? rawFindings : []) {
    const citadas = asStringList(raw?.evidencias ?? raw?.evidences, 12)
      .map((item) => item.toUpperCase().match(/E\d+/)?.[0])
      .filter(Boolean);
    const validas = [...new Set(citadas)].filter((id) => evidenceIndex.has(id));
    const titulo = String(raw?.titulo ?? raw?.title ?? '').trim();
    const analise = String(raw?.analise ?? raw?.analysis ?? '').trim();

    if (!titulo || !analise) {
      descartados.push({ titulo: titulo || '(sem título)', motivo: 'Achado incompleto devolvido pelo modelo.' });
      continue;
    }
    if (validas.length === 0) {
      descartados.push({ titulo, motivo: 'Nenhuma evidência válida foi citada.' });
      continue;
    }

    const severidade = normalizeSeverity(raw?.severidade ?? raw?.severity);
    aceitos.push({
      severidade,
      severidadeRotulo: SEVERITIES[severidade].rotulo,
      emoji: SEVERITIES[severidade].emoji,
      eixo: String(raw?.eixo ?? raw?.axis ?? evidenceIndex.get(validas[0]).eixo).trim(),
      titulo,
      analise,
      recomendacao: String(raw?.recomendacao ?? raw?.recommendation ?? '').trim() || null,
      evidencias: validas.map((id) => {
        const evidencia = evidenceIndex.get(id);
        return {
          id,
          titulo: evidencia.titulo,
          fonte: evidencia.fonte,
          url: evidencia.url,
          data: evidencia.data,
        };
      }),
    });
  }

  aceitos.sort((left, right) => SEVERITIES[left.severidade].ordem - SEVERITIES[right.severidade].ordem);
  return { aceitos, descartados };
}

function buildDisclaimer(cobertura) {
  const naoVerificados = cobertura
    .filter((item) => item.status === 'INDISPONIVEL' || item.status === 'NAO_CONSULTADO' || item.status === 'PARCIAL' || item.status === 'EXIGE_REVISAO_MANUAL')
    .map((item) => item.eixo);

  const base = 'Análise redigida por modelo de linguagem a partir das evidências coletadas pelos provedores oficiais.'
    + ' Não substitui parecer jurídico nem decisão do Compliance, e exige validação humana antes de qualquer uso externo.'
    + ' Ausência de achado não constitui atestado de idoneidade.';

  return naoVerificados.length > 0
    ? `${base} Eixos com cobertura incompleta nesta execução: ${[...new Set(naoVerificados)].join(', ')}.`
    : base;
}

/**
 * Lê o dossiê inteiro e devolve a análise consolidada e citada.
 */
async function analyzeDossier(dossier = {}, options = {}) {
  const pack = buildEvidencePack(dossier);
  const evidenceIndex = new Map(pack.evidencias.map((item) => [item.id, item]));

  if (pack.evidencias.length === 0) {
    return {
      ok: false,
      status: 422,
      erro: 'O dossiê não possui evidências suficientes para análise. Execute as consultas antes de acionar a IA.',
      cobertura: pack.cobertura,
    };
  }

  let resposta;
  try {
    resposta = await chat({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(dossier, pack),
      jsonMode: true,
      temperature: 0.1,
      maxTokens: options.maxTokens || 4000,
      // Fica abaixo do maxDuration de 60s da função na Vercel, para o erro
      // chegar ao usuário como mensagem tratada e não como corte da plataforma.
      timeoutMs: options.timeoutMs || 45_000,
    });
  } catch (err) {
    return {
      ok: false,
      status: err.status === 429 ? 429 : 503,
      erro: err.message,
      tentativas: err.attempts || [],
      cobertura: pack.cobertura,
    };
  }

  const parsed = parseJsonResponse(resposta.content);
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      status: 502,
      erro: 'O modelo devolveu uma resposta fora do formato esperado. Tente novamente.',
      provedor: resposta.providerLabel,
      modelo: resposta.model,
      cobertura: pack.cobertura,
    };
  }

  const { aceitos, descartados } = validateFindings(parsed.achados ?? parsed.findings, evidenceIndex);

  return {
    ok: true,
    status: 200,
    versao: ANALYSIS_VERSION,
    provedor: resposta.providerLabel,
    provedorId: resposta.providerId,
    modelo: resposta.model,
    geradoEm: new Date().toISOString(),
    resumoExecutivo: String(parsed.resumoExecutivo ?? parsed.executiveSummary ?? '').trim(),
    leituraDeExposicao: String(parsed.leituraDeExposicao ?? parsed.exposureReading ?? '').trim(),
    achados: aceitos,
    achadosDescartados: descartados,
    lacunas: asStringList(parsed.lacunas ?? parsed.gaps, 20),
    perguntasAoFornecedor: asStringList(parsed.perguntasAoFornecedor ?? parsed.supplierQuestions, 20),
    cobertura: pack.cobertura,
    evidencias: pack.evidencias,
    evidenciasTruncadas: pack.truncado,
    tentativasAnteriores: resposta.attempts || [],
    aviso: buildDisclaimer(pack.cobertura),
  };
}

module.exports = {
  ANALYSIS_VERSION,
  analyzeDossier,
  buildEvidencePack,
  isConfigured,
  listProviders,
  parseJsonResponse,
  validateFindings,
};
