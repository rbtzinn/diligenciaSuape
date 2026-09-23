// ==========================================================
// DILIGÊNCIA 360 — Nota Técnica de Compliance
// ==========================================================
// Monta a nota nos modelos da Assessoria Especial de Compliance de
// SUAPE. Função pura: o que depende do questionário preenchido pelo
// fornecedor (itens 4.4, 5.2, 7.x e declarações de integridade) vem do
// analista; a pesquisa
// reputacional e as consultas a cadastros vêm do que as fontes desta
// diligência responderam.
//
// O nível sai das respostas, como nas notas (124, 154, 155 e 156/2026):
// 4.4 ou 5.2 positivo (condenação ou investigação por corrupção ou
// fraude) é Risco Muito Alto; 7.1 positivo (atividade regulada) é Risco
// Alto; só 7.2 positivo (licenças, ART/RRT) é Risco Médio; nenhum deles
// é Risco Baixo. Cada nível tem sua estrutura: pesquisa reputacional e
// recomendações só existem no Alto e no Muito Alto, e Baixo e Médio
// terminam com o arquivamento do processo.
//
// A frase "não foram identificadas ocorrências" só aparece quando a
// fonte respondeu e não trouxe nada. Fonte que falhou vira ressalva no
// texto, e achado vira menção explícita: a nota não pode dizer menos
// do que o dossiê mostra.
// ==========================================================

import type { DiligenceItem } from '../types';
import { deriveSourceCoverage, type SourceCoverageItem } from '../components/dossier/sourceCoverage';

export type RiskLevel = 'BAIXO' | 'MEDIO' | 'ALTO' | 'MUITO_ALTO';

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  BAIXO: 'Risco Baixo',
  MEDIO: 'Risco Médio',
  ALTO: 'Risco Alto',
  MUITO_ALTO: 'Risco Muito Alto',
};

/** Resposta a uma declaração de integridade; `omitir` a deixa fora do texto. */
export type IntegrityAnswer = 'sim' | 'nao' | 'omitir';

export type IntegrityItem = 'programa' | 'codigo' | 'treinamento' | 'comite' | 'responsavel';

export const INTEGRITY_ITEMS: Array<{ id: IntegrityItem; label: string; sim: string; nao: string }> = [
  {
    id: 'programa',
    label: 'Programa de integridade',
    sim: 'possuir programa de integridade',
    nao: 'não possuir um Programa de Integridade estruturado',
  },
  {
    id: 'codigo',
    label: 'Código de Ética',
    sim: 'possuir Código de Ética',
    nao: 'não possuir Código de Ética',
  },
  {
    id: 'treinamento',
    label: 'Treinamento da alta administração / gestão societária',
    sim: 'conduzir treinamento para a alta administração',
    nao: 'não ter conduzido treinamento para gestão societária',
  },
  {
    id: 'comite',
    label: 'Comitê de Ética para denúncias',
    sim: 'possuir Comitê de Ética responsável pelo recebimento, apuração e deliberação sobre eventuais denúncias',
    nao: 'não possuir Comitê de Ética responsável pelo recebimento e apuração de denúncias',
  },
  {
    id: 'responsavel',
    label: 'Profissional responsável pelo programa anticorrupção',
    sim: 'possuir profissional responsável por programa ou política anticorrupção',
    nao: 'não possuir profissional responsável por um programa ou política anticorrupção',
  },
];

export interface TechnicalNoteForm {
  numero: string;
  ano: string;
  cidade: string;
  /** Data no formato AAAA-MM-DD, como vem do `<input type="date">`. */
  data: string;
  empresa: string;
  /** Complemento da ementa: "empresa especializada em …". */
  objeto: string;
  /** Item 4.4: condenação administrativa ou civil da empresa por corrupção ou fraude em licitações. */
  respondeuItem44: boolean;
  /** Item 5.2: condenação, processo ou investigação criminal de sócios por corrupção ou fraude. */
  respondeuItem52: boolean;
  /** Item 7.1 respondido positivamente: exerce atividade regulada. */
  respondeuItem71: boolean;
  /** Item 7.1: órgãos reguladores e atividade, após "perante". */
  atividadeRegulada: string;
  /** Item 7.2 respondido positivamente: precisa de licenças, autorizações, ART/RRT. */
  respondeuItem72: boolean;
  /** Licenças destacadas, após "Destaca-se". Opcional. */
  licencasDestacadas: string;
  /** Item 7.4: interação com órgãos governamentais ou agentes públicos. */
  respondeuItem74: boolean;
  integridade: Record<IntegrityItem, IntegrityAnswer>;
  declarouSemCondenacoes: boolean;
  /** Achados da análise documental, um parágrafo por bloco. Opcional. */
  observacoes: string;
  /** Texto da pesquisa ajustado à mão. Vazio usa o texto automático. */
  pesquisaAjustada: string;
  signatario: string;
  cargo: string;
}

export interface TechnicalNote {
  nivel: RiskLevel;
  titulo: string;
  local: string;
  ementa: string;
  paragrafos: string[];
  recomendacoes: string[];
  fecho: string;
  assinatura: { nome: string; cargo: string; unidade: string };
  rodape: string[];
}

export interface ResearchSummary {
  texto: string;
  /** Pontos que o analista precisa resolver antes de assinar. */
  alertas: string[];
}

const UNIDADE = 'SUAPE - ASSESSORIA ESPECIAL DE COMPLIANCE';
const CANAL_DENUNCIA = 'http://www.suape.pe.gov.br/pt/canal-de-denuncia';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Bases em que um resultado é apontamento, e não só presença. */
const BASES_DE_APONTAMENTO = new Set([
  'ceis', 'cnep', 'sancoes-pessoas', 'pep', 'judicial', 'tce-pe', 'offshore',
]);

export const DEFAULT_SIGNATORY = {
  signatario: 'Karla Taciana Sabino de Paula Sales',
  cargo: 'Assessora Especial de Compliance',
};

function todayIso(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function defaultTechnicalNoteForm(diligence: DiligenceItem, now = new Date()): TechnicalNoteForm {
  return {
    numero: '',
    ano: String(now.getFullYear()),
    cidade: 'Ipojuca',
    data: todayIso(now),
    empresa: diligence.razaoSocial || diligence.empresa?.razao_social || '',
    objeto: '',
    respondeuItem44: false,
    respondeuItem52: false,
    respondeuItem71: false,
    atividadeRegulada: '',
    respondeuItem72: false,
    licencasDestacadas: '',
    respondeuItem74: false,
    integridade: {
      programa: 'omitir',
      codigo: 'omitir',
      treinamento: 'omitir',
      comite: 'omitir',
      responsavel: 'omitir',
    },
    declarouSemCondenacoes: false,
    observacoes: '',
    pesquisaAjustada: '',
    ...DEFAULT_SIGNATORY,
  };
}

export function formatNoteDate(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} de ${MESES[Number(month) - 1]} de ${year}`;
}

function listar(itens: string[]): string {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function semPontoFinal(texto: string): string {
  return texto.trim().replace(/[.;\s]+$/, '');
}

function lacuna(texto: string, marcador: string): string {
  const limpo = semPontoFinal(texto);
  return limpo || `[${marcador}]`;
}

/**
 * Parágrafo das pesquisas exigidas pelos itens 3.3.2 e 3.3.3 da Política,
 * escrito a partir do que a diligência de fato consultou.
 */
export function buildResearchParagraph(diligence: DiligenceItem): ResearchSummary {
  const alertas: string[] = [];
  const abertura = 'Em atendimento a essas disposições, foi realizada pesquisa reputacional envolvendo a empresa e as pessoas a ela relacionadas, mediante utilização de palavras-chave como “fraude”, “corrupção” e “improbidade administrativa”';

  const media = diligence.adverseMedia;
  const mediaResults = (media?.results || []).filter(
    (item) => item.status !== 'discarded' && item.riskRelevant !== false,
  );
  const pendentes = mediaResults.filter((item) => item.status === 'candidate').length;
  let reputacional: string;
  if (!media || media.coverageStatus === 'UNAVAILABLE' || media.ok === false) {
    reputacional = `${abertura}, não tendo sido possível concluir a consulta às fontes de notícias nesta diligência`;
    alertas.push('A pesquisa reputacional não foi concluída. Refaça a consulta de notícias ou ajuste o texto.');
  } else if (mediaResults.length === 0) {
    reputacional = `${abertura}, não tendo sido identificadas ocorrências envolvendo a referida empresa`;
  } else {
    reputacional = `${abertura}, tendo sido identificada(s) ${mediaResults.length} ocorrência(s) que constam do dossiê de diligência e foram objeto de análise por esta Unidade`;
    if (pendentes > 0) {
      alertas.push(`${pendentes} notícia(s) ainda sem revisão. Valide ou descarte cada uma antes de assinar a nota.`);
    }
  }
  if (media && (media.consultaParcial || media.deadlineExceeded) && media.coverageStatus !== 'UNAVAILABLE') {
    alertas.push('A pesquisa de notícias teve cobertura parcial nesta execução.');
  }

  const bases = deriveSourceCoverage(diligence).filter((item) => BASES_DE_APONTAMENTO.has(item.id));
  const respondidas = bases.filter((item) => item.status === 'com-achado' || item.status === 'sem-achado');
  const comAchado = bases.filter((item) => item.status === 'com-achado');
  const falharam = bases.filter((item) => item.status === 'falhou');
  const rotulos = (itens: SourceCoverageItem[]) => listar(itens.map((item) => item.label));

  let cadastros: string;
  if (respondidas.length === 0) {
    cadastros = 'Quanto às consultas em cadastros e bancos de dados, as bases não responderam nesta diligência, razão pela qual não foi possível concluir a verificação';
    alertas.push('Nenhuma base de sanções, PEP ou processos respondeu. A nota não deve ser assinada assim.');
  } else if (comAchado.length === 0) {
    cadastros = `Quanto às consultas realizadas em cadastros e bancos de dados (${rotulos(respondidas)}), não foram identificados registros, ocorrências ou apontamentos relacionados à empresa nas bases consultadas`;
  } else {
    cadastros = `Quanto às consultas realizadas em cadastros e bancos de dados (${rotulos(respondidas)}), foram identificados registros em ${rotulos(comAchado)}, os quais constam do dossiê de diligência e foram objeto de análise por esta Unidade`;
    alertas.push(`Há registros em ${rotulos(comAchado)}. Confirme se o enquadramento em Risco Alto e as recomendações seguem adequados.`);
  }
  if (falharam.length > 0) {
    cadastros += `, ressalvando-se que ${falharam.length === 1 ? 'a base' : 'as bases'} ${rotulos(falharam)} não ${falharam.length === 1 ? 'respondeu' : 'responderam'} no momento da consulta`;
    alertas.push(`${rotulos(falharam)} não ${falharam.length === 1 ? 'respondeu' : 'responderam'}. A ressalva já está no texto.`);
  }

  return { texto: `${reputacional}. ${cadastros}.`, alertas };
}

/** Nível pelas respostas do questionário, como a Política classifica. */
export function classifyByQuestionnaire(
  form: Pick<TechnicalNoteForm, 'respondeuItem44' | 'respondeuItem52' | 'respondeuItem71' | 'respondeuItem72'>,
): RiskLevel {
  if (form.respondeuItem44 || form.respondeuItem52) return 'MUITO_ALTO';
  if (form.respondeuItem71) return 'ALTO';
  if (form.respondeuItem72) return 'MEDIO';
  return 'BAIXO';
}

function integrityParagraph(form: TechnicalNoteForm): string | null {
  const empresa = lacuna(form.empresa, 'EMPRESA');
  const resposta = form.integridade;
  const frases: string[] = [];
  for (const item of INTEGRITY_ITEMS) {
    const valor = resposta[item.id];
    if (valor === 'omitir') continue;
    // "possuir programa de integridade e Código de Ética", como na nota 154.
    if (item.id === 'codigo' && valor === 'sim' && resposta.programa === 'sim') {
      frases[frases.length - 1] = 'possuir programa de integridade e Código de Ética';
      continue;
    }
    frases.push(valor === 'sim' ? item.sim : item.nao);
  }
  return frases.length > 0 ? `A ${empresa} informou ${listar(frases)}.` : null;
}

const DECLARACAO_SEM_CONDENACOES = 'A empresa declarou, através do questionário de diligência, não haver condenações, processos ou investigações administrativas ou judiciais relacionadas à empresa e a seus sócios.';

const CONFORMIDADE = 'em conformidade com o disposto na Política de Contratação de Terceiros que integra o Programa de Integridade de Suape';

const CORRUPCAO_OU_FRAUDE = 'por atos de corrupção e/ou fraude em licitações e contratos administrativos';

const RECOMENDACOES_ALTO = [
  'A) Que o Diretor e o Gestor da área demandante assinem a Declaração de Gestão de Contratos com Terceiros de Risco Alto;',
  'B) Que a pessoa responsável pela Gestão do Contrato e os respectivos fiscais, caso ainda não o tenham feito, participem de treinamentos relacionados aos riscos apresentados por terceiros classificados como Risco Alto, bem como aos procedimentos adequados para prevenção e detecção de situações de fraude e corrupção;',
  'C) Que, durante a execução contratual, sejam observadas a manutenção e a regularidade das licenças, autorizações, registros e demais instrumentos necessários ao exercício das atividades relacionadas ao objeto contratado;',
  'D) Que sejam realizadas atualizações periódicas da diligência durante a vigência contratual e realização de nova análise em situações como: prorrogação, acréscimo de valor, alteração de objeto, mudança societária, mídia adversa relevante, processo sancionador, mudança de beneficiário final.',
];

function recomendacoesMuitoAlto(form: TechnicalNoteForm): string[] {
  const condenacoes = form.respondeuItem52 ? 'as condenações criminais' : 'as condenações';
  return [
    'A) Que o Diretor Executivo da área demandante e o Gestor do Contrato assinem a Declaração de Gestão de Contratos com Terceiros de Risco Muito Alto;',
    'B) Que o Gestor do Contrato e o respectivo Fiscal participem de treinamentos em relação ao risco apresentado por este terceiro, adotando procedimentos adequados para prevenção, identificação e comunicação de eventuais indícios de fraude e corrupção;',
    'C) Que seja avaliada a possibilidade de solicitação de atuação da Auditoria Interna para acompanhamento da execução contratual, observadas as competências institucionais;',
    'D) Que o terceiro seja incluído no Mapa de Risco de Terceiros, em conformidade com a Política de Contratação de Terceiros de SUAPE;',
    'E) Que seja exigida a apresentação do Programa de Integridade da empresa no momento da contratação;',
    `F) Que a Diretoria Jurídica verifique se ${condenacoes} declaradas pela empresa ensejam impedimento legal à sua contratação pela Administração Pública, à luz da legislação e dos normativos aplicáveis.`,
  ];
}

/** Agravantes dos itens 7.x, citados no enquadramento do Muito Alto. */
function agravantesItem7(form: TechnicalNoteForm): string {
  const atividade = semPontoFinal(form.atividadeRegulada);
  const achados: Array<[string, string]> = [];
  if (form.respondeuItem71) achados.push(['7.1', atividade ? `exerce atividade regulada perante ${atividade}` : 'exerce atividade regulada']);
  if (form.respondeuItem72) achados.push(['7.2', 'necessita de autorizações e licenças para o exercício de suas atividades']);
  if (form.respondeuItem74) achados.push(['7.4', 'mantém interação com órgãos governamentais e/ou agentes públicos em decorrência de suas atividades']);
  if (achados.length === 0) return '';
  const varios = achados.length > 1;
  return ` Também ${varios ? 'foram identificadas respostas afirmativas aos itens' : 'foi identificada resposta afirmativa ao item'} ${listar(achados.map(([item]) => item))}, indicando que a empresa ${listar(achados.map(([, frase]) => frase))}, ${varios ? 'circunstâncias que demandam' : 'circunstância que demanda'} maior atenção quanto ao acompanhamento da execução contratual.`;
}

function enquadramentoParagraph(nivel: RiskLevel, form: TechnicalNoteForm, empresa: string): string {
  const destaque = semPontoFinal(form.licencasDestacadas);
  const comDestaque = (texto: string) => (form.respondeuItem72 && destaque ? `${texto} Destaca-se ${destaque}.` : texto);

  if (nivel === 'BAIXO') {
    return `Diante da análise do questionário de diligência, verificou-se que as respostas da ${empresa} não a classificaram com aparente Risco Médio, Risco Alto ou Risco Muito Alto de Integridade.`;
  }
  if (nivel === 'MEDIO') {
    return comDestaque(`Após análise do formulário, verificamos que a ${empresa} respondeu positivamente ao item 7.2. A Política de Contratação de Terceiros de Suape classifica no grupo de aparente MÉDIO RISCO DE INTEGRIDADE os casos em que são necessárias autorizações, licenças, anotações de responsabilidade técnica, registro de responsabilidade técnica ou permissões para o exercício das atividades da pessoa jurídica.`);
  }
  if (nivel === 'MUITO_ALTO') {
    const itens = [
      [form.respondeuItem44, '4.4'],
      [form.respondeuItem52, '5.2'],
      [form.respondeuItem71, '7.1'],
      [form.respondeuItem72, '7.2'],
      [form.respondeuItem74, '7.4'],
    ].filter(([marcado]) => marcado).map(([, item]) => item as string);
    const socios = `a existência de condenações, processos criminais ou investigações criminais relacionadas aos sócios ${CORRUPCAO_OU_FRAUDE}`;
    const motivo = form.respondeuItem44
      ? `por declarar a existência de condenação administrativa ou civil ${CORRUPCAO_OU_FRAUDE}`
      : `por informar ${socios}`;
    let texto = `Da análise do Questionário de Diligência, verificou-se que a empresa assinalou positivamente ${itens.length > 1 ? 'os itens' : 'o item'} ${listar(itens)}, e a pessoa jurídica foi enquadrada como RISCO MUITO ALTO DE INTEGRIDADE, nos termos da Política de Contratação de Terceiros de SUAPE, ${motivo}.`;
    if (form.respondeuItem44 && form.respondeuItem52) {
      texto += ` Adicionalmente, a empresa respondeu positivamente ao item 5.2, informando ${socios}.`;
    }
    return comDestaque(texto + agravantesItem7(form));
  }
  let texto = `Diante da análise do Questionário de Diligência, verificou-se que a empresa respondeu positivamente ao item 7.1, afirmando que exerce atividade regulada perante ${lacuna(form.atividadeRegulada, 'ÓRGÃOS REGULADORES E ATIVIDADE')}. Tal enquadramento, nos termos da Política de Contratação de Terceiros, resulta na elevação do perfil de integridade da empresa para Risco Alto de Integridade.`;
  if (form.respondeuItem72) {
    texto += ' Adicionalmente, a empresa manifestou conformidade com o item 7.2, ratificando a manutenção das licenças e autorizações necessárias ao exercício de suas atividades.';
  }
  return comDestaque(texto);
}

/** Pesquisa reputacional e cadastros: exigida pelos itens 3.3.2 e 3.3.3 no Alto e no Muito Alto. */
function exigePesquisa(nivel: RiskLevel): boolean {
  return nivel === 'ALTO' || nivel === 'MUITO_ALTO';
}

export function buildTechnicalNote(form: TechnicalNoteForm, diligence: DiligenceItem): TechnicalNote {
  const nivel = classifyByQuestionnaire(form);
  const empresa = lacuna(form.empresa, 'EMPRESA');
  const numero = form.numero.trim() || '___';
  const ano = form.ano.trim() || String(new Date().getFullYear());

  const ementaObjeto = semPontoFinal(form.objeto);
  const ementa = `Política de Contratação de Terceiros. Contratação da empresa ${empresa}${ementaObjeto ? `, ${ementaObjeto}` : ''}.`;

  // Texto das notas 155 e 156, as mais recentes, com o nome atual da CPL.
  const abertura = `Trata-se de Questionário de Diligência enviado pela Coordenadoria de Gestão e Licitações – CPL, por meio eletrônico, que integra o anexo A da Política de Contratação de Terceiros, preenchido pela empresa ${empresa}. As informações prestadas pela referida empresa, quando do preenchimento do formulário, foram objeto de análise por esta Unidade de Compliance, como forma orientativa, a fim de permitir às áreas responsáveis a avaliação da pessoa jurídica em questão, buscando identificar eventuais riscos existentes e seu enquadramento nos grupos de terceiros de Risco Baixo, Risco Médio, Risco Alto e Risco Muito Alto.`;

  const paragrafos = [abertura, enquadramentoParagraph(nivel, form, empresa)];

  if (exigePesquisa(nivel)) {
    const pesquisa = semPontoFinal(form.pesquisaAjustada)
      ? `${semPontoFinal(form.pesquisaAjustada)}.`
      : buildResearchParagraph(diligence).texto;
    paragrafos.push(`A Política de Contratação de Terceiros de SUAPE estabelece que, nos casos em que o terceiro seja classificado como aparente Risco Muito Alto e/ou Risco Alto de Integridade, como ocorreu no presente caso, sejam realizadas pesquisas de reputação, utilizando o nome da instituição, de seus diretores e demais beneficiários, bem como consultas a cadastros e bancos de dados, conforme previsto nos itens 3.3.2 e 3.3.3 da mencionada Política. ${pesquisa}`);
  }

  const integridade = integrityParagraph(form);
  if (integridade) paragrafos.push(integridade);
  // No Muito Alto a própria empresa declarou condenação: a frase contradiria o enquadramento.
  if (form.declarouSemCondenacoes && nivel !== 'MUITO_ALTO') paragrafos.push(DECLARACAO_SEM_CONDENACOES);
  paragrafos.push(...form.observacoes.split(/\n\s*\n/).map((bloco) => bloco.replace(/\s+/g, ' ').trim()).filter(Boolean));

  const fechoComRecomendacoes = `Caso, durante a execução contratual, verifique-se algum fato novo, é possível reportar à Assessoria Especial de Compliance ou utilização do Canal de Denúncia através do link (${CANAL_DENUNCIA}).`;
  const fechoArquivamento = `Assim considerando, o presente processo será arquivado. Caso, durante a execução contratual, verifique-se algum fato novo, se faz necessário reportar à Unidade de Compliance ou utilização do Canal de Denúncia através do link (${CANAL_DENUNCIA}).`;

  let recomendacoes: string[] = [];
  let fecho = fechoArquivamento;
  if (nivel === 'MUITO_ALTO') {
    paragrafos.push(
      'Diante do exposto, a Assessoria Especial de Compliance COMUNICA que, em conformidade com a análise realizada e com o disposto na Política de Contratação de Terceiros que integra o Programa de Integridade de SUAPE, o terceiro foi classificado com grau de RISCO MUITO ALTO DE INTEGRIDADE.',
      'Assim, esta Assessoria Especial de Compliance recomenda a adoção das seguintes medidas:',
    );
    recomendacoes = recomendacoesMuitoAlto(form);
    fecho = fechoComRecomendacoes;
  } else if (nivel === 'ALTO') {
    paragrafos.push(
      `Diante do exposto, através da análise realizada, a Assessoria Especial de Compliance COMUNICA que ${CONFORMIDADE}, o terceiro foi classificado com grau de RISCO ALTO. Desta forma, o terceiro será incluído no Mapa de Risco de Terceiros de Suape, bem como o trabalho da Auditoria Interna poderá ser solicitado durante a execução do Contrato.`,
      'Assim considerando, a Assessoria Especial de Compliance orienta que sejam adotadas as seguintes recomendações:',
    );
    recomendacoes = RECOMENDACOES_ALTO;
    fecho = fechoComRecomendacoes;
  } else if (nivel === 'MEDIO') {
    paragrafos.push(
      `Diante do exposto, a Unidade de Compliance comunica que, através da análise realizada, ${CONFORMIDADE}, o terceiro foi classificado com grau de RISCO MÉDIO DE INTEGRIDADE.`,
    );
  } else {
    paragrafos.push(
      `Diante do exposto, esta Assessoria comunica que, através da análise realizada, ${CONFORMIDADE}, o terceiro foi classificado com grau de RISCO BAIXO DE INTEGRIDADE.`,
      'Sem prejuízo da classificação atribuída e considerando as informações prestadas no Questionário de Diligência, esta Assessoria Especial de Compliance recomenda que o gestor do contrato e a área demandante mantenham o acompanhamento regular da execução contratual, observando o cumprimento das obrigações pactuadas e dos princípios de integridade aplicáveis às contratações de SUAPE. Recomenda-se, ainda, que eventuais fatos supervenientes que possam impactar a avaliação de integridade da contratada sejam prontamente comunicados a esta Assessoria, a fim de possibilitar a adoção das medidas cabíveis e a atualização da análise de riscos, quando necessário.',
    );
  }

  return {
    nivel,
    titulo: `NOTA TÉCNICA - SUAPE - ASSESSORIA ESPECIAL DE COMPLIANCE - Nº ${numero}/${ano}`,
    local: `${form.cidade.trim() || 'Ipojuca'}, ${formatNoteDate(form.data)}`,
    ementa,
    paragrafos,
    recomendacoes,
    fecho,
    assinatura: {
      nome: form.signatario.trim() || '[NOME DO SIGNATÁRIO]',
      cargo: form.cargo.trim() || '[CARGO]',
      unidade: UNIDADE,
    },
    rodape: [
      'COMPLEXO INDUSTRIAL PORTUÁRIO GOVERNADOR ERALDO GUEIROS',
      'Rodovia Indonésia, s/nº, - Bairro Distrito Industrial de Ipojuca - Suape, Ipojuca/PE - CEP 55598-000, Telefone: (81) 3527-5000',
    ],
  };
}

/** Campos que ainda saem como marcador `[…]` no texto. */
export function missingFields(form: TechnicalNoteForm): string[] {
  const faltando: string[] = [];
  if (!form.numero.trim()) faltando.push('Número da nota');
  if (!form.empresa.trim()) faltando.push('Nome da empresa');
  if (classifyByQuestionnaire(form) === 'ALTO' && !form.atividadeRegulada.trim()) {
    faltando.push('Atividade regulada (item 7.1)');
  }
  if (!form.signatario.trim()) faltando.push('Signatário');
  return faltando;
}

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface NoteRenderOptions {
  /** Título e rodapé institucional. O SEI já põe os dois no documento. */
  completa?: boolean;
}

export function technicalNoteToHtml(note: TechnicalNote, { completa = false }: NoteRenderOptions = {}): string {
  const p = (texto: string, estilo = 'text-align: justify; text-indent: 1.5cm;') =>
    `<p style="${estilo}">${escapeHtml(texto)}</p>`;
  const partes: string[] = [];
  if (completa) partes.push(p(note.titulo, 'text-align: center; font-weight: bold;'));
  partes.push(p(note.local, 'text-align: right;'));
  partes.push(`<p style="text-align: justify;"><b>Ementa:</b> ${escapeHtml(note.ementa)}</p>`);
  note.paragrafos.forEach((texto) => partes.push(p(texto)));
  note.recomendacoes.forEach((texto) => partes.push(p(texto)));
  partes.push(p(note.fecho));
  partes.push(p('Atenciosamente,', 'text-align: left;'));
  partes.push(
    `<p style="text-align: center;">${escapeHtml(note.assinatura.nome)}<br>${escapeHtml(note.assinatura.cargo)}<br>${escapeHtml(note.assinatura.unidade)}</p>`,
  );
  if (completa) {
    partes.push(`<p style="text-align: center; font-size: 9pt;">${note.rodape.map(escapeHtml).join('<br>')}</p>`);
  }
  return partes.join('\n');
}

export function technicalNoteToText(note: TechnicalNote, { completa = false }: NoteRenderOptions = {}): string {
  const blocos: string[] = [];
  if (completa) blocos.push(note.titulo);
  blocos.push(note.local, `Ementa: ${note.ementa}`, ...note.paragrafos, ...note.recomendacoes, note.fecho);
  blocos.push('Atenciosamente,', [note.assinatura.nome, note.assinatura.cargo, note.assinatura.unidade].join('\n'));
  if (completa) blocos.push(note.rodape.join('\n'));
  return blocos.join('\n\n');
}
