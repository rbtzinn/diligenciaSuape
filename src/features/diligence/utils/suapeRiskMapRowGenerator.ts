// ==========================================================
// DILIGÊNCIA 360 — Motor Oficial da Avaliação de Integridade SUAPE
// & Gerador da Linha do Mapa de Risco de Terceiros (40 colunas)
//
// Fórmulas e textos vêm de `suapeIntegrityCatalog.ts`, que documenta a
// origem de cada um nas planilhas oficiais.
//
// Duas regras estruturam este arquivo:
//
// 1. SEM QUESTIONÁRIO NÃO HÁ CLASSIFICAÇÃO. A planilha classifica pelas
//    respostas do terceiro, não pela pesquisa. Enquanto o questionário
//    não chega, o sistema entrega evidência e diz que a classificação
//    está pendente — nunca um risco calculado por conta própria.
//
// 2. A PESQUISA NÃO RESPONDE PELO TERCEIRO. Sanção encontrada em CEIS,
//    CNEP, TCE-PE ou MTE não liga o gatilho 4.4 sozinha: ela vira sinal
//    de evidência e, se contradisser a resposta declarada, alerta de
//    contradição para o analista resolver e registrar.
// ==========================================================

import type { DiligenceItem } from '../types';
import mteSanctionsData from '../data/mteSanctions.json';
import {
  SUAPE_ALCADA_CONSELHO_VALOR,
  SUAPE_DECLARACAO_NAO_APLICAVEL,
  SUAPE_OFFICIAL_ACTIONS,
  SUAPE_RESPONSAVEL_PADRAO,
  SUAPE_RISK_BY_ITEM,
  SUAPE_RISK_CATALOG,
  SUAPE_RISK_MAP_RECOMMENDATIONS,
  countSuapeBusinessDays,
  evaluateIntegrityMaturity,
  parseBrazilianDate,
  type QuestionnaireAnswer,
  type SuapeCalculatedRisk,
  type SuapeIntegrityItemKey,
  type SuapeMaturityItemKey,
  type SuapeMaturityResult,
  type SuapeRegistryKey,
} from './suapeIntegrityCatalog';

export {
  SUAPE_DIRETORIAS,
  SUAPE_MATURITY_ITEMS,
  SUAPE_OFFICIAL_ACTIONS,
  SUAPE_QUESTION_TEXTS,
  SUAPE_REGISTRIES,
  SUAPE_RISK_CATALOG,
  SUAPE_RISK_MAP_RECOMMENDATIONS,
  countSuapeBusinessDays,
  evaluateIntegrityMaturity,
} from './suapeIntegrityCatalog';
export type {
  QuestionnaireAnswer,
  SuapeCalculatedRisk,
  SuapeIntegrityItemKey,
  SuapeMaturityItemKey,
  SuapeMaturityLevel,
  SuapeMaturityResult,
  SuapeRegistryKey,
} from './suapeIntegrityCatalog';

/** Itens que a planilha exige respondidos para classificar. */
export const SUAPE_REQUIRED_ITEMS: SuapeIntegrityItemKey[] = [
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
];

export type IntegrityAnswers = Partial<Record<SuapeIntegrityItemKey, QuestionnaireAnswer>> &
  Partial<Record<SuapeMaturityItemKey, QuestionnaireAnswer>>;

export type SuapeEvaluationStatus = 'pendente' | 'parcial' | 'completo';

export interface SuapeEvidenceSignal {
  /** Item do questionário que esta evidência ajuda a responder. */
  item: SuapeIntegrityItemKey;
  source: string;
  detail: string;
}

export interface SuapeAnswerContradiction {
  item: SuapeIntegrityItemKey;
  declared: 'Sim' | 'Não';
  evidence: string;
}

export interface SuapeTriggeredRisk {
  slot: number;
  item: SuapeIntegrityItemKey;
  text: string;
  classification: SuapeCalculatedRisk;
}

export interface SuapeIntegrityEvaluationResult {
  /** Gatilhos da planilha (células N23, N40, N28, N29). */
  n23: boolean;
  n40: boolean;
  n28: boolean;
  n29: boolean;

  status: SuapeEvaluationStatus;
  /** Itens obrigatórios ainda sem resposta. */
  unidentifiedItems: SuapeIntegrityItemKey[];
  /**
   * `true` quando faltam respostas mas a classificação já não pode mais
   * descer — o que falta só teria como agravar.
   */
  isProvisional: boolean;

  /** `null` enquanto não há questionário: o sistema não arbitra risco. */
  calculatedRisk: SuapeCalculatedRisk | null;
  /** Texto para a coluna CLASSIFICAÇÃO; vazio quando pendente. */
  riskDisplay: string;
  /** Rótulo para a tela, que precisa dizer algo mesmo pendente. */
  statusLabel: string;
  formulaUsed: string;
  /** Célula B48: plano de ação integral do formulário. */
  recommendedAction: string;
  /** Frase curta da coluna RECOMENDAÇÕES do Mapa. */
  riskMapRecommendation: string;

  /** Riscos disparados, cada um no seu slot fixo do Mapa. */
  triggeredRisks: SuapeTriggeredRisk[];

  triggers: {
    n23Reasons: string[];
    n40Reasons: string[];
    n28Reasons: string[];
    n29Reasons: string[];
  };

  /** O que a pesquisa achou e que o analista precisa confrontar. */
  evidenceSignals: SuapeEvidenceSignal[];
  contradictions: SuapeAnswerContradiction[];

  maturity: SuapeMaturityResult;

  /**
   * A planilha se contradiz na alçada do Conselho: a fórmula J16 joga N40
   * em "Muito Alto", mas a tabela de critérios e as 555 linhas do Mapa
   * tratam como "Risco Alto". Adotamos a prática registrada e expomos a
   * divergência em vez de escondê-la.
   */
  alcadaDivergence: { literal: SuapeCalculatedRisk; adopted: SuapeCalculatedRisk; note: string } | null;

  mteMatch?: { tipo: 'trabalho_escravo'; detalhes: string };
}

export const SUAPE_J16_FORMULA =
  '=SE(OU(N23;N40);"Muito Alto";SE(N28;"Alto";SE(N29;"Médio";"Baixo")))';

const ALCADA_DIVERGENCE_NOTE =
  'A fórmula literal da célula J16 classificaria a alçada do Conselho como "Muito Alto". ' +
  'A tabela de critérios da própria planilha e as 555 linhas já registradas no Mapa de Risco ' +
  'tratam a alçada como "Risco Alto" — inclusive contratações de R$ 33 milhões. ' +
  'O sistema adota a prática registrada.';

// ==========================================================
// SINAIS DE EVIDÊNCIA DA PESQUISA
// ==========================================================

/**
 * Reúne o que as fontes oficiais consultadas pelo sistema dizem sobre os
 * itens 4.4 e 5.2. Não classifica nada: só entrega ao analista o que ele
 * precisa para responder o item e, se for o caso, contestar a declaração
 * do terceiro.
 */
export function collectEvidenceSignals(diligence: DiligenceItem): {
  signals: SuapeEvidenceSignal[];
  registryHits: Partial<Record<SuapeRegistryKey, boolean>>;
  mteMatch?: SuapeIntegrityEvaluationResult['mteMatch'];
} {
  const signals: SuapeEvidenceSignal[] = [];
  const registryHits: Partial<Record<SuapeRegistryKey, boolean>> = {};
  let mteMatch: SuapeIntegrityEvaluationResult['mteMatch'] | undefined;

  const cnpjClean = (diligence.cnpj || '').replace(/\D/g, '');
  if (cnpjClean) {
    const record = mteSanctionsData.trabalhoEscravo.find((entry) => entry.cnpjClean === cnpjClean);
    if (record) {
      mteMatch = {
        tipo: 'trabalho_escravo',
        detalhes: `Consta no Cadastro de Empregadores do MTE (trabalho escravo): ${record.nome}`,
      };
      registryHits.trabalhoEscravo = true;
      signals.push({
        item: '4.4',
        source: 'Ministério do Trabalho e Emprego',
        detail: mteMatch.detalhes,
      });
    }
  }

  const ceisCount = diligence.ceis?.registros?.length || 0;
  if (ceisCount > 0) {
    registryHits.ceis = true;
    signals.push({
      item: '4.4',
      source: 'CEIS — Portal da Transparência',
      detail: `${ceisCount} registro(s) de sanção em nome da pessoa jurídica.`,
    });
  }

  const cnepCount = diligence.cnep?.registros?.length || 0;
  if (cnepCount > 0) {
    registryHits.cnep = true;
    signals.push({
      item: '4.4',
      source: 'CNEP — Portal da Transparência',
      detail: `${cnepCount} registro(s) de punição pela Lei 12.846/2013.`,
    });
  }

  const tcePe = diligence.tcePe as { inidoneo?: boolean; resumo?: { resultadosIrregulares?: number } } | undefined;
  const tcePeIrregular = Boolean(tcePe?.inidoneo) || (tcePe?.resumo?.resultadosIrregulares || 0) > 0;
  if (tcePeIrregular) {
    registryHits.tcePe = true;
    signals.push({
      item: '4.4',
      source: 'TCE-PE',
      detail: 'Declaração de inidoneidade ou julgamento irregular no Tribunal de Contas de Pernambuco.',
    });
  }

  // Busca nominal por sócio: os retornos são candidatos, não identidade
  // confirmada, então entram como evidência a validar — nunca como gatilho.
  const personCandidates = diligence.personSanctions?.totalCandidates || 0;
  if (personCandidates > 0) {
    const strong = diligence.personSanctions?.strongCandidates || 0;
    signals.push({
      item: '5.2',
      source: 'CEIS/CNEP — sócios pessoa física',
      detail: `${personCandidates} candidato(s) a sanção em nome de sócio${
        strong > 0 ? `, ${strong} com correlação forte` : ''
      }, sujeitos a validação documental.`,
    });
  }

  const pepHits = Array.isArray(diligence.pepResults)
    ? diligence.pepResults.filter((result) => result.encontrado)
    : [];
  if (pepHits.length > 0) {
    signals.push({
      item: '7.6',
      source: 'Base PEP — Portal da Transparência',
      detail: `${pepHits.length} sócio(s) ou administrador(es) localizado(s) na base de Pessoas Expostas Politicamente.`,
    });
  }

  return { signals, registryHits, mteMatch };
}

// ==========================================================
// GATILHOS DA PLANILHA
//
// Cada célula é uma função isolada porque é assim que a planilha se
// audita: dá para apontar qual linha do Excel ligou o gatilho.
// ==========================================================

/** N23 = OU(L23="X"; L24="X") — itens 4.4 e 5.2 do questionário. */
export function calculateN23(answers: IntegrityAnswers = {}): {
  n23: boolean;
  active: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (answers['4.4'] === true) reasons.push(SUAPE_RISK_BY_ITEM['4.4'].text);
  if (answers['5.2'] === true) reasons.push(SUAPE_RISK_BY_ITEM['5.2'].text);
  const active = reasons.length > 0;
  return { n23: active, active, reasons };
}

/**
 * N40 = SE(L40="X"). O valor do contrato sozinho não marca a célula: a
 * planilha pergunta se as obrigações foram *autorizadas* por alçada do
 * Conselho, e isso é um ato, não um número. O valor a partir de
 * R$ 10.000.000,00 é indício e entra como sugestão para o analista.
 */
export function calculateN40(
  contractValue = 0,
  answers: IntegrityAnswers = {}
): { n40: boolean; active: boolean; reasons: string[]; suggestedByValue: boolean } {
  const reasons: string[] = [];
  const suggestedByValue =
    typeof contractValue === 'number' && contractValue >= SUAPE_ALCADA_CONSELHO_VALOR;

  if (answers.alcadaConselho === true) {
    reasons.push(SUAPE_RISK_BY_ITEM.alcadaConselho.text);
  }

  const active = reasons.length > 0;
  return { n40: active, active, reasons, suggestedByValue };
}

/** N28 = OU(L28;L30;L31;L32;L33;L34;L35;L36) — itens 7.1, 7.3 a 7.9. */
export function calculateN28(answers: IntegrityAnswers = {}): {
  n28: boolean;
  active: boolean;
  reasons: string[];
} {
  const items: SuapeIntegrityItemKey[] = ['7.1', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9'];
  const reasons = items
    .filter((item) => answers[item] === true)
    .map((item) => SUAPE_RISK_BY_ITEM[item].text);
  const active = reasons.length > 0;
  return { n28: active, active, reasons };
}

/** N29 = OU(L29="X") — item 7.2, licenças ordinárias da atividade. */
export function calculateN29(answers: IntegrityAnswers = {}): {
  n29: boolean;
  active: boolean;
  reasons: string[];
} {
  const reasons = answers['7.2'] === true ? [SUAPE_RISK_BY_ITEM['7.2'].text] : [];
  const active = reasons.length > 0;
  return { n29: active, active, reasons };
}

/**
 * Precedência da classificação. Difere da fórmula literal em um ponto,
 * documentado em `ALCADA_DIVERGENCE_NOTE`: N40 leva a "Alto", não a
 * "Muito Alto".
 */
function classify(n23: boolean, n40: boolean, n28: boolean, n29: boolean): SuapeCalculatedRisk {
  if (n23) return 'Muito Alto';
  if (n40 || n28) return 'Alto';
  if (n29) return 'Médio';
  return 'Baixo';
}

// ==========================================================
// AVALIAÇÃO
// ==========================================================

export function evaluateSuapeIntegrity(
  diligence: DiligenceItem,
  contractValue = 0,
  answers: IntegrityAnswers = {}
): SuapeIntegrityEvaluationResult {
  const unidentifiedItems = SUAPE_REQUIRED_ITEMS.filter(
    (item) => answers[item] !== true && answers[item] !== false
  );
  const answeredCount = SUAPE_REQUIRED_ITEMS.length - unidentifiedItems.length;
  const status: SuapeEvaluationStatus =
    answeredCount === 0 ? 'pendente' : unidentifiedItems.length === 0 ? 'completo' : 'parcial';

  const { n23, reasons: n23Reasons } = calculateN23(answers);
  const { n40, reasons: n40Reasons, suggestedByValue } = calculateN40(contractValue, answers);
  const { n28, reasons: n28Reasons } = calculateN28(answers);
  const { n29, reasons: n29Reasons } = calculateN29(answers);

  const { signals, registryHits, mteMatch } = collectEvidenceSignals(diligence);

  // Contradição: fonte oficial registra o fato e o terceiro declarou que não.
  const contradictions: SuapeAnswerContradiction[] = [];
  for (const signal of signals) {
    if (answers[signal.item] === false) {
      contradictions.push({
        item: signal.item,
        declared: 'Não',
        evidence: `${signal.source}: ${signal.detail}`,
      });
    }
  }

  const maturityAnswers: Partial<Record<SuapeMaturityItemKey, QuestionnaireAnswer>> = {};
  for (const key of ['8.1', '8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.8', '8.9', '9.0'] as const) {
    maturityAnswers[key] = answers[key] ?? null;
  }
  const maturity = evaluateIntegrityMaturity(maturityAnswers, registryHits);

  const triggeredRisks: SuapeTriggeredRisk[] = SUAPE_RISK_CATALOG.filter(
    (entry) => answers[entry.item] === true
  ).map((entry) => ({
    slot: entry.slot,
    item: entry.item,
    text: entry.text,
    classification: entry.classification,
  }));

  // Enquanto nada foi respondido, não há classificação a emitir.
  let calculatedRisk: SuapeCalculatedRisk | null = null;
  let isProvisional = false;
  if (status !== 'pendente') {
    calculatedRisk = classify(n23, n40, n28, n29);
    // Com itens em aberto, a classificação atual é piso: o que falta só
    // poderia agravar. "Muito Alto" já é o teto, então não é provisório.
    isProvisional = status === 'parcial' && calculatedRisk !== 'Muito Alto';
  }

  const alcadaDivergence =
    n40 && !n23
      ? { literal: 'Muito Alto' as const, adopted: 'Alto' as const, note: ALCADA_DIVERGENCE_NOTE }
      : null;

  const statusLabel =
    calculatedRisk === null
      ? 'Classificação pendente de questionário'
      : isProvisional
        ? `Risco ${calculatedRisk} (provisório — ${unidentifiedItems.length} item(ns) sem resposta)`
        : `Risco ${calculatedRisk}`;

  if (suggestedByValue && answers.alcadaConselho !== true) {
    signals.push({
      item: 'alcadaConselho',
      source: 'Valor informado da contratação',
      detail: `Valor de R$ ${contractValue.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })} atinge o patamar de alçada do Conselho de Administração (R$ 10.000.000,00). Confirme se as obrigações foram autorizadas por alçada.`,
    });
  }

  return {
    n23,
    n40,
    n28,
    n29,
    status,
    unidentifiedItems,
    isProvisional,
    calculatedRisk,
    riskDisplay: calculatedRisk ? `Risco ${calculatedRisk}` : '',
    statusLabel,
    formulaUsed: SUAPE_J16_FORMULA,
    recommendedAction: calculatedRisk ? SUAPE_OFFICIAL_ACTIONS[calculatedRisk] : '',
    riskMapRecommendation: calculatedRisk ? SUAPE_RISK_MAP_RECOMMENDATIONS[calculatedRisk] : '',
    triggeredRisks,
    triggers: { n23Reasons, n40Reasons, n28Reasons, n29Reasons },
    evidenceSignals: signals,
    contradictions,
    maturity,
    alcadaDivergence,
    mteMatch,
  };
}

// ==========================================================
// SCHEMA DAS 40 COLUNAS DO MAPA DE RISCO
// Cabeçalho A2:AN2 da aba "Mapa de Risco".
// ==========================================================

export interface RiskMapColumnDefinition {
  index: number;
  letter: string;
  header: string;
  key: string;
}

export const RISK_MAP_COLUMNS_SCHEMA: RiskMapColumnDefinition[] = [
  { index: 1, letter: 'A', header: 'REGISTRO Nº', key: 'id' },
  { index: 2, letter: 'B', header: 'ANO', key: 'ano' },
  { index: 3, letter: 'C', header: 'RESPONSÁVEL', key: 'responsavel' },
  { index: 4, letter: 'D', header: 'DATA DE ENTRADA', key: 'dataEntrada' },
  { index: 5, letter: 'E', header: 'DATA DE SAÍDA', key: 'dataSaida' },
  { index: 6, letter: 'F', header: 'TEMPO DECORRIDO - SEM FIM DE SEMANA E FERIADO', key: 'tempoDecorrido' },
  { index: 7, letter: 'G', header: 'DIRETORIA', key: 'diretoria' },
  { index: 8, letter: 'H', header: 'GESTOR(A)', key: 'gestor' },
  { index: 9, letter: 'I', header: 'EMPRESA', key: 'empresa' },
  { index: 10, letter: 'J', header: 'TOTAL DE CONSULTAS', key: 'totalConsultas' },
  { index: 11, letter: 'K', header: 'CNPJ', key: 'cnpj' },
  { index: 12, letter: 'L', header: 'VALOR', key: 'valor' },
  { index: 13, letter: 'M', header: 'CLASSIFICAÇÃO', key: 'classificacao' },
  { index: 14, letter: 'N', header: 'RISCO 1', key: 'risco1' },
  { index: 15, letter: 'O', header: 'RISCO 2', key: 'risco2' },
  { index: 16, letter: 'P', header: 'RISCO 3', key: 'risco3' },
  { index: 17, letter: 'Q', header: 'RISCO 4', key: 'risco4' },
  { index: 18, letter: 'R', header: 'RISCO 5', key: 'risco5' },
  { index: 19, letter: 'S', header: 'RISCO 6', key: 'risco6' },
  { index: 20, letter: 'T', header: 'RISCO 7', key: 'risco7' },
  { index: 21, letter: 'U', header: 'RISCO 8', key: 'risco8' },
  { index: 22, letter: 'V', header: 'RISCO 9', key: 'risco9' },
  { index: 23, letter: 'W', header: 'RISCO 10', key: 'risco10' },
  { index: 24, letter: 'X', header: 'RISCO 11', key: 'risco11' },
  { index: 25, letter: 'Y', header: 'RISCO 12', key: 'risco12' },
  { index: 26, letter: 'Z', header: 'A EMPRESA POSSUI CÓDIGO DE CONDUTA?', key: 'codigoConduta' },
  { index: 27, letter: 'AA', header: 'A EMPRESA CONDUZ TREINAMENTO PARA GESTÃO SOCIETÁRIA ?', key: 'treinamentoGestao' },
  {
    index: 28,
    letter: 'AB',
    header: 'POSSUI PROFISSIONAL RESPONSÁVEL POR UM PROGRAMA OU POLÍTICA ANTICORRUPÇÃO?',
    key: 'profissionalAnticorrupcao',
  },
  { index: 29, letter: 'AC', header: 'NOTA ORIENTATIVA', key: 'notaOrientativa' },
  { index: 30, letter: 'AD', header: 'RECOMENDAÇÕES', key: 'recomendacoes' },
  {
    index: 31,
    letter: 'AE',
    header: 'DECLARAÇÃO DE GESTÃO DE CONTRATOS COM TERCEIROS DE RISCO ALTO ASSINADA?',
    key: 'declaracaoAssinada',
  },
  { index: 32, letter: 'AF', header: 'DOCUMENTO DE CONTROLE', key: 'documentoControle' },
  { index: 33, letter: 'AG', header: 'GESTOR FOI TREINADO?', key: 'gestorTreinado' },
  { index: 34, letter: 'AH', header: 'OBSERVAÇÕES', key: 'observacoes' },
  { index: 35, letter: 'AI', header: 'ano entrada', key: 'anoEntrada' },
  { index: 36, letter: 'AJ', header: 'ano saida', key: 'anoSaida' },
  { index: 37, letter: 'AK', header: 'entrada', key: 'entrada' },
  { index: 38, letter: 'AL', header: 'saída', key: 'saida' },
  { index: 39, letter: 'AM', header: 'SEI da Contratação', key: 'seiContratacao' },
  { index: 40, letter: 'AN', header: 'Nº do Contrato', key: 'numeroContrato' },
];

export interface RiskMapRowParams {
  id?: string | number;
  ano?: string | number;
  responsavel?: string;
  dataInicio?: string;
  dataFim?: string;
  /** Sobrescreve o cálculo de dias úteis quando o analista souber melhor. */
  dias?: string | number;
  diretoriaDemandante?: string;
  gestor?: string;
  razaoSocial?: string;
  cnpj?: string;
  valorContrato?: number | string;
  totalConsultas?: string | number;
  notaTecnica?: string;
  processoSei?: string;
  numeroContrato?: string;
  observacoes?: string;
  /** Só o analista sabe se a declaração foi assinada; o sistema não supõe. */
  declaracaoAssinada?: string;
  gestorTreinado?: string;
  customRecomendacoes?: string;
  answers?: IntegrityAnswers;
  customEvaluation?: SuapeIntegrityEvaluationResult;
}

export interface RiskMapRowOutput {
  rawLine: string;
  columns: Array<{ index: number; letter: string; name: string; key: string; value: string }>;
  evaluation: SuapeIntegrityEvaluationResult;
  /** Motivos que impedem colar a linha sem revisão humana. */
  blockers: string[];
}

function formatBrazilianDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function formatAnswer(answer?: QuestionnaireAnswer): string {
  if (answer === true) return 'Sim';
  if (answer === false) return 'Não';
  return '';
}

/**
 * Monta a linha de 40 colunas separada por tabulação, pronta para colar
 * na primeira célula da linha do Mapa de Risco.
 */
export function generateRiskMapRow(
  diligence: DiligenceItem,
  params: RiskMapRowParams = {}
): RiskMapRowOutput {
  const numValue =
    typeof params.valorContrato === 'number'
      ? params.valorContrato
      : parseFloat(
          String(params.valorContrato || '0')
            .replace(/[^\d,.-]/g, '')
            .replace(/\.(?=\d{3}\b)/g, '')
            .replace(',', '.')
        ) || 0;

  const evaluation =
    params.customEvaluation || evaluateSuapeIntegrity(diligence, numValue, params.answers);

  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const dataInicio = params.dataInicio || formatBrazilianDate(todayUtc);
  const dataFim = params.dataFim || formatBrazilianDate(todayUtc);

  const inicioDate = parseBrazilianDate(dataInicio);
  const fimDate = parseBrazilianDate(dataFim);
  const tempoDecorrido =
    params.dias !== undefined && params.dias !== ''
      ? String(params.dias)
      : inicioDate && fimDate
        ? String(countSuapeBusinessDays(inicioDate, fimDate))
        : '';

  const valorFormatado =
    numValue > 0
      ? ` R$  ${numValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `
      : '';

  // Cada risco disparado vai para o seu slot fixo, como no histórico.
  const riscoColumns: Record<string, string> = {};
  for (let slot = 1; slot <= 12; slot += 1) {
    riscoColumns[`risco${slot}`] =
      evaluation.triggeredRisks.find((risk) => risk.slot === slot)?.text || '';
  }

  const risk = evaluation.calculatedRisk;
  const declaracaoAssinada =
    params.declaracaoAssinada !== undefined
      ? params.declaracaoAssinada
      : risk === 'Alto' || risk === 'Muito Alto'
        ? '' // exige confirmação humana: o sistema não sabe se foi assinada
        : risk
          ? SUAPE_DECLARACAO_NAO_APLICAVEL
          : '';

  const columnValueMap: Record<string, string> = {
    id: params.id !== undefined && params.id !== null ? String(params.id) : '',
    ano: String(params.ano || todayUtc.getUTCFullYear()),
    responsavel: params.responsavel || SUAPE_RESPONSAVEL_PADRAO,
    dataEntrada: dataInicio,
    dataSaida: dataFim,
    tempoDecorrido,
    diretoria: params.diretoriaDemandante || '',
    gestor: params.gestor || '',
    empresa: params.razaoSocial || diligence.razaoSocial || '',
    totalConsultas: params.totalConsultas !== undefined ? String(params.totalConsultas) : '',
    cnpj: params.cnpj || diligence.cnpjFmt || diligence.cnpj || '',
    valor: valorFormatado,
    classificacao: evaluation.riskDisplay,
    ...riscoColumns,
    codigoConduta: formatAnswer(params.answers?.['8.2']),
    treinamentoGestao: formatAnswer(params.answers?.['8.7']),
    profissionalAnticorrupcao: formatAnswer(params.answers?.['9.0']),
    notaOrientativa: params.notaTecnica || '',
    recomendacoes: params.customRecomendacoes || evaluation.riskMapRecommendation,
    declaracaoAssinada,
    documentoControle: params.processoSei
      ? params.processoSei.toUpperCase().startsWith('SEI')
        ? params.processoSei
        : `SEI: ${params.processoSei}`
      : '',
    gestorTreinado: params.gestorTreinado || '',
    observacoes: params.observacoes || '',
    anoEntrada: inicioDate ? String(inicioDate.getUTCFullYear()) : '',
    anoSaida: fimDate ? String(fimDate.getUTCFullYear()) : '',
    entrada: '',
    saida: '',
    seiContratacao: '',
    numeroContrato: params.numeroContrato || '',
  };

  const columns = RISK_MAP_COLUMNS_SCHEMA.map((definition) => ({
    index: definition.index,
    letter: definition.letter,
    name: definition.header,
    key: definition.key,
    value: columnValueMap[definition.key] ?? '',
  }));

  const blockers: string[] = [];
  if (evaluation.status === 'pendente') {
    blockers.push('Questionário de Diligência ainda não importado: não há classificação a registrar.');
  } else if (evaluation.isProvisional) {
    blockers.push(
      `${evaluation.unidentifiedItems.length} item(ns) do questionário sem resposta — a classificação pode subir.`
    );
  }
  if (evaluation.contradictions.length > 0) {
    blockers.push(
      `${evaluation.contradictions.length} resposta(s) do terceiro contrariam fonte oficial consultada.`
    );
  }
  if (!columnValueMap.diretoria) blockers.push('Diretoria demandante não informada.');
  if (!columnValueMap.gestor) blockers.push('Gestor(a) do contrato não informado.');

  return {
    rawLine: columns.map((column) => column.value).join('\t'),
    columns,
    evaluation,
    blockers,
  };
}
