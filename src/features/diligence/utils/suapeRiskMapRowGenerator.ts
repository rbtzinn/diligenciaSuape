// ==========================================================
// DILIGÊNCIA 360 — Motor Oficial da Avaliação de Integridade SUAPE
// & Gerador Canônico do Mapa de Risco de Terceiros (40 Colunas)
// Baseado estritamente nas fórmulas oficiais da planilha:
// "Avaliação de Integridade - xx.xlsx" (Células J16, N23, N40, N28, N29, B48)
// e na estrutura oficial da planilha "Mapa de Risco (1).xlsx".
// ==========================================================

import type { DiligenceItem } from '../types';
import mteSanctionsData from '../data/mteSanctions.json';

/**
 * Resposta oficial tri-state para itens do questionário.
 * Proibido inferir falso para valores não identificados.
 * true = 'Sim'
 * false = 'Não'
 * null = 'Não identificado' (requer confirmação humana)
 */
export type QuestionnaireAnswer = boolean | null;

export type SuapeCalculatedRisk = 'Muito Alto' | 'Alto' | 'Médio' | 'Baixo';

export interface IntegrityAnswers {
  '4.4': QuestionnaireAnswer;
  '5.2': QuestionnaireAnswer;
  '7.1': QuestionnaireAnswer;
  '7.2': QuestionnaireAnswer;
  '7.3': QuestionnaireAnswer;
  '7.4': QuestionnaireAnswer;
  '7.5': QuestionnaireAnswer;
  '7.6': QuestionnaireAnswer;
  '7.7': QuestionnaireAnswer;
  '7.8': QuestionnaireAnswer;
  '7.9': QuestionnaireAnswer;
  '8.2'?: QuestionnaireAnswer; // Código de Ética (Col 26 do Mapa)
  '8.7'?: QuestionnaireAnswer; // Treinamento Alta Administração (Col 27 do Mapa)
  '9.0'?: QuestionnaireAnswer; // Compliance Officer / Órgão Anticorrupção (Col 28 do Mapa)
  alcadaConselho?: QuestionnaireAnswer; // Row 40
}

export interface SuapeIntegrityEvaluationResult {
  // Células da fórmula oficial: =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))
  n23: boolean; // Fraude/Corrupção/Processo criminal sócios (Itens 4.4 / 5.2 / Sanções CEIS, CNEP, TCE-PE, MTE)
  n40: boolean; // Alçada do Conselho de Administração (Row 40 / Valor >= R$ 10.000.000,00)
  n28: boolean; // Interação pública / PEP / Licenças contratuais (Itens 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9)
  n29: boolean; // Licenças ordinárias / ART / RRT (Item 7.2)

  // Itens não identificados que precisam de confirmação humana
  unidentifiedItems: string[];

  // Classificação final e fórmula
  calculatedRisk: SuapeCalculatedRisk;
  riskDisplay: string; // "Risco Baixo", "Risco Médio", "Risco Alto", "Risco Muito Alto"
  formulaUsed: string;
  recommendedAction: string; // Célula B48 da planilha oficial

  // Detalhamento dos fatores disparados
  triggers: {
    n23Reasons: string[];
    n40Reasons: string[];
    n28Reasons: string[];
    n29Reasons: string[];
  };

  // Fatores de risco atribuídos às colunas da planilha do Mapa de Risco
  fatorRisco1: string; // Coluna 14 (RISCO 1)
  fatorRisco2: string; // Coluna 15 (RISCO 2) ou Coluna 17 (RISCO 4)
  fatorRisco4: string; // Coluna 17 (RISCO 4 - ex: Licenças 7.2)

  // Verificações oficiais de conformidade
  mteMatch?: {
    tipo: 'trabalho_escravo' | 'ceac';
    detalhes: string;
  };
}

// Textos completos das perguntas do formulário oficial de integridade SUAPE
export const SUAPE_QUESTION_TEXTS = {
  '4.4':
    'Informar se a pessoa jurídica e/ou partes relatas já foi condenada administrativa ou civilmente por atos de corrupção e/ou fraude a licitações e contratos administrativos.',
  '5.2':
    'Informar se houve condenação (ões) criminal (ais), processos criminais ou investigações criminais relacionadas aos sócios por atos de corrupção e/ou fraude a licitações e contratos administrativo:',
  '7.1':
    'A pessoa jurídica exerce uma atividade regulada?',
  '7.2':
    'São necessárias autorizações, licenças, anotações de responsabilidade técnica, registro de responsabilidade técnica ou permissões para o exercício das atividades da pessoa jurídica e os órgãos responsáveis pelas respectivas emissões',
  '7.3':
    'É esperado obter (ou alterar ou renovar) qualquer tipo de autorização, licença, registros ou permissão de órgãos governamentais e/ou junto a agente público e/ou pessoa politicamente exposta em decorrência do objeto contratual',
  '7.4':
    'É esperado qualquer tipo de interação com órgão governamental e/ou agente público e/ou pessoal politicamente exposta em em decorrência do objeto contratual?',
  '7.5':
    'Informar se é esperado agenciamento, corretagem, intermediação e todas as atividades que importem representação de Suape perante quaisquer terceiros, sejam eles pessoas físicas ou jurídicas, Agentes Públicos, Pessoas Politicamente em decorrência do objeto contratual.',
  '7.6':
    'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta?',
  '7.7':
    'Algum familiar do sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta?',
  '7.8':
    'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é familiar de alguma Pessoa com Influência Relevante da Empresa Suape?',
  '7.9':
    'Alguma pessoa, entidade, governo ou agência de governo possui algum direito de gestão ou interesse financeiro ou societário nos negócios da empresa?',
  '8.2':
    'A pessoa jurídica possui um Código de Ética que abranja questões de ética profissional e empresarial, política anticorrupção, que proíba e condene o pagamento de comissões, propina ou qualquer outra forma de suborno ou vantagem indevidas a Agentes Públicos; ou documento similar que almeje esses propósitos?',
  '8.7':
    'Os membros da alta administração participaram de ações de capacitação (treinamento, palestra, congresso, cursos, etc) referente à cultura de integridade?',
  '9.0':
    'A sociedade possui um profissional ou órgão colegiado responsável por um programa ou políticas anticorrupção? (Ex.: Compliance Officer, Diretor de Compliance ou Equivalente)',
  conselho:
    'O fornecimento de bens, a prestação de serviços e a execução de obras e serviços de engenharia, cujas obrigações tenham sido autorizadas por alçada do Conselho de Administração?',
};

// Textos oficiais do Plano de Ação da planilha "Avaliação de Integridade - xx.xlsx" (Células O48, P48, Q48, R48)
export const SUAPE_OFFICIAL_ACTIONS: Record<SuapeCalculatedRisk, string> = {
  'Muito Alto':
    'RISCO MUITO ALTO\nI. Diretor Executivo da área demandante deverá assinar a Declaração de Gestão de Contratos com Terceiros de Risco;\nII. Possibilidade de solicitar trabalho da Auditoria Interna para fiscalização de contrato em vigor com terceiro;\nIII. Prover treinamento e orientação para o gestor do contrato e os respectivos fiscais, em relação ao risco apresentado por este terceiro e os procedimentos adequados para detecção de fraude e corrupção;\nIV. Incluir Terceiro no Mapa de Risco de Terceiros;\nV. Arquivamento do Formulário de Diligência de SUAPE; ',
  'Alto':
    'RISCO ALTO\nI. Diretor Executivo da área demandante deverá assinar a Declaração de Gestão de Contratos com Terceiros de Risco;\nII.Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação;\nIII. Possibilidade de solicitar trabalho da Auditoria Interna para fiscalização de contrato em vigor com terceiro;\nIV. Incluir Terceiro no Mapa de Risco de Terceiros;\nV. Arquivamento do Formulário de Diligência de SUAPE; ',
  'Médio':
    'RISCO MÉDIO\nI. Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação;\nII. Incluir Terceiro no Mapa de Risco de Terceiros\nIII. Arquivamento do Formulário de Diligência de SUAPE.',
  'Baixo':
    'RISCO BAIXO\nI. Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação;\nII. Incluir Terceiro no Mapa de Risco de Terceiros\nIII. Arquivamento do Formulário de Diligência de SUAPE.',
};

/**
 * Função explícita para o cálculo de N23:
 * Linhas 23 e 24 da planilha oficial:
 * =OR(L23="X", L24="X")
 * L23 = Item 4.4 (Corrupção PJ)
 * L24 = Item 5.2 (Crimes Sócios)
 * + Bases oficiais de sanções: CEIS, CNEP, TCE-PE (Inidôneos), MTE Trabalho Escravo
 */
export function calculateN23(
  diligence: DiligenceItem,
  answers?: Partial<IntegrityAnswers>
): { n23: boolean; active: boolean; reasons: string[]; mteMatch?: SuapeIntegrityEvaluationResult['mteMatch'] } {
  const reasons: string[] = [];
  let mteMatch: SuapeIntegrityEvaluationResult['mteMatch'] | undefined;

  const cnpjClean = (diligence.cnpj || '').replace(/\D/g, '');

  // 1. Bases oficiais do Ministério do Trabalho e Emprego (MTE)
  if (cnpjClean) {
    const teRecord = mteSanctionsData.trabalhoEscravo.find((r) => r.cnpjClean === cnpjClean);
    if (teRecord) {
      mteMatch = {
        tipo: 'trabalho_escravo',
        detalhes: `Consta no Cadastro de Empregadores do MTE (Trabalho Escravo): ${teRecord.nome}`,
      };
      reasons.push('Inclusão no Cadastro de Empregadores de Trabalho Escravo do MTE');
    }
  }

  // 2. CEIS e CNEP (Portal da Transparência / CGU)
  const ceisCount = diligence.ceis?.registros?.length || 0;
  const cnepCount = diligence.cnep?.registros?.length || 0;
  if (ceisCount > 0 || cnepCount > 0) {
    reasons.push(`Consta sanção ativa no CEIS/CNEP em nome da pessoa jurídica (Item 4.4).`);
  }

  // 3. TCE-PE (Inidôneos / Controle Externo)
  const tcePeIrregular =
    (diligence.tcePe as any)?.inidoneo ||
    (diligence.tcePe?.resumo && (diligence.tcePe.resumo.resultadosIrregulares || 0) > 0);
  if (tcePeIrregular) {
    reasons.push(`Declaração de inidoneidade/irregularidade ativa no Tribunal de Contas de Pernambuco (TCE-PE).`);
  }

  // 4. Resposta oficial do Item 4.4 (Condenação por corrupção/fraude a licitações)
  if (answers?.['4.4'] === true) {
    reasons.push(`Item 4.4: Pessoa jurídica ou partes relacionadas condenadas por corrupção ou fraude a licitações.`);
  }

  // 5. Resposta oficial do Item 5.2 (Crimes/investigações de sócios por corrupção/fraude)
  if (answers?.['5.2'] === true) {
    reasons.push(`Item 5.2: Sócios com condenações ou investigações criminais por corrupção ou fraude.`);
  }

  const active = reasons.length > 0;
  return {
    n23: active,
    active,
    reasons,
    mteMatch,
  };
}

/**
 * Função explícita para o cálculo de N40:
 * Linha 40 da planilha oficial:
 * =IF(L40="X", TRUE(), FALSE())
 * L40 = Fornecimento de bens/serviços/obras autorizadas por alçada do Conselho de Administração
 * Regra formal: Contrato com valor >= R$ 10.000.000,00 ou autorização explícita do Conselho.
 * Proibido ativar por mera presença da palavra no PDF!
 */
export function calculateN40(
  contractValue: number = 0,
  answers?: Partial<IntegrityAnswers>
): { n40: boolean; active: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const isOver10Million = typeof contractValue === 'number' && contractValue >= 10000000;
  const councilExplicit = answers?.alcadaConselho === true;

  if (councilExplicit) {
    reasons.push(`Obrigações contratuais autorizadas por alçada do Conselho de Administração.`);
  } else if (isOver10Million) {
    reasons.push(`Valor do contrato (R$ ${contractValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) atinge a alçada do Conselho de Administração (>= R$ 10M).`);
  }

  const active = reasons.length > 0;
  return {
    n40: active,
    active,
    reasons,
  };
}

/**
 * Função explícita para o cálculo de N28:
 * Linhas 28, 30, 31, 32, 33, 34, 35, 36 da planilha oficial:
 * =OR(L28="X", L30="X", L31="X", L32="X", L33="X", L34="X", L35="X", L36="X")
 * L28 = 7.1 Atividade regulada
 * L30 = 7.3 Licenças contratuais perante órgãos públicos/PEP
 * L31 = 7.4 Interação com órgão público/PEP
 * L32 = 7.5 Agenciamento/intermediação/representação de Suape
 * L33 = 7.6 PEP sócio ou administrador
 * L34 = 7.7 Familiar PEP
 * L35 = 7.8 Parentesco com pessoas de influência em Suape
 * L36 = 7.9 Participação governamental na empresa
 * PROIBIDO inferir por CNAE, S.A. ou palavras soltas! Somente respostas confirmadas.
 */
export function calculateN28(
  diligence: DiligenceItem,
  answers?: Partial<IntegrityAnswers>
): { n28: boolean; active: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (answers?.['7.1'] === true) reasons.push(SUAPE_QUESTION_TEXTS['7.1']);
  if (answers?.['7.3'] === true) reasons.push(SUAPE_QUESTION_TEXTS['7.3']);
  if (answers?.['7.4'] === true) reasons.push(SUAPE_QUESTION_TEXTS['7.4']);
  if (answers?.['7.5'] === true) reasons.push(SUAPE_QUESTION_TEXTS['7.5']);

  // 7.6: PEP sócio/administrador (via questionário ou base PEP oficial confirmada)
  const confirmedPep = Array.isArray(diligence.pepResults) && diligence.pepResults.some((p) => p.encontrado);
  if (answers?.['7.6'] === true) {
    reasons.push(SUAPE_QUESTION_TEXTS['7.6']);
  } else if (answers?.['7.6'] === undefined && confirmedPep) {
    reasons.push(`Identificado sócio ou administrador enquadrado como Pessoa Politicamente Exposta (PEP) (Item 7.6).`);
  }

  if (answers?.['7.7'] === true) reasons.push(SUAPE_QUESTION_TEXTS['7.7']);
  if (answers?.['7.8'] === true) reasons.push(SUAPE_QUESTION_TEXTS['7.8']);
  if (answers?.['7.9'] === true) reasons.push(SUAPE_QUESTION_TEXTS['7.9']);

  const active = reasons.length > 0;
  return {
    n28: active,
    active,
    reasons,
  };
}

/**
 * Função explícita para o cálculo de N29:
 * Linha 29 da planilha oficial:
 * =OR(L29="X")
 * L29 = 7.2 Licenças ordinárias / autorizações / ART / RRT
 * PROIBIDO inferir por CNAE ou natureza jurídica!
 */
export function calculateN29(
  answers?: Partial<IntegrityAnswers>
): { n29: boolean; active: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (answers?.['7.2'] === true) {
    reasons.push(SUAPE_QUESTION_TEXTS['7.2']);
  }

  const active = reasons.length > 0;
  return {
    n29: active,
    active,
    reasons,
  };
}

/**
 * Avalia a integridade da empresa e calcula o risco rigorosamente pelas
 * fórmulas da planilha oficial de SUAPE ("Avaliação de Integridade - xx.xlsx").
 * Célula J16: =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))
 */
export function evaluateSuapeIntegrity(
  diligence: DiligenceItem,
  contractValue: number = 0,
  answers: Partial<IntegrityAnswers> = {}
): SuapeIntegrityEvaluationResult {
  // 1. Identificar itens não respondidos / não identificados
  const requiredKeys: Array<keyof IntegrityAnswers> = [
    '4.4', '5.2', '7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9',
  ];
  const unidentifiedItems: string[] = [];
  for (const k of requiredKeys) {
    if (answers[k] === null || answers[k] === undefined) {
      unidentifiedItems.push(k);
    }
  }

  // 2. Executar cálculos isolados de cada célula da planilha oficial
  const { n23, reasons: n23Reasons, mteMatch } = calculateN23(diligence, answers);
  const { n40, reasons: n40Reasons } = calculateN40(contractValue, answers);
  const { n28, reasons: n28Reasons } = calculateN28(diligence, answers);
  const { n29, reasons: n29Reasons } = calculateN29(answers);

  // 3. Aplicação fiel da fórmula oficial da Célula J16:
  // =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))
  // IMPORTANTE: N40 gera "Muito Alto" exatamente como N23!
  let calculatedRisk: SuapeCalculatedRisk;
  if (n23 || n40) {
    calculatedRisk = 'Muito Alto';
  } else if (n28) {
    calculatedRisk = 'Alto';
  } else if (n29) {
    calculatedRisk = 'Médio';
  } else {
    calculatedRisk = 'Baixo';
  }

  const riskDisplay = `Risco ${calculatedRisk}`;
  const formulaUsed = '=IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))';
  const recommendedAction = SUAPE_OFFICIAL_ACTIONS[calculatedRisk];

  // Atribui fatores de risco para as colunas oficiais do Mapa de Risco
  // Coluna 14: RISCO 1
  let fatorRisco1 = '';
  if (n23 && n23Reasons.length > 0) {
    fatorRisco1 = n23Reasons[0];
  } else if (n40 && n40Reasons.length > 0) {
    fatorRisco1 = SUAPE_QUESTION_TEXTS['conselho'];
  } else if (n28 && n28Reasons.length > 0) {
    // Preferência histórica para 7.3 no Risco 1 se ativo, senão o primeiro motivo
    fatorRisco1 = answers['7.3'] ? SUAPE_QUESTION_TEXTS['7.3'] : n28Reasons[0];
  } else if (n29 && n29Reasons.length > 0) {
    fatorRisco1 = n29Reasons[0];
  }

  // Coluna 15: RISCO 2
  let fatorRisco2 = '';
  const remainingN28 = n28Reasons.filter((r) => r !== fatorRisco1);
  if (remainingN28.length > 0) {
    fatorRisco2 = remainingN28[0];
  }

  // Coluna 17: RISCO 4 (Item 7.2 licenças ordinárias na planilha oficial)
  let fatorRisco4 = '';
  if (n29 && n29Reasons.length > 0) {
    fatorRisco4 = n29Reasons[0];
  }

  return {
    n23,
    n40,
    n28,
    n29,
    unidentifiedItems,
    calculatedRisk,
    riskDisplay,
    formulaUsed,
    recommendedAction,
    triggers: {
      n23Reasons,
      n40Reasons,
      n28Reasons,
      n29Reasons,
    },
    fatorRisco1,
    fatorRisco2,
    fatorRisco4,
    mteMatch,
  };
}

// ==========================================================
// SCHEMA CANÔNICO DAS 40 COLUNAS DO MAPA DE RISCO DE TERCEIROS
// Conferido diretamente com o cabeçalho da planilha oficial
// "Mapa de Risco (1).xlsx", aba "Mapa de Risco", Linha 2 (A2:AN2).
// ==========================================================
export interface RiskMapColumnDefinition {
  index: number; // 1 a 40
  letter: string; // A a AN
  header: string; // Título exato da célula do Excel
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
  { index: 28, letter: 'AB', header: 'POSSUI PROFISSIONAL RESPONSÁVEL POR UM PROGRAMA OU POLÍTICA ANTICORRUPÇÃO?', key: 'profissionalAnticorrupcao' },
  { index: 29, letter: 'AC', header: 'NOTA ORIENTATIVA', key: 'notaOrientativa' },
  { index: 30, letter: 'AD', header: 'RECOMENDAÇÕES', key: 'recomendacoes' },
  { index: 31, letter: 'AE', header: 'DECLARAÇÃO DE GESTÃO DE CONTRATOS COM TERCEIROS DE RISCO ALTO ASSINADA?', key: 'declaracaoAssinada' },
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
  area?: string;
  dataInicio?: string;
  dataFim?: string;
  dias?: string | number;
  diretoriaDemandante?: string;
  analistaResponsavel?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  valorContrato?: number | string;
  notaTecnica?: string;
  processoSei?: string;
  declaracaoAssinada?: string; // 'Sim', 'Não', ''
  customFatorRisco1?: string;
  customFatorRisco2?: string;
  customFatorRisco4?: string;
  customPlanoAcao?: string;
  answers?: Partial<IntegrityAnswers>;
  customEvaluation?: SuapeIntegrityEvaluationResult;
}

export interface RiskMapRowOutput {
  rawLine: string; // Exatamente 40 colunas separadas por \t
  columns: Array<{ index: number; letter: string; name: string; key: string; value: string }>;
  evaluation: SuapeIntegrityEvaluationResult;
}

/**
 * Gera a linha exata de 40 colunas separada por TAB (\t)
 * pronta para copiar e colar com Ctrl+V na planilha do Mapa de Risco de Terceiros de SUAPE.
 */
export function generateRiskMapRow(
  diligence: DiligenceItem,
  params: RiskMapRowParams = {}
): RiskMapRowOutput {
  // Converte valor numérico do contrato
  const numValue =
    typeof params.valorContrato === 'number'
      ? params.valorContrato
      : parseFloat(String(params.valorContrato || '0').replace(/[^\d,-]/g, '').replace(',', '.')) || 0;

  // Executa avaliação de integridade pelas fórmulas oficiais
  const evaluation =
    params.customEvaluation ||
    evaluateSuapeIntegrity(diligence, numValue, params.answers);

  // Formatação de datas
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const formatDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  const defaultDataInicio = formatDate(yesterday);
  const defaultDataFim = formatDate(now);

  const valorFormatado =
    typeof params.valorContrato === 'string' && params.valorContrato.includes('R$')
      ? params.valorContrato
      : numValue > 0
        ? ` R$  ${numValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `
        : (params.valorContrato ? String(params.valorContrato) : '');

  // Respostas reais às perguntas de governança (Colunas 26, 27, 28)
  // PROIBIDO hardcode de "Sim": deve vir da resposta real, senão vazio
  const formatAnswer = (ans?: QuestionnaireAnswer): string => {
    if (ans === true) return 'Sim';
    if (ans === false) return 'Não';
    return '';
  };

  const col26Value = formatAnswer(params.answers?.['8.2']);
  const col27Value = formatAnswer(params.answers?.['8.7']);
  const col28Value = formatAnswer(params.answers?.['9.0']);

  // Coluna 31: Declaração de Gestão de Contratos de Risco Assinada
  // Se for risco Alto/Muito Alto e não houver override manual, pode indicar 'Sim' se formalizado ou manual
  const declaracaoAssinadaVal =
    params.declaracaoAssinada !== undefined
      ? params.declaracaoAssinada
      : (evaluation.calculatedRisk === 'Alto' || evaluation.calculatedRisk === 'Muito Alto')
        ? 'Sim'
        : '';

  // Mapeamento de valor por chave do schema canônico
  const columnValueMap: Record<string, string> = {
    id: params.id !== undefined && params.id !== null && params.id !== '' ? String(params.id) : '',
    ano: String(params.ano || now.getFullYear()),
    responsavel: params.area || 'Compliance',
    dataEntrada: params.dataInicio || defaultDataInicio,
    dataSaida: params.dataFim || defaultDataFim,
    tempoDecorrido: params.dias !== undefined && params.dias !== '' ? String(params.dias) : '1',
    diretoria: params.diretoriaDemandante || '',
    gestor: params.analistaResponsavel || '',
    empresa: params.razaoSocial || diligence.razaoSocial || '',
    totalConsultas: '',
    cnpj: params.cnpj || diligence.cnpjFmt || diligence.cnpj || '',
    valor: valorFormatado,
    classificacao: evaluation.riskDisplay,
    risco1: params.customFatorRisco1 || evaluation.fatorRisco1,
    risco2: params.customFatorRisco2 || evaluation.fatorRisco2,
    risco3: '',
    risco4: params.customFatorRisco4 || evaluation.fatorRisco4,
    risco5: '',
    risco6: '',
    risco7: '',
    risco8: '',
    risco9: '',
    risco10: '',
    risco11: '',
    risco12: '',
    codigoConduta: col26Value,
    treinamentoGestao: col27Value,
    profissionalAnticorrupcao: col28Value,
    notaOrientativa: params.notaTecnica || '',
    recomendacoes: params.customPlanoAcao || evaluation.recommendedAction,
    declaracaoAssinada: declaracaoAssinadaVal,
    documentoControle: params.processoSei ? (params.processoSei.startsWith('SEI:') ? params.processoSei : `SEI: ${params.processoSei}`) : '',
    gestorTreinado: '',
    observacoes: '',
    anoEntrada: '',
    anoSaida: '',
    entrada: '',
    saida: '',
    seiContratacao: '',
    numeroContrato: '',
  };

  const columns = RISK_MAP_COLUMNS_SCHEMA.map((colDef) => ({
    index: colDef.index,
    letter: colDef.letter,
    name: colDef.header,
    key: colDef.key,
    value: columnValueMap[colDef.key] ?? '',
  }));

  const rawLine = columns.map((c) => c.value).join('\t');

  return {
    rawLine,
    columns,
    evaluation,
  };
}
