// ==========================================================
// DILIGÊNCIA 360 — Demais campos do Questionário de Diligência
//
// A classificação do terceiro sai de 22 itens: as 11 red flags, os 10
// de maturidade e a alçada do Conselho. Mas o Questionário de Diligência
// é bem maior — tem o representante, o histórico da sociedade, o ente
// regulador, o responsável pelo programa de integridade e mais uma
// dúzia de campos que o fornecedor preenche e que hoje se perdiam na
// transcrição.
//
// Este catálogo existe para levar esses campos até a CheckList da
// planilha, onde o analista os vê no documento que vai ao processo.
//
// SEPARAÇÃO DELIBERADA: nada daqui entra no cálculo do risco. As três
// perguntas Sim/Não deste arquivo (1.2, 6.1, 9.4 a 9.6) não são lidas
// por nenhuma fórmula da planilha, e misturá-las com `IntegrityAnswers`
// abriria caminho para uma delas influenciar a classificação por
// descuido. Elas moram aqui, viajam à parte e só são escritas.
//
// O que ficou de fora, e por quê: as tabelas de várias linhas — sócios
// (5.1), administradores (4.1 e 4.2), entes reguladores (7.1), licenças
// (7.2) — têm número variável de linhas e mesclagens próprias. Escrever
// nelas exige inserir linhas na planilha, que é operação destrutiva num
// arquivo com fórmulas posicionais. Ficam para quando houver necessidade
// real e um desenho que não arrisque o resto.
// ==========================================================

/** Perguntas Sim/Não que não entram em nenhuma fórmula. */
export type SuapeExtraChoiceKey = '1.2' | '6.1' | '9.4' | '9.5' | '9.6';

/** Campos de texto livre do questionário. */
export type SuapeTextFieldKey =
  | 'ramoAtividade'
  | 'sitioEletronico'
  | 'numeroEmpregados'
  | 'subcontratacaoDetalhe'
  | 'representanteNome'
  | 'representanteCpf'
  | 'representanteRg'
  | 'representanteTelefone'
  | 'representanteEmail'
  | 'representanteNacionalidade'
  | 'representanteCargo'
  | 'anosDeAtividade'
  | 'historicoSociedade'
  | 'processosCorrupcao'
  | 'processosCriminais'
  | 'controleExterno'
  | 'responsavelIntegridade'
  | 'cadastrosDetalhe';

export interface SuapeExtraChoice {
  key: SuapeExtraChoiceKey;
  /** Célula da lista suspensa na aba CheckList. */
  cell: string;
  text: string;
}

export interface SuapeTextField {
  key: SuapeTextFieldKey;
  /** Célula (ou primeira célula da mesclagem) na aba CheckList. */
  cell: string;
  /** Rótulo curto, para a tela. */
  label: string;
  /** O que pedir à transcrição. */
  text: string;
}

export const SUAPE_EXTRA_CHOICES: SuapeExtraChoice[] = [
  {
    key: '1.2',
    cell: 'C15',
    text: 'A empresa tem a intenção de subcontratar ou utilizar terceiros na execução do objeto contratual?',
  },
  {
    key: '6.1',
    cell: 'C97',
    text: 'A pessoa jurídica possui demonstração financeira auditada?',
  },
  {
    key: '9.4',
    cell: 'C246',
    text: 'A pessoa jurídica possui um programa, política ou ações de responsabilidade social?',
  },
  {
    key: '9.5',
    cell: 'C252',
    text: 'A pessoa jurídica dispõe de política ou procedimento em matéria de direitos humanos e trabalho digno?',
  },
  {
    key: '9.6',
    cell: 'C258',
    text: 'A pessoa jurídica dispõe de política ou procedimento em matéria ambiental?',
  },
];

export const SUAPE_TEXT_FIELDS: SuapeTextField[] = [
  {
    key: 'ramoAtividade',
    cell: 'N7',
    label: 'Ramo de atividade',
    text: 'Ramo de Atividade da pessoa jurídica (item 1.1).',
  },
  {
    key: 'numeroEmpregados',
    cell: 'N8',
    label: 'Nº de empregados',
    text: 'Número de empregados da pessoa jurídica (item 1.1).',
  },
  {
    key: 'sitioEletronico',
    cell: 'N9',
    label: 'Sítio eletrônico',
    text: 'Sítio eletrônico da pessoa jurídica (item 1.1).',
  },
  {
    key: 'subcontratacaoDetalhe',
    cell: 'B17',
    label: 'Subcontratação (1.3)',
    text: 'Item 1.3: informações sobre a subcontratação, quando o item 1.2 for "sim".',
  },
  {
    key: 'representanteNome',
    cell: 'D20',
    label: 'Representante — nome',
    text: 'Nome completo do representante da pessoa jurídica para contato (item 2).',
  },
  { key: 'representanteCpf', cell: 'D21', label: 'Representante — CPF', text: 'CPF do representante (item 2).' },
  { key: 'representanteRg', cell: 'N21', label: 'Representante — RG', text: 'RG do representante (item 2).' },
  {
    key: 'representanteTelefone',
    cell: 'D22',
    label: 'Representante — telefone',
    text: 'Telefone com DDD do representante (item 2).',
  },
  {
    key: 'representanteEmail',
    cell: 'N22',
    label: 'Representante — e-mail',
    text: 'E-mail corporativo do representante (item 2).',
  },
  {
    key: 'representanteNacionalidade',
    cell: 'D23',
    label: 'Representante — nacionalidade',
    text: 'Nacionalidade do representante (item 2).',
  },
  { key: 'representanteCargo', cell: 'D24', label: 'Representante — cargo', text: 'Cargo do representante (item 2).' },
  {
    key: 'anosDeAtividade',
    cell: 'B28',
    label: 'Anos de atividade (3.1)',
    text: 'Item 3.1: há quantos anos a sociedade exerce as atividades que Suape pretende contratar.',
  },
  {
    key: 'historicoSociedade',
    cell: 'B30',
    label: 'Histórico da sociedade (3.2)',
    text: 'Item 3.2: breve histórico de constituição da sociedade.',
  },
  {
    key: 'processosCorrupcao',
    cell: 'B72',
    label: 'Processos do item 4.5',
    text: 'Item 4.5: processo, status e autoridade, quando o item 4.4 for "sim".',
  },
  {
    key: 'processosCriminais',
    cell: 'B92',
    label: 'Processos do item 5.3',
    text: 'Item 5.3: processo, status e autoridade, quando o item 5.2 for "sim".',
  },
  {
    key: 'controleExterno',
    cell: 'B181',
    label: 'Descrição do item 7.9',
    text: 'Descrição do direito de gestão, interesse financeiro ou societário, quando o item 7.9 for "sim".',
  },
  {
    key: 'responsavelIntegridade',
    cell: 'B227',
    label: 'Responsável pelo programa (9.1)',
    text: 'Item 9.1: profissional ou órgão colegiado responsável pelo programa de integridade.',
  },
  {
    key: 'cadastrosDetalhe',
    cell: 'B241',
    label: 'Detalhamento do item 9.3',
    text: 'Item 9.3: detalhamento, quando a empresa constar em algum dos cadastros do item 9.2.',
  },
];

export const SUAPE_EXTRA_CHOICE_KEYS = SUAPE_EXTRA_CHOICES.map((item) => item.key);
export const SUAPE_TEXT_FIELD_KEYS = SUAPE_TEXT_FIELDS.map((item) => item.key);
