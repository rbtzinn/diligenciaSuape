// ==========================================================
// DILIGÊNCIA 360 — Nota Técnica de Compliance
// ==========================================================
// Monta a nota nos modelos da Assessoria Especial de Compliance de
// SUAPE (notas 124, 154, 155 e 156/2026) a partir da Avaliação de
// Integridade SUAPE. Função pura.
//
// A nota não classifica nada: o nível é o `calculatedRisk` da
// avaliação, que aplica os itens 3.2.1 a 3.2.4 da Política sobre as
// respostas do questionário. Sem questionário não há classificação e,
// portanto, não há nota. As declarações de integridade saem dos itens
// 8.1, 8.2, 8.7 e 9.0, e a ausência de condenações das respostas
// negativas a 4.4 e 5.2. Do analista vêm só o que o questionário não
// traz em forma de sim/não: número, data, objeto, órgãos reguladores,
// licenças e achados da análise documental.
//
// Cada nível tem a sua estrutura: pesquisa reputacional e
// recomendações só existem no Alto e no Muito Alto, e Baixo e Médio
// terminam com o arquivamento do processo.
//
// A frase "não foram identificadas ocorrências" só aparece quando a
// fonte respondeu e não trouxe nada. Fonte que falhou vira ressalva no
// texto, cadastro não consultado fica fora da lista e vira alerta, e
// achado vira menção explícita: a nota não pode dizer menos do que o
// dossiê mostra.
// ==========================================================

import type { DiligenceItem } from '../types';
import type {
  IntegrityAnswers,
  SuapeCalculatedRisk,
  SuapeIntegrityEvaluationResult,
  SuapeIntegrityItemKey,
  SuapeRegistryCoverage,
  SuapeRegistryKey,
} from './suapeRiskMapRowGenerator';

export type RiskLevel = SuapeCalculatedRisk;

export interface TechnicalNoteForm {
  numero: string;
  ano: string;
  cidade: string;
  /** Data no formato AAAA-MM-DD, como vem do `<input type="date">`. */
  data: string;
  empresa: string;
  /** Complemento da ementa: "empresa especializada em …". */
  objeto: string;
  /** Item 7.1: órgãos reguladores e atividade, após "perante". */
  atividadeRegulada: string;
  /** Item 7.2: licenças destacadas, após "Destaca-se". Opcional. */
  licencasDestacadas: string;
  /** Achados da análise documental, um parágrafo por bloco. Opcional. */
  observacoes: string;
  /** Texto da pesquisa ajustado à mão. Vazio usa o texto automático. */
  pesquisaAjustada: string;
  signatario: string;
  cargo: string;
}

/** O que a nota lê da Avaliação de Integridade SUAPE. */
export interface TechnicalNoteSource {
  diligence: DiligenceItem;
  answers: IntegrityAnswers;
  evaluation: Pick<SuapeIntegrityEvaluationResult, 'calculatedRisk' | 'registryCoverage'>;
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

export const DEFAULT_SIGNATORY = {
  signatario: 'Karla Taciana Sabino de Paula Sales',
  cargo: 'Assessora Especial de Compliance',
};

/** Nome curto dos 8 cadastros do item 3.3.3, para caber numa frase. */
const REGISTRY_SHORT: Record<SuapeRegistryKey, string> = {
  ceis: 'CEIS',
  cnep: 'CNEP',
  cepim: 'CEPIM',
  improbidadeCnj: 'Cadastro de Improbidade Administrativa do CNJ',
  tcu: 'Inabilitados e Inidôneos do TCU',
  tcePe: 'Inabilitados e Inidôneos do TCE-PE e da SCGE',
  trabalhoEscravo: 'Cadastro de Empregadores do MTE (trabalho escravo)',
  decisoesAdversas: 'processos administrativos e judiciais',
};

/** Como cada item positivo do bloco 7 aparece no texto, após "a empresa". */
const ITEM_7_PHRASES: Partial<Record<SuapeIntegrityItemKey, string>> = {
  '7.1': 'exerce atividade regulada',
  '7.2': 'necessita de autorizações e licenças para o exercício de suas atividades',
  '7.3': 'deverá obter, alterar ou renovar autorização, licença, registro ou permissão junto a órgãos governamentais e/ou agentes públicos em decorrência do objeto contratual',
  '7.4': 'mantém interação com órgãos governamentais e/ou agentes públicos em decorrência de suas atividades',
  '7.5': 'exercerá agenciamento, corretagem, intermediação ou representação de Suape perante terceiros em decorrência do objeto contratual',
  '7.6': 'possui sócio, administrador, representante legal, diretor ou membro do conselho de administração considerado Pessoa Politicamente Exposta',
  '7.7': 'possui familiar de sócio, administrador, representante legal, diretor ou membro do conselho de administração considerado Pessoa Politicamente Exposta',
  '7.8': 'possui sócio, administrador, representante legal, diretor ou membro do conselho de administração que é familiar de Pessoa com Influência Relevante de Suape',
  '7.9': 'possui pessoa, entidade, governo ou agência de governo com direito de gestão ou interesse financeiro ou societário em seus negócios',
};

const ITENS_ALTO: SuapeIntegrityItemKey[] = ['7.1', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9'];
const ITENS_7: SuapeIntegrityItemKey[] = ['7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9'];

/** Itens do bloco 8/9 que as notas citam, com a redação de cada resposta. */
const INTEGRITY_PHRASES: Array<{ key: '8.1' | '8.2' | '8.7' | '9.0'; sim: string; nao: string }> = [
  { key: '8.1', sim: 'possuir Programa de Integridade estruturado', nao: 'não possuir um Programa de Integridade estruturado' },
  { key: '8.2', sim: 'possuir Código de Ética', nao: 'não possuir Código de Ética' },
  { key: '8.7', sim: 'ter conduzido treinamento para a alta administração', nao: 'não ter conduzido treinamento para gestão societária' },
  {
    key: '9.0',
    sim: 'possuir profissional ou órgão colegiado responsável por programa ou política anticorrupção',
    nao: 'não possuir profissional responsável por um programa ou política anticorrupção',
  },
];

const CORRUPCAO_OU_FRAUDE = 'por atos de corrupção e/ou fraude em licitações e contratos administrativos';
const CONFORMIDADE = 'em conformidade com o disposto na Política de Contratação de Terceiros que integra o Programa de Integridade de Suape';
const DECLARACAO_SEM_CONDENACOES = 'A empresa declarou, através do questionário de diligência, não haver condenações, processos ou investigações administrativas ou judiciais relacionadas à empresa e a seus sócios.';
const ALCADA_CONSELHO = 'as obrigações da contratação foram autorizadas por alçada do Conselho de Administração';

const RECOMENDACOES_ALTO = [
  'A) Que o Diretor e o Gestor da área demandante assinem a Declaração de Gestão de Contratos com Terceiros de Risco Alto;',
  'B) Que a pessoa responsável pela Gestão do Contrato e os respectivos fiscais, caso ainda não o tenham feito, participem de treinamentos relacionados aos riscos apresentados por terceiros classificados como Risco Alto, bem como aos procedimentos adequados para prevenção e detecção de situações de fraude e corrupção;',
  'C) Que, durante a execução contratual, sejam observadas a manutenção e a regularidade das licenças, autorizações, registros e demais instrumentos necessários ao exercício das atividades relacionadas ao objeto contratado;',
  'D) Que sejam realizadas atualizações periódicas da diligência durante a vigência contratual e realização de nova análise em situações como: prorrogação, acréscimo de valor, alteração de objeto, mudança societária, mídia adversa relevante, processo sancionador, mudança de beneficiário final.',
];

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
    atividadeRegulada: '',
    licencasDestacadas: '',
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

const positivos = (answers: IntegrityAnswers, itens: SuapeIntegrityItemKey[]) =>
  itens.filter((item) => answers[item] === true);

/** Cadastro que foi consultado mas cuja fonte não respondeu. */
function registryFailed(diligence: DiligenceItem, key: SuapeRegistryKey): boolean {
  if (key === 'ceis' || key === 'cnep') {
    const result = diligence[key];
    return Boolean(result && (result.ok === false || result.semChave));
  }
  if (key === 'tcePe') return (diligence.tcePe as { ok?: boolean } | undefined)?.ok === false;
  return false;
}

/**
 * Parágrafo das pesquisas exigidas pelos itens 3.3.2 e 3.3.3 da Política,
 * escrito a partir do que a diligência de fato consultou. Os cadastros são
 * os 8 do item 3.3.3, na situação que a Avaliação de Integridade apurou.
 */
export function buildResearchParagraph(
  diligence: DiligenceItem,
  registryCoverage: SuapeRegistryCoverage[],
): ResearchSummary {
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

  const rotulo = (item: SuapeRegistryCoverage) => REGISTRY_SHORT[item.key] || item.label;
  const falharam = registryCoverage.filter((item) => item.status === 'nada-consta' && registryFailed(diligence, item.key));
  const respondidas = registryCoverage.filter((item) => item.status !== 'nao-consultado' && !falharam.includes(item));
  const comAchado = registryCoverage.filter((item) => item.status === 'consta');
  const naoConsultadas = registryCoverage.filter((item) => item.status === 'nao-consultado');
  const lista = (itens: SuapeRegistryCoverage[]) => listar(itens.map(rotulo));

  let cadastros: string;
  if (respondidas.length === 0) {
    cadastros = 'Quanto às consultas em cadastros e bancos de dados, as bases não responderam nesta diligência, razão pela qual não foi possível concluir a verificação';
    alertas.push('Nenhum cadastro do item 3.3.3 respondeu. A nota não deve ser assinada assim.');
  } else if (comAchado.length === 0) {
    cadastros = `Quanto às consultas realizadas em cadastros e bancos de dados (${lista(respondidas)}), não foram identificados registros, ocorrências ou apontamentos relacionados à empresa nas bases consultadas`;
  } else {
    cadastros = `Quanto às consultas realizadas em cadastros e bancos de dados (${lista(respondidas)}), foram identificados registros em ${lista(comAchado)}, os quais constam do dossiê de diligência e foram objeto de análise por esta Unidade`;
    alertas.push(`Há registros em ${lista(comAchado)}. Confirme se a classificação e as recomendações seguem adequadas.`);
  }
  if (falharam.length > 0) {
    const um = falharam.length === 1;
    cadastros += `, ressalvando-se que ${um ? 'a base' : 'as bases'} ${lista(falharam)} não ${um ? 'respondeu' : 'responderam'} no momento da consulta`;
    alertas.push(`${lista(falharam)} não ${um ? 'respondeu' : 'responderam'}. A ressalva já está no texto.`);
  }
  if (naoConsultadas.length > 0) {
    alertas.push(`Consulta manual pendente: ${lista(naoConsultadas)}. Depois de consultar, inclua no texto da pesquisa.`);
  }

  return { texto: `${reputacional}. ${cadastros}.`, alertas };
}

function integrityParagraph(answers: IntegrityAnswers, empresa: string): string | null {
  const frases: string[] = [];
  for (const item of INTEGRITY_PHRASES) {
    const valor = answers[item.key];
    if (valor !== true && valor !== false) continue;
    // "possuir Programa de Integridade estruturado e Código de Ética".
    if (item.key === '8.2' && valor === true && answers['8.1'] === true) {
      frases[frases.length - 1] = 'possuir Programa de Integridade estruturado e Código de Ética';
      continue;
    }
    frases.push(valor ? item.sim : item.nao);
  }
  return frases.length > 0 ? `A ${empresa} informou ${listar(frases)}.` : null;
}

function comDestaque(texto: string, answers: IntegrityAnswers, form: TechnicalNoteForm): string {
  const destaque = semPontoFinal(form.licencasDestacadas);
  return answers['7.2'] === true && destaque ? `${texto} Destaca-se ${destaque}.` : texto;
}

function frase7(item: SuapeIntegrityItemKey, form: TechnicalNoteForm, marcarLacuna: boolean): string {
  if (item !== '7.1') return ITEM_7_PHRASES[item] || '';
  const atividade = semPontoFinal(form.atividadeRegulada);
  if (atividade) return `exerce atividade regulada perante ${atividade}`;
  return marcarLacuna ? 'exerce atividade regulada perante [ÓRGÃOS REGULADORES E ATIVIDADE]' : 'exerce atividade regulada';
}

function enquadramentoMuitoAlto(answers: IntegrityAnswers, form: TechnicalNoteForm): string {
  const itens = positivos(answers, ['4.4', '5.2', ...ITENS_7]);
  const socios = `a existência de condenações, processos criminais ou investigações criminais relacionadas aos sócios ${CORRUPCAO_OU_FRAUDE}`;
  const motivo = answers['4.4'] === true
    ? `por declarar a existência de condenação administrativa ou civil ${CORRUPCAO_OU_FRAUDE}`
    : `por informar ${socios}`;
  let texto = `Da análise do Questionário de Diligência, verificou-se que a empresa assinalou positivamente ${itens.length > 1 ? 'os itens' : 'o item'} ${listar(itens)}, e a pessoa jurídica foi enquadrada como RISCO MUITO ALTO DE INTEGRIDADE, nos termos da Política de Contratação de Terceiros de SUAPE, ${motivo}.`;
  if (answers['4.4'] === true && answers['5.2'] === true) {
    texto += ` Adicionalmente, a empresa respondeu positivamente ao item 5.2, informando ${socios}.`;
  }

  const agravantes = positivos(answers, ITENS_7);
  if (agravantes.length > 0) {
    const varios = agravantes.length > 1;
    texto += ` Também ${varios ? 'foram identificadas respostas afirmativas aos itens' : 'foi identificada resposta afirmativa ao item'} ${listar(agravantes)}, indicando que a empresa ${listar(agravantes.map((item) => frase7(item, form, false)))}, ${varios ? 'circunstâncias que demandam' : 'circunstância que demanda'} maior atenção quanto ao acompanhamento da execução contratual.`;
  }
  if (answers.alcadaConselho === true) texto += ` Ademais, ${ALCADA_CONSELHO}.`;
  return comDestaque(texto, answers, form);
}

function enquadramentoAlto(answers: IntegrityAnswers, form: TechnicalNoteForm): string {
  const itens = positivos(answers, ITENS_ALTO);
  const partes: string[] = [];
  if (itens.length > 0) {
    partes.push(`a empresa respondeu positivamente ${itens.length > 1 ? 'aos itens' : 'ao item'} ${listar(itens)}, afirmando que ${listar(itens.map((item) => frase7(item, form, true)))}`);
  }
  if (answers.alcadaConselho === true) partes.push(ALCADA_CONSELHO);
  let texto = `Diante da análise do Questionário de Diligência, verificou-se que ${partes.join(', e que ')}. Tal enquadramento, nos termos da Política de Contratação de Terceiros, resulta na elevação do perfil de integridade da empresa para Risco Alto de Integridade.`;
  if (answers['7.2'] === true) {
    texto += ' Adicionalmente, a empresa manifestou conformidade com o item 7.2, ratificando a manutenção das licenças e autorizações necessárias ao exercício de suas atividades.';
  }
  return comDestaque(texto, answers, form);
}

function enquadramentoParagraph(nivel: RiskLevel, answers: IntegrityAnswers, form: TechnicalNoteForm, empresa: string): string {
  if (nivel === 'Muito Alto') return enquadramentoMuitoAlto(answers, form);
  if (nivel === 'Alto') return enquadramentoAlto(answers, form);
  if (nivel === 'Médio') {
    return comDestaque(
      `Após análise do formulário, verificamos que a ${empresa} respondeu positivamente ao item 7.2. A Política de Contratação de Terceiros de Suape classifica no grupo de aparente MÉDIO RISCO DE INTEGRIDADE os casos em que são necessárias autorizações, licenças, anotações de responsabilidade técnica, registro de responsabilidade técnica ou permissões para o exercício das atividades da pessoa jurídica.`,
      answers,
      form,
    );
  }
  return `Diante da análise do questionário de diligência, verificou-se que as respostas da ${empresa} não a classificaram com aparente Risco Médio, Risco Alto ou Risco Muito Alto de Integridade.`;
}

function recomendacoesMuitoAlto(answers: IntegrityAnswers): string[] {
  const condenacoes = answers['5.2'] === true ? 'as condenações criminais' : 'as condenações';
  return [
    'A) Que o Diretor Executivo da área demandante e o Gestor do Contrato assinem a Declaração de Gestão de Contratos com Terceiros de Risco Muito Alto;',
    'B) Que o Gestor do Contrato e o respectivo Fiscal participem de treinamentos em relação ao risco apresentado por este terceiro, adotando procedimentos adequados para prevenção, identificação e comunicação de eventuais indícios de fraude e corrupção;',
    'C) Que seja avaliada a possibilidade de solicitação de atuação da Auditoria Interna para acompanhamento da execução contratual, observadas as competências institucionais;',
    'D) Que o terceiro seja incluído no Mapa de Risco de Terceiros, em conformidade com a Política de Contratação de Terceiros de SUAPE;',
    'E) Que seja exigida a apresentação do Programa de Integridade da empresa no momento da contratação;',
    `F) Que a Diretoria Jurídica verifique se ${condenacoes} declaradas pela empresa ensejam impedimento legal à sua contratação pela Administração Pública, à luz da legislação e dos normativos aplicáveis.`,
  ];
}

/**
 * Monta a nota. Devolve `null` enquanto a avaliação não tem classificação:
 * sem questionário, a nota não tem o que comunicar.
 */
export function buildTechnicalNote(form: TechnicalNoteForm, source: TechnicalNoteSource): TechnicalNote | null {
  const nivel = source.evaluation.calculatedRisk;
  if (!nivel) return null;
  const { answers, diligence } = source;

  const empresa = lacuna(form.empresa, 'EMPRESA');
  const numero = form.numero.trim() || '___';
  const ano = form.ano.trim() || String(new Date().getFullYear());

  const ementaObjeto = semPontoFinal(form.objeto);
  const ementa = `Política de Contratação de Terceiros. Contratação da empresa ${empresa}${ementaObjeto ? `, ${ementaObjeto}` : ''}.`;

  // Texto das notas 155 e 156, as mais recentes, com o nome atual da CPL.
  const abertura = `Trata-se de Questionário de Diligência enviado pela Coordenadoria de Gestão e Licitações – CPL, por meio eletrônico, que integra o anexo A da Política de Contratação de Terceiros, preenchido pela empresa ${empresa}. As informações prestadas pela referida empresa, quando do preenchimento do formulário, foram objeto de análise por esta Unidade de Compliance, como forma orientativa, a fim de permitir às áreas responsáveis a avaliação da pessoa jurídica em questão, buscando identificar eventuais riscos existentes e seu enquadramento nos grupos de terceiros de Risco Baixo, Risco Médio, Risco Alto e Risco Muito Alto.`;

  const paragrafos = [abertura, enquadramentoParagraph(nivel, answers, form, empresa)];

  if (nivel === 'Alto' || nivel === 'Muito Alto') {
    const pesquisa = semPontoFinal(form.pesquisaAjustada)
      ? `${semPontoFinal(form.pesquisaAjustada)}.`
      : buildResearchParagraph(diligence, source.evaluation.registryCoverage).texto;
    paragrafos.push(`A Política de Contratação de Terceiros de SUAPE estabelece que, nos casos em que o terceiro seja classificado como aparente Risco Muito Alto e/ou Risco Alto de Integridade, como ocorreu no presente caso, sejam realizadas pesquisas de reputação, utilizando o nome da instituição, de seus diretores e demais beneficiários, bem como consultas a cadastros e bancos de dados, conforme previsto nos itens 3.3.2 e 3.3.3 da mencionada Política. ${pesquisa}`);
  }

  const integridade = integrityParagraph(answers, empresa);
  if (integridade) paragrafos.push(integridade);
  // Só quando o terceiro negou expressamente os dois itens de condenação.
  if (answers['4.4'] === false && answers['5.2'] === false) paragrafos.push(DECLARACAO_SEM_CONDENACOES);
  paragrafos.push(...form.observacoes.split(/\n\s*\n/).map((bloco) => bloco.replace(/\s+/g, ' ').trim()).filter(Boolean));

  const fechoComRecomendacoes = `Caso, durante a execução contratual, verifique-se algum fato novo, é possível reportar à Assessoria Especial de Compliance ou utilização do Canal de Denúncia através do link (${CANAL_DENUNCIA}).`;
  let recomendacoes: string[] = [];
  let fecho = `Assim considerando, o presente processo será arquivado. Caso, durante a execução contratual, verifique-se algum fato novo, se faz necessário reportar à Unidade de Compliance ou utilização do Canal de Denúncia através do link (${CANAL_DENUNCIA}).`;

  if (nivel === 'Muito Alto') {
    paragrafos.push(
      'Diante do exposto, a Assessoria Especial de Compliance COMUNICA que, em conformidade com a análise realizada e com o disposto na Política de Contratação de Terceiros que integra o Programa de Integridade de SUAPE, o terceiro foi classificado com grau de RISCO MUITO ALTO DE INTEGRIDADE.',
      'Assim, esta Assessoria Especial de Compliance recomenda a adoção das seguintes medidas:',
    );
    recomendacoes = recomendacoesMuitoAlto(answers);
    fecho = fechoComRecomendacoes;
  } else if (nivel === 'Alto') {
    paragrafos.push(
      `Diante do exposto, através da análise realizada, a Assessoria Especial de Compliance COMUNICA que ${CONFORMIDADE}, o terceiro foi classificado com grau de RISCO ALTO. Desta forma, o terceiro será incluído no Mapa de Risco de Terceiros de Suape, bem como o trabalho da Auditoria Interna poderá ser solicitado durante a execução do Contrato.`,
      'Assim considerando, a Assessoria Especial de Compliance orienta que sejam adotadas as seguintes recomendações:',
    );
    recomendacoes = RECOMENDACOES_ALTO;
    fecho = fechoComRecomendacoes;
  } else if (nivel === 'Médio') {
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
export function missingFields(form: TechnicalNoteForm, source: TechnicalNoteSource): string[] {
  const faltando: string[] = [];
  if (!form.numero.trim()) faltando.push('Número da nota');
  if (!form.empresa.trim()) faltando.push('Nome da empresa');
  if (source.evaluation.calculatedRisk === 'Alto' && source.answers['7.1'] === true && !form.atividadeRegulada.trim()) {
    faltando.push('Órgãos reguladores (item 7.1)');
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
