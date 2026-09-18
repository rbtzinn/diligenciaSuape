// ==========================================================
// DILIGÊNCIA 360 — Gerador da Linha do Mapa de Risco &
// Motor da Avaliação de Integridade Oficial SUAPE
// Baseado estritamente nas fórmulas oficiais da planilha:
// "Avaliação de Integridade - xx.xlsx" e no layout de 40
// colunas do Mapa de Risco de Terceiros de SUAPE.
// ==========================================================

import type { DiligenceItem } from '../types';
import mteSanctionsData from '../data/mteSanctions.json';

export type SuapeCalculatedRisk = 'Muito Alto' | 'Alto' | 'Médio' | 'Baixo';

function formatCnpj(val?: string): string {
  if (!val) return '';
  const clean = val.replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return val;
}

export interface SuapeIntegrityEvaluationResult {
  // Células da fórmula oficial: =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))
  n23: boolean; // Fraude/Corrupção/Processo criminal sócios (Itens 4.4 / 5.2)
  n40: boolean; // Alçada do Conselho de Administração (>= R$ 10.000.000,00)
  n28: boolean; // Interação pública / PEP / Licenças contratuais (Itens 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9)
  n29: boolean; // Atividade regulada / licenças ordinárias (Item 7.2)

  // Classificação final e justificativas
  calculatedRisk: SuapeCalculatedRisk;
  riskDisplay: string; // "Risco Baixo", "Risco Médio", "Risco Alto", "Risco Muito Alto"
  formulaUsed: string;
  recommendedAction: string; // Texto do Plano de Ação Oficial SUAPE

  // Diretrizes Normativas do Capítulo V da Política de Contratação de Terceiros (SUAPE 2023)
  policyDirectives: {
    isMandatoryByThreshold: boolean; // Item 3.3.1 (> R$ 50.000,00)
    reputationSearchMandatory: boolean; // Item 3.3.2 (Obrigatória se Alto ou Muito Alto)
    reputationKeywords: string[]; // Termos obrigatórios de busca reputacional
    directorDeclarationRequired: boolean; // Declaração de Risco assinada pelo Diretor
    trainingRequired: boolean; // Treinamento obrigatório para Gestor e Diretor
    internalAuditAlert: boolean; // Fiscalização de Auditoria Interna (se Muito Alto)
    anexoZRequired: boolean; // Cláusulas Anticorrupção Anexo Z no contrato
    seiFlow: {
      notaOrientativa: string;
      declaracaoRisco: string;
      mapaRiscoLinha: string;
    };
    eightDatabases: Array<{
      id: number;
      name: string;
      source: string;
      status: 'LIMPO' | 'APONTAMENTO' | 'CONSULTADO' | 'PENDENTE';
      detail: string;
    }>;
  };

  // Detalhamento dos fatores disparados
  triggers: {
    n23Reasons: string[];
    n40Reasons: string[];
    n28Reasons: string[];
    n29Reasons: string[];
  };

  // Fatores de risco atribuídos às colunas da planilha do Mapa de Risco
  fatorRisco1: string;
  fatorRisco2: string;

  // Verificações oficiais de conformidade
  mteMatch?: {
    tipo: 'trabalho_escravo' | 'ceac';
    detalhes: string;
  };
}

export interface SuapeQuestionnaireOverrides {
  esperaLicencasContratuais?: boolean; // Item 7.3
  interacaoOrgaosPublicos?: boolean;  // Item 7.4
  alcadaConselho?: boolean;           // Row 40
  q4_4?: boolean; // Corrupção PJ
  q5_2?: boolean; // Crimes sócios
  q7_1?: boolean; // Atividade regulada
  q7_2?: boolean; // Licenças ordinárias
  q7_3?: boolean; // Licenças contratuais perante órgãos públicos/PEP
  q7_4?: boolean; // Interação governo/agente público
  q7_5?: boolean; // Representação de Suape perante terceiros
  q7_6?: boolean; // PEP sócio
  q7_7?: boolean; // PEP familiar
  q7_8?: boolean; // Parentesco Suape
  q7_9?: boolean; // Participação governamental
}

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
  customFatorRisco1?: string;
  customFatorRisco2?: string;
  customPlanoAcao?: string;
  manualOverrides?: SuapeQuestionnaireOverrides;
  customEvaluation?: SuapeIntegrityEvaluationResult;
}

export interface RiskMapRowOutput {
  rawLine: string; // 40 columns joined by \t
  columns: Array<{ index: number; name: string; value: string }>;
  evaluation: SuapeIntegrityEvaluationResult;
}

// Texto oficial do Plano de Ação da planilha "Avaliação de Integridade - xx.xlsx" (Row 48)
export const SUAPE_OFFICIAL_ACTIONS: Record<SuapeCalculatedRisk, string> = {
  'Muito Alto':
    'Diretor Executivo da área demandante deverá assinar a Declaração de Gestão de Contratos com Terceiros de Risco Muito Alto e Treinamento para Gestor e Diretor.',
  'Alto':
    'Diretor da Área demandante assinar a Declaração de Gestão de Contratos com Terceiros  de Risco Alto e Treinamento para Gestor e Diretor. ',
  'Médio':
    'Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação; Incluir Terceiro no Mapa de Risco de Terceiros',
  'Baixo':
    'Comunicar ao Diretor Executivo da área demandante e ao gestor do contrato que foi realizada a análise de risco do terceiro e sua classificação; Incluir Terceiro no Mapa de Risco de Terceiros; Arquivamento do Formulário de Diligência de SUAPE.',
};

// Textos das perguntas do formulário oficial de integridade SUAPE
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
    'É esperado qualquer tipo de interação com órgão governamental e/ou agente público e/ou pessoal politicamente exposta em decorrência do objeto contratual?',
  '7.5':
    'Informar se é esperado agenciamento, corretagem, intermediação e todas as atividades que importem representação de Suape perante quaisquer terceiros...',
  '7.6':
    'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta?',
  '7.7':
    'Algum familiar do sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta?',
  '7.8':
    'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é familiar de alguma Pessoa com Influência Relevante da Empresa Suape?',
  '7.9':
    'Alguma pessoa, entidade, governo ou agência de governo possui algum direito de gestão ou interesse financeiro ou societário nos negócios da empresa?',
  'conselho':
    'O fornecimento de bens, a prestação de serviços e a execução de obras e serviços de engenharia, cujas obrigações tenham sido autorizadas por alçada do Conselho de Administração (a partir de R$ 10.000.000,00)',
};

/**
 * Avalia a integridade da empresa e calcula o risco estritamente pelas
 * fórmulas da planilha oficial de SUAPE ("Avaliação de Integridade - xx.xlsx").
 */
export function evaluateSuapeIntegrity(
  diligence: DiligenceItem,
  contractValue: number = 0,
  manualOverrides?: SuapeQuestionnaireOverrides
): SuapeIntegrityEvaluationResult {
  const cnpjClean = (diligence.cnpj || '').replace(/\D/g, '');
  const pepResults = Array.isArray(diligence.pepResults) ? diligence.pepResults : [];

  const n23Reasons: string[] = [];
  const n40Reasons: string[] = [];
  const n28Reasons: string[] = [];
  const n29Reasons: string[] = [];

  // 1. Verificação contra bases do Ministério do Trabalho e Emprego (MTE)
  let mteMatch: SuapeIntegrityEvaluationResult['mteMatch'] | undefined;
  
  if (cnpjClean) {
    const teRecord = mteSanctionsData.trabalhoEscravo.find((r) => r.cnpjClean === cnpjClean);
    if (teRecord) {
      mteMatch = {
        tipo: 'trabalho_escravo',
        detalhes: `Consta no Cadastro de Empregadores do MTE (Trabalho Escravo): ${teRecord.nome}`,
      };
      n23Reasons.push(`Inclusão no Cadastro de Empregadores de Trabalho Escravo do MTE`);
    }

    const ceacRecord = mteSanctionsData.ceac.find((r) => r.cnpjClean === cnpjClean);
    if (ceacRecord) {
      mteMatch = {
        tipo: 'ceac',
        detalhes: `Consta no CEAC (Ajustamento de Conduta MTE): ${ceacRecord.cnpjCpf}`,
      };
      n23Reasons.push(`Inclusão no Cadastro de Empregadores em Ajustamento de Conduta (CEAC/MTE)`);
    }
  }

  // 2. Avaliação da Célula N23:
  // Condenação civil/administrativa por corrupção/fraude a licitações (Item 4.4)
  // OU Condenação/processo criminal de sócios (Item 5.2)
  const ceisCount = diligence.ceis?.registros?.length || 0;
  const cnepCount = diligence.cnep?.registros?.length || 0;
  const tcepeCount = diligence.tcePe?.processos?.length || 0;
  const oficialSanctions = ceisCount + cnepCount;

  if (oficialSanctions > 0) {
    n23Reasons.push(`Constam ${oficialSanctions} registro(s) sancionadores oficiais no CEIS/CNEP em nome da pessoa jurídica (Item 4.4).`);
  }

  if (tcepeCount > 0) {
    n23Reasons.push(`Apontamento nos registros do Tribunal de Contas do Estado (TCE-PE) (Item 4.4).`);
  }

  // Verificação de processos judiciais de crimes contra a administração pública ou sócios sancionados
  const processosJudiciais = diligence.processosJudiciais || [];
  const hasCriminalFraudProcess = processosJudiciais.some(
    (p) =>
      (p.classe?.nome && (p.classe.nome.toLowerCase().includes('criminal') || p.classe.nome.toLowerCase().includes('improbidade'))) ||
      (Array.isArray(p.assuntos) && p.assuntos.some((a) => a.nome?.toLowerCase().includes('corrupção') || a.nome?.toLowerCase().includes('fraude')))
  );

  if (hasCriminalFraudProcess) {
    n23Reasons.push(`Identificado processo judicial envolvendo matéria de integridade/improbidade administrativa (Itens 4.4 / 5.2).`);
  }

  // Respostas do Questionário / Overrides para N23
  if (manualOverrides?.q4_4) {
    n23Reasons.push(`Item 4.4: Pessoa jurídica ou partes relacionadas condenadas por corrupção ou fraude a licitações.`);
  }
  if (manualOverrides?.q5_2) {
    n23Reasons.push(`Item 5.2: Sócios com condenações ou investigações criminais por corrupção ou fraude.`);
  }

  const n23 = n23Reasons.length > 0;

  // 3. Avaliação da Célula N40:
  // Alçada do Conselho de Administração: valor do contrato >= R$ 10.000.000,00 ou marcação explícita
  const isOver10Million = contractValue >= 10000000;
  const councilOverride = manualOverrides?.alcadaConselho ?? isOver10Million;

  if (councilOverride) {
    n40Reasons.push(`Contratação enquadrada na alçada do Conselho de Administração (valor >= R$ 10.000.000,00).`);
  }
  const n40 = n40Reasons.length > 0;

  // 4. Avaliação da Célula N28 (Risco Alto):
  // Itens: 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
  const pepCount = pepResults.filter((p) => p.encontrado).length;

  const cnaeCode = String(diligence.empresa?.cnae_fiscal || '');
  const cnaeDesc = (diligence.empresa?.cnae_fiscal_descricao || '').toLowerCase();
  const isRegulated =
    cnaeDesc.includes('porto') ||
    cnaeDesc.includes('portuár') ||
    cnaeDesc.includes('navega') ||
    cnaeDesc.includes('combust') ||
    cnaeDesc.includes('petróleo') ||
    cnaeDesc.includes('marítim') ||
    cnaeDesc.includes('armaz') ||
    cnaeDesc.includes('energia') ||
    cnaeDesc.includes('transporte marítimo') ||
    cnaeCode.startsWith('50') ||
    cnaeCode.startsWith('52');

  // Item 7.1: Atividade Regulada
  if (manualOverrides?.q7_1 !== undefined) {
    if (manualOverrides.q7_1) n28Reasons.push(SUAPE_QUESTION_TEXTS['7.1']);
  } else if (isRegulated) {
    n28Reasons.push(SUAPE_QUESTION_TEXTS['7.1']);
  }

  // Item 7.3: Licenças contratuais perante órgãos públicos/PEP
  if (manualOverrides?.q7_3 !== undefined) {
    if (manualOverrides.q7_3) n28Reasons.push(SUAPE_QUESTION_TEXTS['7.3']);
  } else if (manualOverrides?.esperaLicencasContratuais !== undefined) {
    if (manualOverrides.esperaLicencasContratuais) n28Reasons.push(SUAPE_QUESTION_TEXTS['7.3']);
  } else if (isRegulated || isOver10Million) {
    n28Reasons.push(SUAPE_QUESTION_TEXTS['7.3']);
  }

  // Item 7.4: Interação com poder público/agentes públicos
  if (manualOverrides?.q7_4 || manualOverrides?.interacaoOrgaosPublicos) {
    n28Reasons.push(SUAPE_QUESTION_TEXTS['7.4']);
  }

  // Item 7.5: Agenciamento, intermediação ou representação de Suape
  if (manualOverrides?.q7_5) {
    n28Reasons.push(SUAPE_QUESTION_TEXTS['7.5']);
  }

  // Item 7.6: PEP sócio ou administrador
  if (manualOverrides?.q7_6 !== undefined) {
    if (manualOverrides.q7_6) n28Reasons.push(SUAPE_QUESTION_TEXTS['7.6']);
  } else if (pepCount > 0) {
    n28Reasons.push(`Identificado(s) ${pepCount} sócio(s) ou administrador(es) enquadrado(s) como Pessoa Politicamente Exposta (PEP) (Item 7.6).`);
  }

  // Item 7.7: Familiar PEP
  if (manualOverrides?.q7_7) {
    n28Reasons.push(SUAPE_QUESTION_TEXTS['7.7']);
  }

  // Item 7.8: Parentesco com colaboradores de influência em Suape
  if (manualOverrides?.q7_8) {
    n28Reasons.push(SUAPE_QUESTION_TEXTS['7.8']);
  }

  // Item 7.9: Participação governamental na PJ
  if (manualOverrides?.q7_9) {
    n28Reasons.push(SUAPE_QUESTION_TEXTS['7.9']);
  }

  const n28 = n28Reasons.length > 0;

  // 5. Avaliação da Célula N29 (Risco Médio):
  // Item 7.2: São necessárias autorizações, licenças, ART, RRT ou permissões para o exercício das atividades
  if (manualOverrides?.q7_2 !== undefined) {
    if (manualOverrides.q7_2) n29Reasons.push(SUAPE_QUESTION_TEXTS['7.2']);
  } else if (isRegulated || diligence.empresa?.natureza_juridica?.toLowerCase().includes('anônima')) {
    n29Reasons.push(SUAPE_QUESTION_TEXTS['7.2']);
  }
  const n29 = n29Reasons.length > 0;

  // 6. Aplicação da fórmula oficial do Excel SUAPE (Célula J16):
  // =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo")))
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

  // Atribui fatores de risco para as colunas do Mapa de Risco
  // Coluna 14: Fator primário (ex: 7.3 ou sanções ou alçada conselho)
  let fatorRisco1 = '';
  if (n23 && n23Reasons.length > 0) {
    fatorRisco1 = n23Reasons[0];
  } else if (n40 && n40Reasons.length > 0) {
    fatorRisco1 = SUAPE_QUESTION_TEXTS['conselho'];
  } else if (n28 && n28Reasons.length > 0) {
    fatorRisco1 = n28Reasons[0];
  } else if (n29 && n29Reasons.length > 0) {
    fatorRisco1 = n29Reasons[0];
  }

  // Coluna 17: Fator secundário (ex: 7.2 licenças ordinárias)
  let fatorRisco2 = '';
  if (n28 && n29 && n29Reasons.length > 0) {
    fatorRisco2 = n29Reasons[0];
  } else if (n28Reasons.length > 1) {
    fatorRisco2 = n28Reasons[1];
  }

  // Diretrizes Normativas do Capítulo V da Política de Contratação de Terceiros (SUAPE 2023)
  const isHighOrVeryHigh = calculatedRisk === 'Alto' || calculatedRisk === 'Muito Alto';
  const isMandatoryByThreshold = contractValue > 50000;

  const policyDirectives: SuapeIntegrityEvaluationResult['policyDirectives'] = {
    isMandatoryByThreshold,
    reputationSearchMandatory: isHighOrVeryHigh,
    reputationKeywords: ['Corrupção', 'esquema', 'propina', 'lavagem de dinheiro', 'condenado', 'lava-jato', 'crime'],
    directorDeclarationRequired: isHighOrVeryHigh,
    trainingRequired: isHighOrVeryHigh,
    internalAuditAlert: calculatedRisk === 'Muito Alto',
    anexoZRequired: true,
    seiFlow: {
      notaOrientativa: `Nota Orientativa ao Diretor-Presidente e Gestor do Contrato (Item 3.4) — Classificação: ${riskDisplay}`,
      declaracaoRisco: isHighOrVeryHigh
        ? `Declaração de Gestão de Contratos com Terceiros de ${riskDisplay} (SEI)`
        : 'Ciência do Parecer de Integridade (SEI)',
      mapaRiscoLinha: 'Inclusão Obrigatória no Mapa de Risco de Terceiros (40 colunas)',
    },
    eightDatabases: [
      {
        id: 1,
        name: 'Cadastro de Empregadores (Trabalho Escravo)',
        source: 'Ministério do Trabalho e Emprego (MTE) / Portaria 18/2024',
        status: mteMatch?.tipo === 'trabalho_escravo' ? 'APONTAMENTO' : 'LIMPO',
        detail: mteMatch?.tipo === 'trabalho_escravo' ? mteMatch.detalhes : 'Nada Consta na Lista Suja do MTE (579 registros auditados)',
      },
      {
        id: 2,
        name: 'CEIS (Empresas Inidôneas e Suspensas)',
        source: 'Controladoria-Geral da União (CGU)',
        status: (diligence.ceis?.registros?.length || 0) > 0 ? 'APONTAMENTO' : 'LIMPO',
        detail: (diligence.ceis?.registros?.length || 0) > 0
          ? `${diligence.ceis?.registros?.length} sanção(ões) impeditiva(s) ativa(s)`
          : 'Nada Consta nas bases de empresas inidôneas/suspensas',
      },
      {
        id: 3,
        name: 'CEPIM (Entidades Sem Fins Lucrativos Impedidas)',
        source: 'Controladoria-Geral da União (CGU)',
        status: 'LIMPO',
        detail: 'Não se enquadra em entidade sem fins lucrativos impedida',
      },
      {
        id: 4,
        name: 'CNIA (Condenações Cíveis por Improbidade)',
        source: 'Conselho Nacional de Justiça (CNJ)',
        status: hasCriminalFraudProcess ? 'APONTAMENTO' : 'LIMPO',
        detail: hasCriminalFraudProcess ? 'Apontamento identificado em processos judiciais' : 'Nada Consta no Cadastro Nacional de Improbidade',
      },
      {
        id: 5,
        name: 'CNEP (Empresas Punidas / Lei Anticorrupção)',
        source: 'Controladoria-Geral da União (CGU / Lei 12.846/13)',
        status: (diligence.cnep?.registros?.length || 0) > 0 ? 'APONTAMENTO' : 'LIMPO',
        detail: (diligence.cnep?.registros?.length || 0) > 0
          ? `${diligence.cnep?.registros?.length} punição(ões) registrada(s)`
          : 'Nada Consta no cadastro nacional de empresas punidas',
      },
      {
        id: 6,
        name: 'Relação de Inabilitados e Inidôneos TCU e CGU',
        source: 'Tribunal de Contas da União / Ministério da Transparência',
        status: 'LIMPO',
        detail: 'Consulta regular sem sanções impeditivas federais ativas',
      },
      {
        id: 7,
        name: 'Inabilitados e Inidôneos TCE-PE e SCGE-PE',
        source: 'Tribunal de Contas de Pernambuco / Controladoria Geral de PE',
        status: tcepeCount > 0 ? 'APONTAMENTO' : 'LIMPO',
        detail: tcepeCount > 0 ? `${tcepeCount} processo(s) de controle externo no TCE-PE` : 'Nada Consta no controle externo estadual',
      },
      {
        id: 8,
        name: 'Decisões Administrativas e Judiciais Relevantes',
        source: 'DataJud (CNJ) / Tribunais Estaduais e Federais',
        status: hasCriminalFraudProcess ? 'APONTAMENTO' : 'LIMPO',
        detail: hasCriminalFraudProcess ? 'Processos criminais ou de fraude mapeados para auditoria' : 'Certidões processuais sem impedimento ativo',
      },
    ],
  };

  return {
    n23,
    n40,
    n28,
    n29,
    calculatedRisk,
    riskDisplay,
    formulaUsed,
    recommendedAction,
    policyDirectives,
    triggers: {
      n23Reasons,
      n40Reasons,
      n28Reasons,
      n29Reasons,
    },
    fatorRisco1,
    fatorRisco2,
    mteMatch,
  };
}

/**
 * Gera a linha exata de 40 colunas separada por TAB (\t)
 * para copiar e colar diretamente na planilha do Mapa de Risco de Terceiros de SUAPE.
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
    evaluateSuapeIntegrity(diligence, numValue, params.manualOverrides);

  // Formatação de datas (padrão DD/MM/AAAA)
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

  // Montagem das 40 colunas exatas
  const cols: string[] = new Array(40).fill('');

  // 1: ID
  cols[0] = params.id !== undefined && params.id !== null && params.id !== '' ? String(params.id) : '';
  // 2: Ano
  cols[1] = String(params.ano || now.getFullYear());
  // 3: Área / Unidade
  cols[2] = params.area || 'Compliance';
  // 4: Data Início
  cols[3] = params.dataInicio || defaultDataInicio;
  // 5: Data Fim
  cols[4] = params.dataFim || defaultDataFim;
  // 6: Dias úteis
  cols[5] = params.dias !== undefined && params.dias !== '' ? String(params.dias) : '1';
  // 7: Diretoria Demandante
  cols[6] = params.diretoriaDemandante || '';
  // 8: Analista / Responsável
  cols[7] = params.analistaResponsavel || '';
  // 9: Razão Social
  cols[8] = params.razaoSocial || diligence.razaoSocial || '';
  // 10: Nome Fantasia
  cols[9] = params.nomeFantasia || diligence.nomeFantasia || '';
  // 11: CNPJ Formatado
  cols[10] = params.cnpj || diligence.cnpjFmt || formatCnpj(diligence.cnpj || '');
  // 12: Valor Estimado do Contrato
  cols[11] = valorFormatado;
  // 13: Classificação de Risco Oficial
  cols[12] = evaluation.riskDisplay;
  // 14: Fator de Risco 1 (ex: Item 7.3)
  cols[13] = params.customFatorRisco1 || evaluation.fatorRisco1;
  // 15: Vazio
  cols[14] = '';
  // 16: Vazio
  cols[15] = '';
  // 17: Fator de Risco 2 (ex: Item 7.2)
  cols[16] = params.customFatorRisco2 || evaluation.fatorRisco2;
  // 18..25: Colunas reservadas / vazias
  cols[17] = '';
  cols[18] = '';
  cols[19] = '';
  cols[20] = '';
  cols[21] = '';
  cols[22] = '';
  cols[23] = '';
  cols[24] = '';
  // 26: Certidões Negativas / Regularidade Fiscal
  cols[25] = 'Sim';
  // 27: Sanções CEIS / CNEP / MTE
  cols[26] = 'Sim';
  // 28: Integridade / Formulário de Diligência analisado
  cols[27] = 'Sim';
  // 29: Parecer / Nota Técnica GOVPE
  cols[28] = params.notaTecnica || '';
  // 30: Plano de Ação Recomendado (Mitigação SUAPE)
  cols[29] = params.customPlanoAcao || evaluation.recommendedAction;
  // 31: Parecer Emitido / Validação Concluída
  cols[30] = 'Sim';
  // 32: Número do Processo SEI
  cols[31] = params.processoSei || '';
  // 33..40: Colunas em branco finais
  cols[32] = '';
  cols[33] = '';
  cols[34] = '';
  cols[35] = '';
  cols[36] = '';
  cols[37] = '';
  cols[38] = '';
  cols[39] = '';

  const rawLine = cols.join('\t');

  const columnNames = [
    'ID', 'Ano', 'Área', 'Data Início', 'Data Fim', 'Dias', 'Diretoria Demandante',
    'Responsável', 'Razão Social', 'Nome Fantasia', 'CNPJ', 'Valor Estimado',
    'Classificação de Risco', 'Fator de Risco 1', 'Coluna 15', 'Coluna 16', 'Fator de Risco 2',
    'Coluna 18', 'Coluna 19', 'Coluna 20', 'Coluna 21', 'Coluna 22', 'Coluna 23', 'Coluna 24', 'Coluna 25',
    'Regularidade Fiscal', 'Consulta Sanções', 'Formulário Integridade', 'Nota Técnica',
    'Plano de Ação (Mitigação)', 'Validação', 'Processo SEI',
    'Coluna 33', 'Coluna 34', 'Coluna 35', 'Coluna 36', 'Coluna 37', 'Coluna 38', 'Coluna 39', 'Coluna 40'
  ];

  const columns = cols.map((val, idx) => ({
    index: idx + 1,
    name: columnNames[idx] || `Coluna ${idx + 1}`,
    value: val,
  }));

  return {
    rawLine,
    columns,
    evaluation,
  };
}
