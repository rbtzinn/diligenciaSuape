// ==========================================================
// DILIGÊNCIA 360 — Questionário de Diligência de SUAPE (modelo antigo)
// ==========================================================
// Catálogo único do formulário público: seções, perguntas, tabelas e
// regras de evidência. A tela, a validação e o PDF são gerados daqui,
// então trocar para o modelo novo é trocar este arquivo.
//
// Os enunciados são os do Anexo A da Política de Contratação de
// Terceiros, na versão que a CPL envia hoje (questionário da TMP
// Terminais, set/2026). Onde o PDF diverge do catálogo da planilha
// (`suapeChecklistFields.ts`, itens 9.4 a 9.6), vale o PDF: é o
// documento que o terceiro assina.
//
// EVIDÊNCIA: no modelo antigo o terceiro só declarava. Aqui, as
// respostas marcadas com `evidence` só permitem exportar o PDF com um
// arquivo (PDF, PNG ou JPG) ou um link que comprove o que foi
// declarado. É a primeira parte da proposta de questionário com
// evidências; a regra de risco por falta de evidência depende de
// revisão da Política e ainda não está aqui.
// ==========================================================

export type YesNo = 'sim' | 'nao';

export type TextMask = 'cnpj' | 'cpf' | 'date' | 'phone';

/** Arquivo anexado, link público ou indicação de trecho de documento já anexado. */
export type EvidenceKind = 'file' | 'link' | 'reference';

export interface TextFieldDef {
  kind: 'text';
  id: string;
  label: string;
  /** Número do item no questionário, quando houver. */
  ref?: string;
  multiline?: boolean;
  mask?: TextMask;
  type?: 'email' | 'url' | 'number';
  required?: boolean;
  placeholder?: string;
  /** Ocupa a linha inteira na grade de campos. */
  wide?: boolean;
}

export interface TableColumn {
  id: string;
  label: string;
  mask?: TextMask;
  /** Peso relativo da largura da coluna no PDF. */
  width?: number;
}

export interface TableDef {
  kind: 'table';
  id: string;
  ref?: string;
  label: string;
  columns: TableColumn[];
  /** Exige ao menos uma linha preenchida. */
  required?: boolean;
  /** Validação da soma de participação (item 5.1). */
  percentColumn?: string;
}

/** Regra de evidência de uma resposta. */
export interface EvidenceRule {
  /** Resposta que exige a evidência. */
  when: YesNo;
  /** O que o terceiro deve anexar. Aparece na tela e no PDF. */
  hint: string;
  /**
   * Uma evidência por linha da tabela indicada (licença por licença,
   * como no item 7.2), em vez de uma evidência para o item todo.
   */
  perRowOf?: string;
  /** Formas aceitas. Padrão: arquivo ou link. */
  accepts?: EvidenceKind[];
}

export interface ChoiceDef {
  kind: 'choice';
  id: string;
  ref: string;
  text: string;
  /** O que precisa ser preenchido quando a resposta é "Sim". */
  whenYes?: Array<TextFieldDef | TableDef>;
  evidence?: EvidenceRule;
}

export interface RegistriesDef {
  kind: 'registries';
  id: string;
  ref: string;
  text: string;
  gate: 'riscoAltoOuMuitoAlto';
  /** Detalhe exigido quando algum cadastro é marcado. */
  detail: TextFieldDef;
}

export interface NoteDef {
  kind: 'note';
  id: string;
  text: string;
}

export type QuestionDef = TextFieldDef | TableDef | ChoiceDef | RegistriesDef | NoteDef;

export interface SectionDef {
  id: string;
  number: string;
  title: string;
  items: QuestionDef[];
}

/** Os 8 cadastros do item 9.2 (3.3.3 da Política). */
export const REGISTRIES: Array<{ key: string; text: string }> = [
  { key: 'ceis', text: 'Cadastro Nacional de Empresas Inidôneas e Suspensas (CEIS)' },
  { key: 'cnep', text: 'Cadastro Nacional de Empresas Punidas (CNEP)' },
  { key: 'cepim', text: 'Cadastro de Entidades Privadas Sem Fins Lucrativos Impedidas (CEPIM)' },
  { key: 'improbidadeCnj', text: 'Cadastro Nacional de Condenações Cíveis por Atos de Improbidade Administrativa do Conselho Nacional de Justiça' },
  { key: 'tcu', text: 'Relação de Inabilitados e Inidôneos do Tribunal de Contas da União' },
  { key: 'tcePe', text: 'Relação de Inabilitados e Inidôneos do Tribunal de Contas do Estado de Pernambuco e da Secretaria da Controladoria Geral de Pernambuco' },
  { key: 'trabalhoEscravo', text: 'Cadastro de Empregadores que tenham submetido trabalhadores a condições análogas às de escravo do Ministério do Trabalho e Emprego' },
  { key: 'decisoesAdversas', text: 'Decisões em desfavor do terceiro em processos administrativos e judiciais, em específico naqueles referentes às infrações presentes neste Programa.' },
];

const partesRelacionadas = (id: string): TableColumn[] => [
  { id: `${id}RazaoSocial`, label: 'Razão Social', width: 3 },
  { id: `${id}Pais`, label: 'País', width: 1.2 },
  { id: `${id}Telefone`, label: 'Telefone', mask: 'phone', width: 1.5 },
  { id: `${id}Endereco`, label: 'Endereço', width: 3 },
  { id: `${id}Site`, label: 'Sítio eletrônico', width: 2 },
];

const orgaoAtividade: TableColumn[] = [
  { id: 'orgao', label: 'Órgão Governamental / Agente Público / Pessoa Politicamente Exposta', width: 3 },
  { id: 'atividade', label: 'Atividade a ser desempenhada', width: 3 },
];

export const QUESTIONNAIRE_SECTIONS: SectionDef[] = [
  {
    id: 's1',
    number: '1',
    title: 'Dados gerais da pessoa jurídica',
    items: [
      { kind: 'text', id: 'razaoSocial', ref: '1.1', label: 'Razão Social e Tipo Societário', required: true, wide: true },
      { kind: 'text', id: 'cnpj', label: 'CNPJ', mask: 'cnpj', required: true },
      { kind: 'text', id: 'dataConstituicao', label: 'Data da Constituição da Sociedade', mask: 'date', required: true },
      { kind: 'text', id: 'objetoSocial', label: 'Objeto Social', required: true, wide: true },
      { kind: 'text', id: 'ramoAtividade', label: 'Ramo de Atividade', required: true },
      { kind: 'text', id: 'numeroEmpregados', label: 'Nº de Empregados', type: 'number', required: true },
      { kind: 'text', id: 'endereco', label: 'Endereço', required: true, wide: true },
      { kind: 'text', id: 'sitioEletronico', label: 'Sítio Eletrônico', type: 'url' },
      { kind: 'text', id: 'paisesLocalidades', label: 'Países e Localidades nos quais a Pessoa Jurídica atua', required: true },
      { kind: 'text', id: 'servicoPrestado', label: 'Serviço a ser Prestado', required: true, wide: true },
      {
        kind: 'choice',
        id: '1.2',
        ref: '1.2',
        text: 'Informar se a empresa tem a intenção de subcontratar ou utilizar outras pessoas físicas ou jurídicas para cumprir com o contrato com Suape?',
        whenYes: [
          {
            kind: 'table',
            id: 'subcontratadas',
            ref: '1.3',
            label: 'Caso a resposta seja "sim", forneça as informações abaixo:',
            required: true,
            columns: [
              { id: 'nome', label: 'Nome / Razão Social', width: 3 },
              { id: 'documento', label: 'CPF / CNPJ', width: 2 },
              { id: 'atividade', label: 'Atividade a ser desempenhada', width: 3 },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 's2',
    number: '2',
    title: 'Representante da pessoa jurídica para contato',
    items: [
      { kind: 'text', id: 'representanteNome', label: 'Nome Completo', required: true, wide: true },
      { kind: 'text', id: 'representanteCpf', label: 'CPF', mask: 'cpf', required: true },
      { kind: 'text', id: 'representanteRg', label: 'RG', required: true },
      { kind: 'text', id: 'representanteTelefone', label: 'Telefone (com DDD)', mask: 'phone', required: true },
      { kind: 'text', id: 'representanteEmail', label: 'E-mail Corporativo', type: 'email', required: true },
      { kind: 'text', id: 'representanteNacionalidade', label: 'Nacionalidade', required: true },
      { kind: 'text', id: 'representanteCargo', label: 'Cargo', required: true },
    ],
  },
  {
    id: 's3',
    number: '3',
    title: 'Histórico da sociedade',
    items: [
      { kind: 'text', id: 'anosAtividade', ref: '3.1', label: 'Há quantos anos a sociedade exerce as atividades que Suape pretende contratar?', required: true, wide: true },
      { kind: 'text', id: 'historico', ref: '3.2', label: 'Descreva brevemente o histórico de constituição da sociedade, suas atividades principais e objetivos:', multiline: true, required: true, wide: true },
    ],
  },
  {
    id: 's4',
    number: '4',
    title: 'Informações sobre a gestão societária',
    items: [
      {
        kind: 'table',
        id: 'administradores',
        ref: '4.1',
        label: 'Indique quais pessoas integram ou integraram, dentro da regra dos cinco anos, a diretoria e o conselho de administração da sociedade, se aplicável, ou órgãos equivalentes, caso não se trate de uma sociedade anônima, discriminando-as por cargo, nacionalidade e período.',
        required: true,
        columns: [
          { id: 'nome', label: 'Nome', width: 3 },
          { id: 'cargo', label: 'Cargo', width: 2 },
          { id: 'nacionalidade', label: 'Nacionalidade', width: 1.5 },
          { id: 'periodo', label: 'Período', width: 1.3 },
        ],
      },
      {
        kind: 'table',
        id: 'envolvidos',
        ref: '4.2',
        label: 'Indique quais pessoas estarão diretamente envolvidas na possível relação empresarial com Suape e/ou que atuarão em nome de Suape.',
        required: true,
        columns: [
          { id: 'nome', label: 'Nome', width: 3 },
          { id: 'cargo', label: 'Cargo', width: 2 },
          { id: 'nacionalidade', label: 'Nacionalidade', width: 1.5 },
        ],
      },
      { kind: 'note', id: 'nota43', text: '4.3. Informações sobre Partes Relacionadas' },
      { kind: 'table', id: 'controladoras', ref: '4.3.1', label: 'Sociedade(s) Controladora(s) (se houver):', columns: partesRelacionadas('ctrl') },
      { kind: 'table', id: 'subsidiarias', ref: '4.3.2', label: 'Sociedade(s) Subsidiária(s) (se houver):', columns: partesRelacionadas('sub') },
      {
        kind: 'choice',
        id: '4.4',
        ref: '4.4',
        text: 'Informar se a pessoa jurídica e/ou partes relatas já foi condenada administrativa ou civilmente por atos de corrupção e/ou fraude a licitações e contratos administrativos.',
        whenYes: [
          { kind: 'text', id: 'processos44', ref: '4.5', label: 'Em caso afirmativo, identificar processo, seu status e a(s) pessoa(s) envolvida(s):', multiline: true, required: true, wide: true },
        ],
        evidence: { when: 'sim', hint: 'Cópia da decisão ou certidão do processo informado no item 4.5.' },
      },
    ],
  },
  {
    id: 's5',
    number: '5',
    title: 'Informações sobre a participação societária',
    items: [
      {
        kind: 'table',
        id: 'socios',
        ref: '5.1',
        label: 'Apresente dados das pessoas físicas e/ou jurídicas que detêm participações societária na empresa. Caso haja alguma pessoa jurídica na lista de sócios, indique seus beneficiários finais, até o nível em que haja somente pessoas físicas. A seção da participação, quando somada, deverá resultar em 100% (cem por cento).',
        required: true,
        percentColumn: 'participacao',
        columns: [
          { id: 'nome', label: 'Nome / Razão Social', width: 3 },
          { id: 'nacionalidade', label: 'Nacionalidade', width: 1.5 },
          { id: 'documento', label: 'CPF / CNPJ', width: 2 },
          { id: 'participacao', label: 'Participação (%)', width: 1.2 },
        ],
      },
      {
        kind: 'choice',
        id: '5.2',
        ref: '5.2',
        text: 'Informar se houve condenações criminais, processos criminais ou investigações criminais relacionadas aos sócios por atos de corrupção e/ou fraude a licitações e contratos administrativo:',
        whenYes: [
          { kind: 'text', id: 'processos52', ref: '5.3', label: 'Em caso afirmativo, identificar processo, seu status e a(s) pessoa(s) envolvida(s):', multiline: true, required: true, wide: true },
        ],
        evidence: { when: 'sim', hint: 'Cópia da decisão, denúncia ou certidão do processo informado no item 5.3.' },
      },
    ],
  },
  {
    id: 's6',
    number: '6',
    title: 'Informações financeiras',
    items: [
      {
        kind: 'choice',
        id: '6.1',
        ref: '6.1',
        text: 'A pessoa jurídica possui demonstração financeira auditada?',
        evidence: { when: 'sim', hint: 'Demonstração financeira mais recente com o parecer do auditor independente.' },
      },
    ],
  },
  {
    id: 's7',
    number: '7',
    title: 'Sobre as interações com a administração pública distrital, nacional ou estrangeira',
    items: [
      {
        kind: 'choice',
        id: '7.1',
        ref: '7.1',
        text: 'A pessoa jurídica exerce uma atividade regulada? Exemplos: Atividade junto à SUSEP, ANEEL, ANATEL, ANP, ARPE, ANTAQ, ANAC, entre outros.',
        whenYes: [
          {
            kind: 'table',
            id: 'entesReguladores',
            label: 'Caso a resposta seja "sim", indicar o ente regulador abaixo:',
            required: true,
            columns: [
              { id: 'ente', label: 'Ente Regulador', width: 2 },
              { id: 'atividade', label: 'Atividade a ser desempenhada', width: 4 },
            ],
          },
        ],
        evidence: { when: 'sim', hint: 'Autorização, outorga ou registro vigente junto ao ente regulador.' },
      },
      {
        kind: 'choice',
        id: '7.2',
        ref: '7.2',
        text: 'Informar se são necessárias autorizações, licenças, anotações de responsabilidade técnica, registro de responsabilidade técnica ou permissões para o exercício das atividades da pessoa jurídica e os órgãos responsáveis pelas respectivas emissões.',
        whenYes: [
          {
            kind: 'table',
            id: 'licencas',
            label: 'Caso a resposta seja "sim", indicar os órgãos responsáveis pelas respectivas emissões:',
            required: true,
            columns: [
              { id: 'registro', label: 'Registro (tipo e número)', width: 3 },
              { id: 'orgao', label: 'Órgão responsável pela emissão', width: 2 },
              { id: 'inicio', label: 'Data de Início', mask: 'date', width: 1.3 },
              { id: 'termino', label: 'Data de Término', mask: 'date', width: 1.3 },
            ],
          },
        ],
        evidence: { when: 'sim', hint: 'Cópia de cada licença, autorização, ART/RRT ou registro listado — uma evidência por linha.', perRowOf: 'licencas' },
      },
      {
        kind: 'choice',
        id: '7.3',
        ref: '7.3',
        text: 'É esperado obter (ou alterar ou renovar) qualquer tipo de autorização, licença, registros ou permissão de órgãos governamentais e/ou junto a agente público e/ou pessoa politicamente exposta em decorrência do objeto contratual?',
        whenYes: [
          {
            kind: 'table',
            id: 'autorizacoesEsperadas',
            label: 'Caso a resposta seja "sim", forneça as informações abaixo:',
            required: true,
            columns: [
              { id: 'numero', label: 'Autorização / Licença (número)', width: 2.5 },
              { id: 'orgao', label: 'Órgão Governamental / Agente Público / Pessoa Politicamente Exposta', width: 3 },
              { id: 'inicio', label: 'Data de Início', mask: 'date', width: 1.3 },
              { id: 'termino', label: 'Data de Término', mask: 'date', width: 1.3 },
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: '7.4',
        ref: '7.4',
        text: 'É esperado qualquer tipo de interação com órgão governamental e/ou agente público e/ou pessoal politicamente exposta em em decorrência do objeto contratual?',
        whenYes: [
          { kind: 'table', id: 'interacoes', label: 'Caso a resposta seja "sim", forneça as informações abaixo:', required: true, columns: orgaoAtividade },
        ],
      },
      {
        kind: 'choice',
        id: '7.5',
        ref: '7.5',
        text: 'Informar se é esperado agenciamento, corretagem, intermediação e todas as atividades que importem representação de Suape perante quaisquer terceiros, sejam eles pessoas físicas ou jurídicas, Agentes Públicos, Pessoas Politicamente em decorrência do objeto contratual.',
        whenYes: [
          { kind: 'table', id: 'intermediacoes', label: 'Caso a resposta seja "sim", forneça as informações abaixo:', required: true, columns: orgaoAtividade },
        ],
      },
      {
        kind: 'choice',
        id: '7.6',
        ref: '7.6',
        text: 'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta?',
        whenYes: [
          {
            kind: 'table',
            id: 'peps',
            label: 'Caso a resposta seja "sim", forneça as informações abaixo:',
            required: true,
            columns: [
              { id: 'nome', label: 'Nome Completo', width: 3 },
              { id: 'cargo', label: 'Cargo público, cargo político ou candidatura', width: 2.5 },
              { id: 'entidade', label: 'Entidade pública ou partido político', width: 2.5 },
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: '7.7',
        ref: '7.7',
        text: 'Algum familiar do sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é considerado Pessoa Politicamente Exposta?',
        whenYes: [
          {
            kind: 'table',
            id: 'familiaresPep',
            label: 'Caso a resposta seja "sim", forneça as informações abaixo:',
            required: true,
            columns: [
              { id: 'nome', label: 'Nome Completo', width: 2.5 },
              { id: 'parentesco', label: 'Grau de Parentesco', width: 1.5 },
              { id: 'cargo', label: 'Cargo público, cargo político ou candidatura', width: 2 },
              { id: 'entidade', label: 'Entidade pública ou partido político', width: 2 },
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: '7.8',
        ref: '7.8',
        text: 'Algum sócio/acionista, administrador, representante legal, diretor, membro do conselho de administração é familiar de alguma Pessoa com Influência Relevante da Empresa Suape?',
        whenYes: [
          {
            kind: 'table',
            id: 'familiaresSuape',
            label: 'Caso a resposta seja "sim", forneça as informações abaixo:',
            required: true,
            columns: [
              { id: 'nome', label: 'Nome Completo', width: 2.5 },
              { id: 'colaborador', label: 'Nome do Colaborador', width: 2.5 },
              { id: 'cargoColaborador', label: 'Cargo do Colaborador', width: 1.8 },
              { id: 'parentesco', label: 'Grau de Parentesco', width: 1.5 },
            ],
          },
        ],
      },
      {
        kind: 'choice',
        id: '7.9',
        ref: '7.9',
        text: 'Alguma pessoa, entidade, governo ou agência de governo possui algum direito de gestão ou interesse financeiro ou societário nos negócios da empresa?',
        whenYes: [
          { kind: 'text', id: 'controleExterno', label: 'Caso a resposta aos subtópico "7.9" tenha sido "sim", descreva a extensão do controle de gestão ou interesse financeiro ou societário:', multiline: true, required: true, wide: true },
        ],
      },
    ],
  },
  {
    id: 's8',
    number: '8',
    title: 'Informações do programa de integridade',
    items: [
      {
        kind: 'choice',
        id: '8.1',
        ref: '8.1',
        text: 'A pessoa jurídica possui um Programa de Integridade estruturado com o objetivo de detectar e sanar desvios, fraudes, corrupção, irregularidades e atos ilícitos praticados?',
        evidence: { when: 'sim', hint: 'Documento do Programa de Integridade ou link público para acessá-lo.' },
      },
      {
        kind: 'choice',
        id: '8.2',
        ref: '8.2',
        text: 'A pessoa jurídica possui um Código de Ética que abranja questões de ética profissional e empresarial, política anticorrupção, que proíba e condene o pagamento de comissões, propina ou qualquer outra forma de suborno ou vantagem indevidas a Agentes Públicos; ou documento similar que almeje esses propósitos?',
        evidence: { when: 'sim', hint: 'Código de Ética (ou documento similar) ou link público para acessá-lo.' },
      },
      {
        kind: 'choice',
        id: '8.3',
        ref: '8.3',
        text: 'Os documentos mencionados nos itens 8.1 e 8.2 mencionam a possibilidade de aplicação de sanções para aqueles que cometerem violações independentemente do cargo ou função ocupada pelo infrator?',
        evidence: { when: 'sim', hint: 'Indique o documento e o trecho (capítulo, item ou página) que trata do assunto, ou anexe o trecho.', accepts: ['file', 'link', 'reference'] },
      },
      {
        kind: 'choice',
        id: '8.4',
        ref: '8.4',
        text: 'Os documentos mencionados nos itens 8.1 e 8.2 tratam do oferecimento de presentes, brindes e hospitalidades (refeições, entretenimento, viagem e hospedagem) a agentes públicos?',
        evidence: { when: 'sim', hint: 'Indique o documento e o trecho (capítulo, item ou página) que trata do assunto, ou anexe o trecho.', accepts: ['file', 'link', 'reference'] },
      },
      {
        kind: 'choice',
        id: '8.5',
        ref: '8.5',
        text: 'Os documentos mencionados nos itens 8.1 e 8.2 tratam da prevenção de conflito de interesses, inclusive nas relações com a Administração Pública e seus agentes?',
        evidence: { when: 'sim', hint: 'Indique o documento e o trecho (capítulo, item ou página) que trata do assunto, ou anexe o trecho.', accepts: ['file', 'link', 'reference'] },
      },
      {
        kind: 'choice',
        id: '8.6',
        ref: '8.6',
        text: 'Nos documentos mencionados nos itens 8.1 e 8.2 há orientações quanto ao acompanhamento da execução dos contratos celebrados com a Administração Pública?',
        evidence: { when: 'sim', hint: 'Indique o documento e o trecho (capítulo, item ou página) que trata do assunto, ou anexe o trecho.', accepts: ['file', 'link', 'reference'] },
      },
      {
        kind: 'choice',
        id: '8.7',
        ref: '8.7',
        text: 'Os membros da alta administração participaram de ações de capacitação (treinamento, palestra, congresso, cursos, etc) referente à cultura de integridade?',
        evidence: { when: 'sim', hint: 'Lista de presença, certificado ou material da capacitação da alta administração.' },
      },
      {
        kind: 'choice',
        id: '8.8',
        ref: '8.8',
        text: 'Existe plano de comunicação e plano de treinamento relacionados ao programa de integridade?',
        evidence: { when: 'sim', hint: 'Plano de comunicação e/ou plano de treinamento vigente.' },
      },
      {
        kind: 'choice',
        id: '8.9',
        ref: '8.9',
        text: 'Existem controles para verificar a participação dos empregados nos treinamentos?',
        evidence: { when: 'sim', hint: 'Exemplo de controle: lista de presença, relatório de conclusão ou registro em sistema.' },
      },
      {
        kind: 'choice',
        id: '9.0',
        ref: '9.0',
        text: 'A sociedade possui um profissional ou órgão colegiado responsável por um programa ou políticas anticorrupção? (Ex.: Compliance Officer, Diretor de Compliance ou Equivalente)',
        whenYes: [
          { kind: 'text', id: 'responsavelIntegridade', ref: '9.1', label: 'Em caso afirmativo, favor identifica o profissional/órgão em questão, informando também suas competências, experiência profissional, responsabilidades e dados de contato.', multiline: true, required: true, wide: true },
        ],
        evidence: { when: 'sim', hint: 'Ato de nomeação, organograma ou regimento que formalize o profissional ou órgão responsável.' },
      },
      {
        kind: 'note',
        id: 'nota92',
        text: 'Nos casos das avaliações forem classificadas como nível ALTO e/ou MUITO ALTO, responder os itens 9.2 e 9.3, caso não, ir para o item 9.4.',
      },
      {
        kind: 'registries',
        id: 'cadastros',
        ref: '9.2',
        gate: 'riscoAltoOuMuitoAlto',
        text: 'A empresa e qualquer das pessoas listadas nos tópicos "4" e "5" ou as sociedades listadas no tópico "6" e seus administradores foram ou estão citadas em qualquer dos cadastros / listas abaixo? Indique, caso a resposta seja afirmativa, marcando o campo disponibilizado.',
        detail: { kind: 'text', id: 'cadastrosDetalhe', ref: '9.3', label: 'Em caso afirmativo a qualquer um dos itens acima, forneça informações adicionais que julgar relevantes:', multiline: true, required: true, wide: true },
      },
      {
        kind: 'choice',
        id: '9.4',
        ref: '9.4',
        text: 'A pessoa jurídica possui um programa, política ou ações de adequação a LGPD - Lei geral de Proteção de Dados?',
        whenYes: [
          { kind: 'text', id: 'lgpdDetalhe', label: 'Caso a resposta seja "sim", forneça as informações abaixo:', multiline: true, wide: true },
        ],
        evidence: { when: 'sim', hint: 'Política de privacidade ou de proteção de dados, ou link público para ela.' },
      },
      {
        kind: 'choice',
        id: '9.5',
        ref: '9.5',
        text: 'A pessoa jurídica dispõe de política ou procedimento em vigor para evitar e monitorar eventuais violações aos Direitos Humanos?',
        whenYes: [
          { kind: 'text', id: 'direitosHumanosDetalhe', label: 'Caso a resposta seja "sim", forneça as informações abaixo:', multiline: true, wide: true },
        ],
        evidence: { when: 'sim', hint: 'Política ou procedimento de Direitos Humanos em vigor, ou link público para ele.' },
      },
      {
        kind: 'choice',
        id: '9.6',
        ref: '9.6',
        text: 'A pessoa jurídica dispõe de política ou procedimento em vigor relacionados a Diversidade e Inclusão?',
        whenYes: [
          { kind: 'text', id: 'diversidadeDetalhe', label: 'Caso a resposta seja "sim", forneça as informações abaixo:', multiline: true, wide: true },
        ],
        evidence: { when: 'sim', hint: 'Política ou procedimento de Diversidade e Inclusão em vigor, ou link público para ele.' },
      },
    ],
  },
];

export const DECLARATION_TEXT = [
  'Declaro de pleno conhecimento que as informações acima fornecidas e os documentos disponibilizados quando solicitados são verdadeiros em sua íntegra e representam a divulgação completa das informações relevantes para este procedimento de diligência.',
  'Se, em algum momento, as informações ou documentos apresentados neste questionário deixarem de ser condizentes com a realidade, comprometo-me comunicar imediatamente a Suape e fornecer relatório complementar detalhando referida mudança, no prazo máximo de 10 (dez) dias corridos.',
  'Declaro ainda, que conheço o disposto no Código de Ética e Conduta, que integra o Programa de Integridade, Gestão de Riscos e Controles Internos de Suape, acessado pelo site de Suape http://www.suape.pe.gov.br/images/institucional/lei-13303/Programa_de_Integridade_Gestao_de_Riscos_e_Controles_Internos_de_Suape_2018_-_ATUALIZADO_DEZEMBRO_2020.pdf, comprometendo-me a observar e cumprir fielmente as regras dos referidos instrumentos na sua integralidade, no âmbito da execução do Contrato e toda sua vigência.',
];

/** Campos da seção 10, assinada pelo representante. */
export const DECLARATION_FIELDS: TextFieldDef[] = [
  { kind: 'text', id: 'declaracaoLocalData', label: 'Local e Data', required: true, placeholder: 'Ipojuca, 11 de setembro de 2026' },
  { kind: 'text', id: 'declaracaoNome', label: 'Nome por extenso', required: true },
  { kind: 'text', id: 'declaracaoCargo', label: 'Cargo', required: true },
];

/** Todas as perguntas Sim/Não, na ordem do questionário. */
export const ALL_CHOICES: ChoiceDef[] = QUESTIONNAIRE_SECTIONS.flatMap((section) =>
  section.items.filter((item): item is ChoiceDef => item.kind === 'choice'),
);

/** Tipos de arquivo aceitos como evidência: os que entram no PDF final. */
export const EVIDENCE_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
export const EVIDENCE_MAX_BYTES = 15 * 1024 * 1024;
