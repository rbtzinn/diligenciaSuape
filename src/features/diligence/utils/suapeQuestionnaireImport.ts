// ==========================================================
// DILIGÊNCIA 360 — Importação do Questionário por Transcrição de IA
//
// O terceiro devolve o Questionário de Diligência como o Excel impresso
// em PDF — e às vezes como foto do papel assinado. Nos dois casos a
// leitura automática local falha: no PDF o texto até sai, mas na ordem
// errada (os blocos "Selecione / Sim" aparecem antes dos enunciados a
// que pertencem), e na foto não há texto nenhum.
//
// Em vez de fingir que um regex resolve isso, o sistema entrega ao
// analista um prompt pronto. Ele leva o prompt e o arquivo a qualquer
// assistente com leitura de imagem, recebe um JSON no formato abaixo e
// cola de volta aqui. A transcrição é conferida contra este schema antes
// de virar resposta: formato errado é rejeitado, item sem citação
// literal entra como não identificado.
//
// Custo zero e sem chave de API: quem lê o documento é a ferramenta que
// o analista já usa.
// ==========================================================

import {
  SUAPE_MATURITY_ITEMS,
  SUAPE_QUESTION_TEXTS,
  type QuestionnaireAnswer,
  type SuapeIntegrityItemKey,
  type SuapeMaturityItemKey,
} from './suapeIntegrityCatalog';
import type { IntegrityAnswers } from './suapeRiskMapRowGenerator';

export const SUAPE_IMPORT_SCHEMA_VERSION = 'suape-questionario-1';

const INTEGRITY_KEYS: SuapeIntegrityItemKey[] = [
  '4.4',
  '5.2',
  '7.1',
  '7.2',
  '7.3',
  '7.4',
  '7.5',
  '7.6',
  '7.7',
  '7.8',
  '7.9',
  'alcadaConselho',
];

const MATURITY_KEYS = SUAPE_MATURITY_ITEMS.map((item) => item.key);

const ALL_KEYS: Array<SuapeIntegrityItemKey | SuapeMaturityItemKey> = [
  ...INTEGRITY_KEYS,
  ...MATURITY_KEYS,
];

// ==========================================================
// 1. GERAÇÃO DO PROMPT
// ==========================================================

export interface QuestionnairePromptContext {
  razaoSocial?: string;
  cnpj?: string;
}

/**
 * Prompt para o analista copiar. É deliberadamente restritivo: proíbe
 * inferência, exige citação literal para cada "sim" e manda devolver
 * "nao_identificado" quando o documento não responder — porque um
 * "não" inventado vira classificação Baixo num terceiro que deveria
 * estar em Muito Alto.
 */
export function buildQuestionnaireExtractionPrompt(
  context: QuestionnairePromptContext = {}
): string {
  const alvo = [context.razaoSocial, context.cnpj].filter(Boolean).join(' — ');

  const perguntas = [
    ...INTEGRITY_KEYS.map((key) => `- "${key}": ${SUAPE_QUESTION_TEXTS[key]}`),
    ...SUAPE_MATURITY_ITEMS.map((item) => `- "${item.key}": ${item.text}`),
  ].join('\n');

  return `Você vai transcrever um Questionário de Diligência de SUAPE preenchido por um fornecedor. O arquivo está anexado (PDF, imagem ou foto).

${alvo ? `Empresa esperada: ${alvo}\n` : ''}TAREFA: ler o documento e devolver APENAS um bloco JSON, sem texto antes ou depois, no formato exato do final deste prompt.

REGRAS OBRIGATÓRIAS:
1. Transcreva. Não interprete, não deduza, não complete.
2. Cada resposta só pode ser "sim", "nao" ou "nao_identificado".
3. Use "sim" ou "nao" SOMENTE quando a marcação estiver visível e inequivocamente ligada àquela pergunta no documento.
4. Se a pergunta não existir no documento, estiver em branco, ilegível, ou se você não tiver certeza de qual marcação pertence a ela, responda "nao_identificado". Esta é a resposta correta na dúvida — não é falha sua.
5. Para toda resposta "sim", preencha "evidencias" com a frase literal copiada do documento que sustenta a marcação. Sem citação literal, responda "nao_identificado".
6. Não invente número de processo, valor ou nome. Campo ausente vai como null.
7. O documento pode trazer as respostas em coluna separada do enunciado, ou na ordem trocada. Confira visualmente a qual pergunta cada marcação pertence antes de transcrever.

PERGUNTAS A TRANSCREVER:
${perguntas}

FORMATO DE SAÍDA (copie a estrutura, troque os valores):
{
  "versao": "${SUAPE_IMPORT_SCHEMA_VERSION}",
  "razaoSocial": null,
  "cnpj": null,
  "dadosGerais": {
    "valorContrato": null,
    "processoSei": null,
    "diretoria": null,
    "gestor": null,
    "objetoContrato": null,
    "representante": null,
    "dataPreenchimento": null
  },
  "respostas": {
${ALL_KEYS.map((key) => `    "${key}": "nao_identificado"`).join(',\n')}
  },
  "evidencias": {
    "7.2": "cole aqui a frase literal do documento, apenas para respostas sim"
  }
}`;
}

// ==========================================================
// 2. LEITURA DO RETORNO
// ==========================================================

export interface QuestionnaireImportGeneralData {
  valorContrato: number | null;
  processoSei: string | null;
  diretoria: string | null;
  gestor: string | null;
  objetoContrato: string | null;
  representante: string | null;
  dataPreenchimento: string | null;
}

export interface QuestionnaireImportResult {
  ok: boolean;
  /** Mensagens que impedem a importação. */
  errors: string[];
  /** Problemas que não impedem, mas o analista precisa ver. */
  warnings: string[];
  answers: IntegrityAnswers;
  evidences: Partial<Record<SuapeIntegrityItemKey | SuapeMaturityItemKey, string>>;
  generalData: QuestionnaireImportGeneralData;
  razaoSocial: string | null;
  cnpj: string | null;
  /** Contagem por situação, para a tela confirmar antes de aplicar. */
  summary: { sim: number; nao: number; naoIdentificado: number; total: number };
  /** Itens marcados "sim" sem citação literal — rebaixados a não identificado. */
  demotedForMissingEvidence: string[];
}

const EMPTY_GENERAL_DATA: QuestionnaireImportGeneralData = {
  valorContrato: null,
  processoSei: null,
  diretoria: null,
  gestor: null,
  objetoContrato: null,
  representante: null,
  dataPreenchimento: null,
};

function emptyResult(errors: string[]): QuestionnaireImportResult {
  return {
    ok: false,
    errors,
    warnings: [],
    answers: {},
    evidences: {},
    generalData: { ...EMPTY_GENERAL_DATA },
    razaoSocial: null,
    cnpj: null,
    summary: { sim: 0, nao: 0, naoIdentificado: 0, total: 0 },
    demotedForMissingEvidence: [],
  };
}

/**
 * Assistentes costumam embrulhar o JSON em cerca de código ou em uma
 * frase de cortesia. Em vez de recusar por isso, extraímos o objeto —
 * mas sem nunca avaliar o texto como código.
 */
function extractJsonObject(raw: string): string | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1].trim() : text;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function normalizeAnswer(value: unknown): QuestionnaireAnswer | 'invalido' {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (text === 'sim' || text === 'true' || text === 's' || text === 'x') return true;
  if (text === 'nao' || text === 'false' || text === 'n') return false;
  if (
    text === '' ||
    text === 'nao_identificado' ||
    text === 'nao identificado' ||
    text === 'null' ||
    text === 'n/a' ||
    text === 'na' ||
    text === 'selecione'
  ) {
    return null;
  }
  return 'invalido';
}

function normalizeMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;

  const text = String(value).replace(/[^\d,.-]/g, '');
  if (!text) return null;

  // "1.234.567,89" (pt-BR) e "1234567.89" precisam resolver igual.
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null') return null;
  return text;
}

/**
 * Lê a transcrição colada pelo analista. Nada entra sem passar por aqui:
 * chave desconhecida é ignorada com aviso, valor fora do vocabulário
 * vira não identificado, e "sim" sem citação literal é rebaixado.
 */
export function parseQuestionnaireImport(raw: string): QuestionnaireImportResult {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return emptyResult([
      'Não encontrei um bloco JSON no texto colado. Cole a resposta da IA inteira, incluindo as chaves { }.',
    ]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return emptyResult([
      'O texto colado não é um JSON válido. Peça à IA para repetir a resposta apenas com o bloco JSON, sem comentários.',
    ]);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyResult(['O conteúdo colado não é um objeto JSON no formato esperado.']);
  }

  const payload = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  const versao = normalizeText(payload.versao);
  if (versao && versao !== SUAPE_IMPORT_SCHEMA_VERSION) {
    warnings.push(
      `A transcrição declara o formato "${versao}", diferente do esperado (${SUAPE_IMPORT_SCHEMA_VERSION}). Confira se o prompt usado é o atual.`
    );
  } else if (!versao) {
    warnings.push('A transcrição não declarou a versão do formato. Confira os itens antes de aplicar.');
  }

  const respostas = payload.respostas;
  if (!respostas || typeof respostas !== 'object' || Array.isArray(respostas)) {
    return emptyResult(['A transcrição não trouxe o objeto "respostas".']);
  }
  const respostasMap = respostas as Record<string, unknown>;

  const evidenciasRaw =
    payload.evidencias && typeof payload.evidencias === 'object' && !Array.isArray(payload.evidencias)
      ? (payload.evidencias as Record<string, unknown>)
      : {};

  const answers: IntegrityAnswers = {};
  const evidences: QuestionnaireImportResult['evidences'] = {};
  const demotedForMissingEvidence: string[] = [];
  let sim = 0;
  let nao = 0;
  let naoIdentificado = 0;

  for (const key of ALL_KEYS) {
    const normalized = normalizeAnswer(respostasMap[key]);

    if (normalized === 'invalido') {
      warnings.push(
        `Item ${key}: valor "${String(respostasMap[key])}" não é reconhecido. Registrado como não identificado.`
      );
      answers[key] = null;
      naoIdentificado += 1;
      continue;
    }

    const evidence = normalizeText(evidenciasRaw[key]);
    if (evidence) evidences[key] = evidence;

    if (normalized === true && !evidence) {
      // Regra 5 do prompt: "sim" sem trecho literal não sustenta gatilho.
      demotedForMissingEvidence.push(key);
      answers[key] = null;
      naoIdentificado += 1;
      continue;
    }

    answers[key] = normalized;
    if (normalized === true) sim += 1;
    else if (normalized === false) nao += 1;
    else naoIdentificado += 1;
  }

  const unknownKeys = Object.keys(respostasMap).filter(
    (key) => !ALL_KEYS.includes(key as SuapeIntegrityItemKey | SuapeMaturityItemKey)
  );
  if (unknownKeys.length > 0) {
    warnings.push(`Itens fora do questionário oficial foram ignorados: ${unknownKeys.join(', ')}.`);
  }

  if (demotedForMissingEvidence.length > 0) {
    warnings.push(
      `${demotedForMissingEvidence.length} item(ns) vieram como "sim" sem citação literal do documento (${demotedForMissingEvidence.join(', ')}) e ficaram como não identificados. Confirme manualmente ou peça a transcrição de novo com as evidências.`
    );
  }

  if (sim === 0 && nao === 0) {
    errors.push(
      'Nenhum item foi transcrito com resposta utilizável. Verifique se o arquivo correto foi enviado à IA.'
    );
  }

  const dadosGeraisRaw =
    payload.dadosGerais && typeof payload.dadosGerais === 'object' && !Array.isArray(payload.dadosGerais)
      ? (payload.dadosGerais as Record<string, unknown>)
      : {};

  const generalData: QuestionnaireImportGeneralData = {
    valorContrato: normalizeMoney(dadosGeraisRaw.valorContrato),
    processoSei: normalizeText(dadosGeraisRaw.processoSei),
    diretoria: normalizeText(dadosGeraisRaw.diretoria)?.toUpperCase() ?? null,
    gestor: normalizeText(dadosGeraisRaw.gestor),
    objetoContrato: normalizeText(dadosGeraisRaw.objetoContrato),
    representante: normalizeText(dadosGeraisRaw.representante),
    dataPreenchimento: normalizeText(dadosGeraisRaw.dataPreenchimento),
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    answers,
    evidences,
    generalData,
    razaoSocial: normalizeText(payload.razaoSocial),
    cnpj: normalizeText(payload.cnpj),
    summary: { sim, nao, naoIdentificado, total: ALL_KEYS.length },
    demotedForMissingEvidence,
  };
}

/**
 * Compara o CNPJ transcrito com o da diligência aberta. Importar o
 * questionário da empresa errada é o tipo de engano que só aparece
 * depois que a linha já foi colada no Mapa.
 */
export function checkImportedCnpj(
  importedCnpj: string | null,
  diligenceCnpj: string | undefined
): string | null {
  const a = String(importedCnpj || '').replace(/\D/g, '');
  const b = String(diligenceCnpj || '').replace(/\D/g, '');
  if (!a || !b) return null;
  if (a === b) return null;
  return `O questionário transcrito declara o CNPJ ${importedCnpj}, diferente da diligência aberta (${diligenceCnpj}). Confirme se o arquivo é do terceiro certo antes de aplicar.`;
}
