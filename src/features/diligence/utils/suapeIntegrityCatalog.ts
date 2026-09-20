// ==========================================================
// DILIGÊNCIA 360 — Catálogo Oficial da Integridade SUAPE
//
// Todo texto deste arquivo foi extraído literalmente das planilhas
// oficiais, não redigido por aproximação:
//
//  - "Avaliação de Integridade - xx.xlsx" (v4, 24/02/2026)
//      aba "Avaliação de Integridade": J16, N23, N28, N29, N40, B48,
//      O48:R48 (planos de ação) e T53:V57 (tabela de critérios);
//      aba "CheckList": enunciados e pesos da maturidade (R187:R231).
//  - "Mapa de Risco (1).xlsx"
//      aba "Apoio": catálogo Risco 1..12 (L10:O21), diretorias (J2:J9)
//      e recomendações (O2:O4);
//      aba "Mapa de Risco": cabeçalho A2:AN2 das 40 colunas.
//
// Quem alterar um texto daqui precisa conferir contra a planilha: a
// linha colada no Mapa de Risco tem que casar com o que já está lá.
// ==========================================================

/**
 * Resposta oficial tri-state. `null` significa "não identificado" e nunca
 * pode ser tratado como "Não" — a planilha só dispara gatilho com "X"
 * explícito, e assumir ausência de resposta como negativa produziria
 * falso negativo, que neste sistema é defeito grave.
 */
export type QuestionnaireAnswer = boolean | null;

export type SuapeCalculatedRisk = 'Muito Alto' | 'Alto' | 'Médio' | 'Baixo';

/** Chaves dos itens do Questionário de Diligência que alimentam a avaliação. */
export type SuapeIntegrityItemKey =
  | '4.4'
  | '5.2'
  | '7.1'
  | '7.2'
  | '7.3'
  | '7.4'
  | '7.5'
  | '7.6'
  | '7.7'
  | '7.8'
  | '7.9'
  | 'alcadaConselho';

/** Itens do bloco 8/9 que compõem a maturidade do programa de integridade. */
export type SuapeMaturityItemKey =
  | '8.1'
  | '8.2'
  | '8.3'
  | '8.4'
  | '8.5'
  | '8.6'
  | '8.7'
  | '8.8'
  | '8.9'
  | '9.0';

/** Os 8 cadastros do item 9.2 do CheckList (linhas 231 a 238). */
export type SuapeRegistryKey =
  | 'ceis'
  | 'cnep'
  | 'cepim'
  | 'improbidadeCnj'
  | 'tcu'
  | 'tcePe'
  | 'trabalhoEscravo'
  | 'decisoesAdversas';

// ==========================================================
// 1. ENUNCIADOS DO QUESTIONÁRIO (aba CheckList)
// ==========================================================

export const SUAPE_QUESTION_TEXTS: Record<SuapeIntegrityItemKey, string> = {
  '4.4':
    'Informar se a pessoa jurídica e/ou partes relatas já foi condenada administrativa ou civilmente por atos de corrupção e/ou fraude a licitações e contratos administrativos.',
  '5.2':
    'Informar se houve condenações criminais, processos criminais ou investigações criminais relacionadas aos sócios por atos de corrupção e/ou fraude a licitações e contratos administrativo:',
  '7.1':
    'A pessoa jurídica exerce uma atividade regulada? Exemplos: Atividade junto à SUSEP, ANEEL, ANATEL, ANP, ARPE, ANTAQ, ANAC, entre outros.',
  '7.2':
    'Informar se são necessárias autorizações, licenças, anotações de responsabilidade técnica, registro de responsabilidade técnica ou permissões para o exercício das atividades da pessoa jurídica e os órgãos responsáveis pelas respectivas emissões.',
  '7.3':
    'É esperado obter (ou alterar ou renovar) qualquer tipo de autorização, licença, registros ou permissão de órgãos governamentais e/ou junto a agente público e/ou pessoa politicamente exposta em decorrência do objeto contratual?',
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
  alcadaConselho:
    'O fornecimento de bens, a prestação de serviços e a execução de obras e serviços de engenharia, cujas obrigações tenham sido autorizadas por alçada do Conselho de Administração?',
};

/** Valor a partir do qual a contratação cai na alçada do Conselho (célula O40). */
export const SUAPE_ALCADA_CONSELHO_VALOR = 10_000_000;

// ==========================================================
// 2. CATÁLOGO DOS 12 RISCOS DO MAPA (aba Apoio, L10:O21)
//
// Cada risco ocupa uma COLUNA FIXA do Mapa de Risco: Risco N sempre na
// coluna 13+N. Não é "primeiro risco encontrado, segundo risco
// encontrado" — conferido contra as 555 linhas já preenchidas da
// planilha, onde 96% das ocorrências respeitam essa posição.
//
// O texto aqui é o da aba Apoio (o que o Mapa usa), que difere em
// pontuação do enunciado do CheckList acima. Colar o texto do
// CheckList quebraria a validação de dados da coluna.
// ==========================================================

export interface SuapeRiskCatalogEntry {
  /** Posição fixa 1..12; a coluna do Mapa é 13 + slot. */
  slot: number;
  /** Item do questionário que dispara este risco. */
  item: SuapeIntegrityItemKey;
  /** Texto exato colado na coluna RISCO n. */
  text: string;
  /** Classificação que este risco isoladamente representa. */
  classification: SuapeCalculatedRisk;
}

export const SUAPE_RISK_CATALOG: SuapeRiskCatalogEntry[] = [
  {
    slot: 1,
    item: '7.3',
    classification: 'Alto',
    text: 'É esperado obter (ou alterar ou renovar) qualquer tipo de autorização, licença, registros ou permissão de órgãos governamentais e/ou junto a agente público e/ou pessoa politicamente exposta em decorrência do objeto contratual',
  },
  {
    slot: 2,
    item: '7.4',
    classification: 'Alto',
    text: 'É esperado qualquer tipo de interação com órgão governamental e/ou agente público e/ou pessoal politicamente exposta em em decorrência do objeto contratual',
  },
  {
    slot: 3,
    item: '7.5',
    classification: 'Alto',
    text: 'É esperado agenciamento, corretagem, intermediação e todas as atividades que importem representação de Suape perante quaisquer terceiros, sejam eles pessoas físicas ou jurídicas, Agentes Públicos, Pessoas Politicamente em decorrência do objeto contratual',
  },
  {
    slot: 4,
    item: 'alcadaConselho',
    classification: 'Alto',
    text: 'Contratação cujas obrigações tenham sido autorizadas por alçada do Conselho de Administração',
  },
  {
    slot: 5,
    item: '4.4',
    classification: 'Muito Alto',
    text: 'Pessoa jurídica e/ou partes relatas já foi condenada administrativa ou civilmente por atos de corrupção e/ou fraude a licitações e contratos administrativos',
  },
  {
    slot: 6,
    item: '5.2',
    classification: 'Muito Alto',
    text: 'Houve condenações criminais, processos criminais ou investigações criminais relacionadas aos sócios por atos de corrupção e/ou fraude a licitações e contratos administrativo',
  },
  {
    slot: 7,
    item: '7.6',
    classification: 'Alto',
    text: 'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta',
  },
  {
    slot: 8,
    item: '7.7',
    classification: 'Alto',
    text: 'Algum familiar do sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta',
  },
  {
    slot: 9,
    item: '7.8',
    classification: 'Alto',
    text: 'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é familiar de alguma Pessoa com Influência Relevante da Empresa Suape',
  },
  {
    slot: 10,
    item: '7.9',
    classification: 'Alto',
    text: 'Alguma pessoa, entidade, governo ou agência de governo possui algum direito de gestão ou interesse financeiro ou societário nos negócios da empresa',
  },
  {
    slot: 11,
    item: '7.1',
    classification: 'Alto',
    text: 'A pessoa jurídica exerce uma atividade regulada? Exemplos: Atividade junto à SUSEP, ANEEL, ANATEL, ANP, ARPE, ANTAQ, ANAC, entre outros',
  },
  {
    slot: 12,
    item: '7.2',
    classification: 'Médio',
    text: 'São necessárias autorizações, licenças, anotações de responsabilidade técnica, registro de responsabilidade técnica ou permissões para o exercício das atividades da pessoa jurídica e os órgãos responsáveis pelas respectivas emissões',
  },
];

export const SUAPE_RISK_BY_ITEM: Record<SuapeIntegrityItemKey, SuapeRiskCatalogEntry> =
  SUAPE_RISK_CATALOG.reduce(
    (acc, entry) => {
      acc[entry.item] = entry;
      return acc;
    },
    {} as Record<SuapeIntegrityItemKey, SuapeRiskCatalogEntry>
  );

// ==========================================================
// 3. PLANOS DE AÇÃO
// ==========================================================

/**
 * Célula B48 do Formulário de Diligência: texto integral, que vai para o
 * formulário e para o dossiê — não para o Mapa de Risco.
 */
export const SUAPE_OFFICIAL_ACTIONS: Record<SuapeCalculatedRisk, string> = {
  'Muito Alto':
    'RISCO MUITO ALTO\nI. Diretor Executivo da área demandante deverá assinar a Declaração de Gestão de Contratos com Terceiros de Risco;\nII. Possibilidade de solicitar trabalho da Auditoria Interna para fiscalização de contrato em vigor com terceiro;\nIII. Prover treinamento e orientação para o gestor do contrato e os respectivos fiscais, em relação ao risco apresentado por este terceiro e os procedimentos adequados para detecção de fraude e corrupção;\nIV. Incluir Terceiro no Mapa de Risco de Terceiros;\nV. Arquivamento do Formulário de Diligência de SUAPE; ',
  Alto:
    'RISCO ALTO\nI. Diretor Executivo da área demandante deverá assinar a Declaração de Gestão de Contratos com Terceiros de Risco;\nII.Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação;\nIII. Possibilidade de solicitar trabalho da Auditoria Interna para fiscalização de contrato em vigor com terceiro;\nIV. Incluir Terceiro no Mapa de Risco de Terceiros;\nV. Arquivamento do Formulário de Diligência de SUAPE; ',
  'Médio':
    'RISCO MÉDIO\nI. Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação;\nII. Incluir Terceiro no Mapa de Risco de Terceiros\nIII. Arquivamento do Formulário de Diligência de SUAPE.',
  Baixo:
    'RISCO BAIXO\nI. Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação;\nII. Incluir Terceiro no Mapa de Risco de Terceiros\nIII. Arquivamento do Formulário de Diligência de SUAPE.',
};

/**
 * Coluna RECOMENDAÇÕES do Mapa de Risco (aba Apoio, O2:O4). O Mapa usa a
 * frase curta, não o plano integral do formulário — despejar B48 aqui
 * deixaria a célula com cinco parágrafos onde o histórico tem uma linha.
 */
export const SUAPE_RISK_MAP_RECOMMENDATIONS: Record<SuapeCalculatedRisk, string> = {
  'Muito Alto':
    'Diretor da Área demandante assinar a Declaração de Gestão de Contratos com Terceiros  de Risco Alto e Treinamento para Gestor e Diretor. ',
  Alto:
    'Diretor da Área demandante assinar a Declaração de Gestão de Contratos com Terceiros  de Risco Alto e Treinamento para Gestor e Diretor. ',
  'Médio': 'Comunicar ao Gestor e Arquivar Processo',
  Baixo: 'Comunicar ao Gestor e Arquivar Processo',
};

/**
 * Coluna "DECLARAÇÃO DE GESTÃO DE CONTRATOS COM TERCEIROS DE RISCO ALTO
 * ASSINADA?". Só faz sentido em Alto/Muito Alto; nos demais o histórico
 * registra "Não se aplica". Se a declaração foi de fato assinada, quem
 * sabe é o analista — o sistema não inventa "Sim".
 */
export const SUAPE_DECLARACAO_NAO_APLICAVEL = 'Não se aplica';

// ==========================================================
// 4. VOCABULÁRIOS DO MAPA
// ==========================================================

/**
 * Diretorias que aparecem no Mapa de Risco (aba Apoio, J2:J9), em ordem
 * de frequência nas 555 linhas já registradas.
 */
export const SUAPE_DIRETORIAS = ['DP', 'DINFRA', 'DSI', 'DGP', 'DAF', 'DGI', 'DJUR', 'DRIG'];

/** Coluna RESPONSÁVEL: quem conduz a diligência hoje. */
export const SUAPE_RESPONSAVEL_PADRAO = 'Compliance';

// ==========================================================
// 5. MATURIDADE DO PROGRAMA DE INTEGRIDADE (bloco 04)
//
// L44 = SOMA(R187;R191;R195;R199;R203;R207;R211;R215;R219;R223;R231)/25
// Cada R* vale o peso do item quando a resposta é "Sim"; R231 é a fração
// dos 8 cadastros do item 9.2 em que a empresa NÃO consta.
// M44 = SE(L44>0,74;"Baixo";SE(L44>0,49;"Médio";SE(L44>0,24;"Alto";"Muito Alto")))
// ==========================================================

export interface SuapeMaturityItem {
  key: SuapeMaturityItemKey;
  weight: number;
  text: string;
}

export const SUAPE_MATURITY_ITEMS: SuapeMaturityItem[] = [
  {
    key: '8.1',
    weight: 5,
    text: 'A pessoa jurídica possui um Programa de Integridade estruturado com o objetivo de detectar e sanar desvios, fraudes, corrupção, irregularidades e atos ilícitos praticados?',
  },
  {
    key: '8.2',
    weight: 5,
    text: 'A pessoa jurídica possui um Código de Ética que abranja questões de ética profissional e empresarial, política anticorrupção, que proíba e condene o pagamento de comissões, propina ou qualquer outra forma de suborno ou vantagem indevidas a Agentes Públicos; ou documento similar que almeje esses propósitos?',
  },
  {
    key: '8.3',
    weight: 1,
    text: 'Os documentos mencionados nos itens 8.1 e 8.2 mencionam a possibilidade de aplicação de sanções para aqueles que cometerem violações independentemente do cargo ou função ocupada pelo infrator?',
  },
  {
    key: '8.4',
    weight: 1,
    text: 'Os documentos mencionados nos itens 8.1 e 8.2 tratam do oferecimento de presentes, brindes e hospitalidades (refeições, entretenimento, viagem e hospedagem) a agentes públicos?',
  },
  {
    key: '8.5',
    weight: 1,
    text: 'Os documentos mencionados nos itens 8.1 e 8.2 tratam da prevenção de conflito de interesses, inclusive nas relações com a Administração Pública e seus agentes?',
  },
  {
    key: '8.6',
    weight: 1,
    text: 'Nos documentos mencionados nos itens 8.1 e 8.2 há orientações quanto ao acompanhamento da execução dos contratos celebrados com a Administração Pública?',
  },
  {
    key: '8.7',
    weight: 5,
    text: 'Os membros da alta administração participaram de ações de capacitação (treinamento, palestra, congresso, cursos, etc) referente à cultura de integridade?',
  },
  {
    key: '8.8',
    weight: 1,
    text: 'Existe plano de comunicação e plano de treinamento relacionados ao programa de integridade?',
  },
  {
    key: '8.9',
    weight: 1,
    text: 'Existem controles para verificar a participação dos empregados nos treinamentos?',
  },
  {
    key: '9.0',
    weight: 3,
    text: 'A sociedade possui um profissional ou órgão colegiado responsável por um programa ou políticas anticorrupção? (Ex.: Compliance Officer, Diretor de Compliance ou Equivalente)',
  },
];

/** Peso do bloco de cadastros (R231): vale no máximo 1 ponto dos 25. */
export const SUAPE_REGISTRY_BLOCK_WEIGHT = 1;

export const SUAPE_MATURITY_TOTAL_WEIGHT =
  SUAPE_MATURITY_ITEMS.reduce((sum, item) => sum + item.weight, 0) + SUAPE_REGISTRY_BLOCK_WEIGHT;

export interface SuapeRegistryEntry {
  key: SuapeRegistryKey;
  text: string;
  /** Endereço oficial de consulta, da planilha "Cadastros e banco de dados". */
  url?: string;
}

export const SUAPE_REGISTRIES: SuapeRegistryEntry[] = [
  {
    key: 'ceis',
    text: 'Cadastro Nacional de Empresas Inidôneas e Suspensas (CEIS)',
    url: 'https://portaldatransparencia.gov.br/sancoes/consulta?cadastro=1',
  },
  {
    key: 'cnep',
    text: 'Cadastro Nacional de Empresas Punidas (CNEP)',
    url: 'https://portaldatransparencia.gov.br/sancoes/consulta?cadastro=2',
  },
  {
    key: 'cepim',
    text: 'Cadastro de Entidades Privadas Sem Fins Lucrativos Impedidas (CEPIM)',
    url: 'https://portaldatransparencia.gov.br/sancoes/consulta?cadastro=3',
  },
  {
    key: 'improbidadeCnj',
    text: 'Cadastro Nacional de Condenações Cíveis por Atos de Improbidade Administrativa do Conselho Nacional de Justiça',
    url: 'https://www.cnj.jus.br/improbidade_adm/consultar_requerido.php',
  },
  {
    key: 'tcu',
    text: 'Relação de Inabilitados e Inidôneos do Tribunal de Contas da União',
    url: 'https://certidoes.apps.tcu.gov.br/',
  },
  {
    key: 'tcePe',
    text: 'Relação de Inabilitados e Inidôneos do Tribunal de Contas do Estado de Pernambuco e da Secretaria da Controladoria Geral de Pernambuco',
    url: 'https://www.tce.pe.gov.br/internet/index.php/declaracao-de-inidoneidade',
  },
  {
    key: 'trabalhoEscravo',
    text: 'Cadastro de Empregadores que tenham submetido trabalhadores a condições análogas às de escravo do Ministério do Trabalho e Emprego',
    url: 'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/combate-ao-trabalho-escravo-e-degradante',
  },
  {
    key: 'decisoesAdversas',
    text: 'Decisões em desfavor do terceiro em processos administrativos e judiciais, em específico naqueles referentes às infrações presentes neste Programa.',
  },
];

export type SuapeMaturityLevel = 'Baixo' | 'Médio' | 'Alto' | 'Muito Alto';

export interface SuapeMaturityResult {
  /** L44: 0 a 1. `null` quando nenhum item do bloco 8/9 foi respondido. */
  score: number | null;
  /** Percentual apresentável (0 a 100), arredondado. */
  percent: number | null;
  /** M44: risco decorrente da maturidade. */
  level: SuapeMaturityLevel | null;
  pointsEarned: number;
  totalWeight: number;
  /** Itens do bloco 8/9 ainda sem resposta. */
  unanswered: SuapeMaturityItemKey[];
  /** Cadastros em que a empresa consta, reduzindo a nota. */
  registriesHit: SuapeRegistryKey[];
  formulaUsed: string;
}

export const SUAPE_MATURITY_FORMULA =
  '=SOMA(CheckList!R187;R191;R195;R199;R203;R207;R211;R215;R219;R223;R231)/25';

/**
 * Bloco 04 da Avaliação de Integridade. Itens sem resposta não pontuam e
 * ficam listados em `unanswered`, para a tela poder dizer que a nota está
 * incompleta em vez de exibir uma maturidade baixa que é só falta de dado.
 */
export function evaluateIntegrityMaturity(
  maturityAnswers: Partial<Record<SuapeMaturityItemKey, QuestionnaireAnswer>> = {},
  registryHits: Partial<Record<SuapeRegistryKey, boolean>> = {}
): SuapeMaturityResult {
  const unanswered: SuapeMaturityItemKey[] = [];
  let pointsEarned = 0;

  for (const item of SUAPE_MATURITY_ITEMS) {
    const answer = maturityAnswers[item.key];
    if (answer === true) {
      pointsEarned += item.weight;
    } else if (answer !== false) {
      unanswered.push(item.key);
    }
  }

  // R231: fração dos 8 cadastros em que a empresa NÃO consta.
  const registriesHit = SUAPE_REGISTRIES.filter((registry) => registryHits[registry.key] === true).map(
    (registry) => registry.key
  );
  const cleanRegistries = SUAPE_REGISTRIES.length - registriesHit.length;
  pointsEarned += (cleanRegistries / SUAPE_REGISTRIES.length) * SUAPE_REGISTRY_BLOCK_WEIGHT;

  const answeredAny = unanswered.length < SUAPE_MATURITY_ITEMS.length;
  if (!answeredAny) {
    return {
      score: null,
      percent: null,
      level: null,
      pointsEarned,
      totalWeight: SUAPE_MATURITY_TOTAL_WEIGHT,
      unanswered,
      registriesHit,
      formulaUsed: SUAPE_MATURITY_FORMULA,
    };
  }

  const score = pointsEarned / SUAPE_MATURITY_TOTAL_WEIGHT;
  const level: SuapeMaturityLevel =
    score > 0.74 ? 'Baixo' : score > 0.49 ? 'Médio' : score > 0.24 ? 'Alto' : 'Muito Alto';

  return {
    score,
    percent: Math.round(score * 1000) / 10,
    level,
    pointsEarned,
    totalWeight: SUAPE_MATURITY_TOTAL_WEIGHT,
    unanswered,
    registriesHit,
    formulaUsed: SUAPE_MATURITY_FORMULA,
  };
}

// ==========================================================
// 6. DIAS ÚTEIS (coluna "TEMPO DECORRIDO - SEM FIM DE SEMANA E FERIADO")
//
// A aba Apoio traz listas fixas de feriados de 2020 a 2024 e para por
// aí. Em vez de congelar mais um ano, o cálculo deriva o calendário:
// feriados nacionais móveis a partir da Páscoa e os de Ipojuca/PE que
// aparecem naquelas listas.
// ==========================================================

/** Domingo de Páscoa pelo algoritmo de Meeus/Butcher. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Feriados considerados pelo Mapa de Risco: nacionais, mais os
 * municipais de Ipojuca (emancipação, São João e padroeiro São Miguel)
 * e os pontos facultativos que a planilha trata como não úteis.
 */
export function suapeHolidaysForYear(year: number): Set<string> {
  const easter = easterSunday(year);
  const fixed = [
    [0, 1], // Confraternização Universal
    [3, 21], // Tiradentes
    [4, 1], // Dia do Trabalhador
    [2, 30], // Emancipação Política de Ipojuca
    [5, 24], // São João em Ipojuca
    [8, 7], // Independência do Brasil
    [8, 29], // Padroeiro de Ipojuca — São Miguel
    [9, 12], // Nossa Senhora Aparecida
    [9, 28], // Dia do Servidor Público
    [10, 2], // Finados
    [10, 15], // Proclamação da República
    [10, 20], // Consciência Negra
    [11, 25], // Natal
  ];

  const holidays = new Set<string>(
    fixed.map(([month, day]) => dayKey(new Date(Date.UTC(year, month, day))))
  );

  // Móveis, relativos ao Domingo de Páscoa.
  holidays.add(dayKey(addDays(easter, -48))); // Segunda de Carnaval
  holidays.add(dayKey(addDays(easter, -47))); // Terça de Carnaval
  holidays.add(dayKey(addDays(easter, -46))); // Quarta-feira de Cinzas
  holidays.add(dayKey(addDays(easter, -2))); // Paixão de Cristo
  holidays.add(dayKey(addDays(easter, 60))); // Corpus Christi

  return holidays;
}

/**
 * Dias úteis decorridos entre entrada e saída, no critério da planilha:
 * mesma data resulta em 0 e o dia seguinte em 1, ou seja, conta-se o
 * intervalo aberto na entrada e fechado na saída.
 */
export function countSuapeBusinessDays(start: Date, end: Date): number {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const to = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  if (to <= from) return 0;

  const holidaysByYear = new Map<number, Set<string>>();
  const holidaysFor = (year: number) => {
    let set = holidaysByYear.get(year);
    if (!set) {
      set = suapeHolidaysForYear(year);
      holidaysByYear.set(year, set);
    }
    return set;
  };

  let count = 0;
  for (let cursor = addDays(from, 1); cursor <= to; cursor = addDays(cursor, 1)) {
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (holidaysFor(cursor.getUTCFullYear()).has(dayKey(cursor))) continue;
    count += 1;
  }

  return count;
}

/** Converte `DD/MM/AAAA` em Date UTC; devolve `null` para entrada inválida. */
export function parseBrazilianDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}
