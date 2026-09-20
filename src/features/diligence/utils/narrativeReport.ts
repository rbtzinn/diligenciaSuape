// ==========================================================
// DILIGÊNCIA 360 — Relatório em prosa
//
// O dossiê já reunia mais fonte oficial do que qualquer assistente de
// conversa alcança, e ainda assim a tela devolvia cartão, selo e
// contagem. Quem precisa levar o resultado para uma reunião, um e-mail
// ou um processo tinha de escrever o texto à mão a partir dos números.
//
// Este módulo escreve esse texto. Ele não é um resumo e não interpreta:
// é a mesma informação do dossiê dita em frases, com data de consulta,
// nome de fonte e número. A redação muda conforme o dado — empresa
// recente fala em histórico curto, fonte que não respondeu vira lacuna
// declarada — mas nada aqui é inventado, e a mesma diligência produz
// sempre o mesmo texto.
//
// DUAS FRONTEIRAS, e as duas são deliberadas:
//
// 1. Notícia não é parafraseada. A coleta guarda título, veículo, data e
//    os termos que casaram, não o corpo da matéria. Então o relatório
//    cita o título e diz onde ele foi publicado, em vez de afirmar o que
//    a matéria conta. Um dossiê que reproduz o título com o link é
//    defensável; um que resume o que não leu, não é.
//
// 2. Ausência nunca vira atestado. "Consultado e nada consta" e "a fonte
//    não respondeu" são frases diferentes aqui, sempre, porque terminam
//    na mesma contagem zero e significam o oposto.
// ==========================================================

import type { DiligenceItem } from '../types';
import { deriveSourceCoverage, SOURCE_STATUS_LABEL, type SourceCoverageItem } from '../components/dossier/sourceCoverage';
import { requiresReputationResearch, type SuapeIntegrityEvaluationResult } from './suapeRiskMapRowGenerator';

export interface ReportSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface NarrativeReport {
  title: string;
  subtitle: string;
  generatedAt: string;
  sections: ReportSection[];
  /** O relatório inteiro como texto corrido, pronto para colar. */
  plainText: string;
}

// ---------- utilidades de redação ----------

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });
const shortFormatter = new Intl.DateTimeFormat('pt-BR');

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value).trim());
  if (!br) return null;
  const rebuilt = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  return Number.isNaN(rebuilt.getTime()) ? null : rebuilt;
}

function longDate(value?: string | null): string {
  const parsed = parseDate(value);
  return parsed ? dateFormatter.format(parsed) : '';
}

function shortDate(value?: string | null): string {
  const parsed = parseDate(value);
  return parsed ? shortFormatter.format(parsed) : '';
}

function currency(value?: number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

/** "três processos" lê melhor que "3 processos" no início da frase. */
function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Junta em lista com vírgula e "e" antes do último. */
function enumerate(items: string[]): string {
  const clean = items.filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} e ${clean[clean.length - 1]}`;
}

/**
 * Ajusta o espaçamento depois da junção.
 *
 * As frases são montadas por pedaços opcionais, e alguns pedaços começam
 * com pontuação — ", o que lhe dá…", ")." Juntar tudo com espaço produzia
 * "aberta em 5 de maio de 2025 , o que", que denuncia texto montado por
 * máquina justamente onde ele precisa parecer escrito.
 *
 * O ajuste é só de espaço ANTES da pontuação. Inserir espaço depois dela
 * parece a correção simétrica e quebra justamente o que mais importa
 * aqui: CNPJ, valor em reais e domínio de veículo têm ponto e vírgula no
 * meio ("56.211.027", "R$ 5.000.000,00", "g1.globo.com").
 */
function tidy(value: string): string {
  return value
    .replace(/\s+([,.;:!?)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function sentences(...parts: Array<string | false | null | undefined>): string {
  return tidy(
    parts.filter((part): part is string => Boolean(part && String(part).trim())).join(' ')
  );
}

/** Idade da empresa em anos completos, para qualificar o histórico. */
function yearsSince(value?: string | null): number | null {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const years = (Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return years < 0 ? null : Math.floor(years);
}

/**
 * Frase de consulta de uma fonte binária.
 *
 * É aqui que a distinção entre "nada consta" e "não respondeu" vira
 * texto, em vez de virar silêncio.
 */
function consultationSentence(
  label: string,
  source: { ok?: boolean; consultadoEm?: string; erro?: string; aviso?: string } | undefined,
  found: number,
  unit: [string, string],
): string {
  if (!source) return `${label}: a consulta não chegou a ser executada nesta diligência.`;
  const quando = shortDate(source.consultadoEm);
  const referencia = quando ? ` em consulta de ${quando}` : '';

  if (source.ok === false) {
    const motivo = source.erro || source.aviso || 'a fonte não respondeu';
    return `${label}: a fonte não respondeu${referencia} (${motivo}). Nada pode ser afirmado nem descartado por aqui.`;
  }
  if (found > 0) {
    return `${label}: ${plural(found, ...unit)}${referencia}.`;
  }
  return `${label}: nenhum registro localizado${referencia}.`;
}

// ---------- seções ----------

function summarySection(
  diligence: DiligenceItem,
  coverage: SourceCoverageItem[],
  evaluation?: SuapeIntegrityEvaluationResult | null,
): ReportSection {
  const respondidas = coverage.filter((item) => item.status === 'com-achado' || item.status === 'sem-achado');
  const comAchado = coverage.filter((item) => item.status === 'com-achado');
  const falharam = coverage.filter((item) => item.status === 'falhou');
  const naoConsultadas = coverage.filter((item) => item.status === 'nao-consultada');

  const quando = longDate(diligence.dataAnalise) || longDate(diligence.companyConsultedAt);
  const risco = diligence.risco;

  const abertura = sentences(
    `Esta diligência sobre ${diligence.razaoSocial} (CNPJ ${diligence.cnpjFmt || diligence.cnpj})`,
    quando ? `foi executada em ${quando}` : 'foi executada nesta sessão',
    `e percorreu ${plural(coverage.length, 'fonte pública', 'fontes públicas')}.`,
    `${plural(respondidas.length, 'fonte respondeu', 'fontes responderam')} à consulta,`,
    comAchado.length === 0
      ? 'nenhuma com achado.'
      : `${comAchado.length === 1 ? 'uma delas trouxe registro' : `${comAchado.length} delas trouxeram registro`}.`,
  );

  const lacuna = falharam.length > 0 || naoConsultadas.length > 0
    ? sentences(
      falharam.length > 0
        ? `${plural(falharam.length, 'fonte não respondeu', 'fontes não responderam')} (${enumerate(falharam.map((item) => item.label))}).`
        : '',
      naoConsultadas.length > 0
        ? `${plural(naoConsultadas.length, 'fonte não chegou a ser consultada', 'fontes não chegaram a ser consultadas')} (${enumerate(naoConsultadas.map((item) => item.label))}).`
        : '',
      'O que essas fontes diriam segue desconhecido: não há como tratar a ausência de resposta como ausência de ocorrência.',
    )
    : 'Todas as fontes previstas responderam à consulta.';

  const indice = sentences(
    `O índice de atenção da pesquisa ficou em ${risco?.score ?? 0} de 100${risco?.nivel ? `, faixa "${risco.nivel}"` : ''}.`,
    'Ele mede quanto material a pesquisa reuniu para revisão humana, e não culpa, irregularidade ou impedimento de contratar.',
  );

  const classificacao = evaluation?.calculatedRisk
    ? sentences(
      `A classificação oficial de integridade, apurada pelas fórmulas da Avaliação de Integridade de SUAPE, é ${evaluation.calculatedRisk}.`,
      evaluation.triggeredRisks?.length
        ? `Ela decorre de ${plural(evaluation.triggeredRisks.length, 'gatilho acionado', 'gatilhos acionados')} no questionário respondido pelo terceiro.`
        : '',
    )
    : 'A classificação oficial de integridade ainda não pode ser apurada: ela depende das respostas do questionário de diligência do terceiro, que não foram anexadas até aqui.';

  return {
    id: 'resumo',
    heading: 'Resumo',
    paragraphs: [abertura, lacuna, indice, classificacao].filter(Boolean),
  };
}

function companySection(diligence: DiligenceItem): ReportSection {
  const empresa = diligence.empresa || {};
  const idade = yearsSince(empresa.data_inicio_atividade);
  const situacao = empresa.descricao_situacao_cadastral || '';
  const cidade = empresa.municipio ? `${empresa.municipio}/${empresa.uf || ''}`.replace(/\/$/, '') : '';

  const identificacao = sentences(
    `${diligence.razaoSocial}${empresa.nome_fantasia ? `, que atua como ${empresa.nome_fantasia},` : ''}`,
    `está inscrita no CNPJ ${diligence.cnpjFmt || diligence.cnpj}`,
    situacao ? `com situação cadastral ${situacao.toLowerCase()}` : '',
    empresa.data_situacao_cadastral && situacao && situacao.toUpperCase() !== 'ATIVA'
      ? `desde ${shortDate(empresa.data_situacao_cadastral)}`
      : '',
    cidade ? `e sede em ${cidade}.` : '.',
  );

  const atividade = sentences(
    empresa.cnae_fiscal_descricao
      ? `A atividade principal declarada é ${empresa.cnae_fiscal_descricao.toLowerCase()}${empresa.cnae_fiscal ? ` (CNAE ${empresa.cnae_fiscal})` : ''}.`
      : '',
    empresa.natureza_juridica ? `A natureza jurídica é ${empresa.natureza_juridica}` : '',
    empresa.descricao_porte ? `e o porte declarado é ${empresa.descricao_porte.toLowerCase()}.` : empresa.natureza_juridica ? '.' : '',
    currency(empresa.capital_social) ? `O capital social registrado é de ${currency(empresa.capital_social)}.` : '',
  );

  const historico = empresa.data_inicio_atividade
    ? sentences(
      `A empresa foi aberta em ${longDate(empresa.data_inicio_atividade)}`,
      idade !== null ? `, o que lhe dá ${plural(idade, 'ano', 'anos')} de existência.` : '.',
      idade !== null && idade < 3
        ? 'Empresa recente deixa pouco rastro em fonte pública: a ausência de registro em sanções, contratos e imprensa diz mais sobre o tempo de operação do que sobre a conduta, e por isso pesa menos como evidência favorável.'
        : '',
    )
    : '';

  return {
    id: 'empresa',
    heading: 'A empresa',
    paragraphs: [identificacao, atividade, historico].filter(Boolean),
  };
}

function peopleSection(diligence: DiligenceItem): ReportSection {
  const socios = Array.isArray(diligence.socios) ? diligence.socios : [];
  const pep = Array.isArray(diligence.pepResults) ? diligence.pepResults.filter((item) => item?.encontrado) : [];
  const rede = diligence.corporateNetwork;

  const quadro = socios.length > 0
    ? sentences(
      `O quadro societário público reúne ${plural(socios.length, 'integrante', 'integrantes')}:`,
      `${enumerate(socios.slice(0, 8).map((socio) => `${socio.nome_socio}${socio.qualificacao_socio ? ` (${socio.qualificacao_socio})` : ''}`))}${socios.length > 8 ? `, entre outros` : ''}.`,
      'A Receita divulga o CPF parcialmente mascarado, de modo que a identificação por nome é hipótese de trabalho e não confirmação de identidade.',
    )
    : 'O quadro societário não foi divulgado pela fonte cadastral consultada, o que impede afirmar quem controla a empresa a partir desta diligência.';

  const pessoasExpostas = pep.length > 0
    ? sentences(
      `${plural(pep.length, 'integrante foi apontado', 'integrantes foram apontados')} como pessoa exposta politicamente:`,
      `${enumerate(pep.map((item) => item.nome || 'nome não informado'))}.`,
      'Ser PEP não é irregularidade: é condição que exige diligência reforçada e acompanhamento da relação contratual.',
    )
    : 'Nenhum integrante do quadro societário foi apontado como pessoa exposta politicamente na base consultada.';

  const vinculos = rede?.ok
    ? sentences(
      (rede.companies?.length || 0) > 0
        ? `A expansão do quadro societário alcançou ${plural(rede.companies.length, 'outra empresa', 'outras empresas')} ligadas aos mesmos integrantes.`
        : 'A expansão do quadro societário não encontrou outra empresa ligada aos mesmos integrantes no que é público.',
    )
    : 'A expansão da rede societária não pôde ser concluída nesta diligência, então vínculos com outras empresas não foram descartados.';

  return {
    id: 'pessoas',
    heading: 'Quem está por trás',
    paragraphs: [quadro, pessoasExpostas, vinculos].filter(Boolean),
  };
}

function sanctionsSection(diligence: DiligenceItem): ReportSection {
  const ceis = diligence.ceis;
  const cnep = diligence.cnep;
  const pessoas = diligence.personSanctions;

  const empresa = [
    consultationSentence('CEIS (empresas inidôneas e suspensas)', ceis, ceis?.quantidade || 0, ['registro', 'registros']),
    consultationSentence('CNEP (empresas punidas)', cnep, cnep?.quantidade || 0, ['registro', 'registros']),
  ].join(' ');

  const socios = pessoas
    ? consultationSentence(
      'Sanções de integrantes do quadro societário',
      { ok: pessoas.ok, consultadoEm: pessoas.consultadoEm, erro: pessoas.erro },
      pessoas.strongCandidates || 0,
      ['correspondência forte', 'correspondências fortes'],
    )
    : 'As sanções dos integrantes do quadro societário não foram consultadas nesta diligência.';

  const leitura = (ceis?.ok !== false && cnep?.ok !== false && (ceis?.quantidade || 0) === 0 && (cnep?.quantidade || 0) === 0)
    ? 'As duas bases federais responderam e não registram impedimento vigente para esta inscrição. Isso vale para o que o Portal da Transparência publica e para a data da consulta; não é atestado de idoneidade nem cobre sanção estadual ou municipal fora dessas bases.'
    : '';

  return {
    id: 'sancoes',
    heading: 'Sanções e impedimentos',
    paragraphs: [empresa, socios, leitura].filter(Boolean),
  };
}

function contractsSection(diligence: DiligenceItem): ReportSection {
  const pncp = diligence.pncp;
  const tce = diligence.tcePe;

  const contratos = pncp
    ? consultationSentence(
      'Contratos públicos (PNCP)',
      { ok: pncp.ok, consultadoEm: pncp.consultadoEm, erro: pncp.erro },
      pncp.contratos?.length || 0,
      ['contrato localizado', 'contratos localizados'],
    )
    : 'A base nacional de contratações públicas não foi consultada nesta diligência.';

  const controle = tce
    ? sentences(
      consultationSentence(
        'Controle externo (TCE-PE)',
        { ok: tce.ok, consultadoEm: tce.consultadoEm, erro: tce.erro },
        tce.processos?.length || 0,
        ['processo associado ao nome empresarial', 'processos associados ao nome empresarial'],
      ),
      (tce.resumo?.altaRelevancia || 0) > 0
        ? `Desses, ${plural(tce.resumo?.altaRelevancia || 0, 'exige', 'exigem')} revisão prioritária por tratar de matéria de maior impacto.`
        : '',
      (tce.processos?.length || 0) > 0
        ? 'A associação é feita pelo nome empresarial, então cada processo precisa ser conferido antes de ser atribuído a esta inscrição.'
        : '',
    )
    : 'O controle externo estadual não foi consultado nesta diligência.';

  return {
    id: 'contratos',
    heading: 'Contratos e controle externo',
    paragraphs: [contratos, controle].filter(Boolean),
  };
}

function judicialSection(diligence: DiligenceItem): ReportSection {
  const processos = Array.isArray(diligence.processosJudiciais) ? diligence.processosJudiciais : [];
  const descobertos = Array.isArray(diligence.processosDescobertos) ? diligence.processosDescobertos : [];

  const oficiais = processos.length > 0
    ? `A consulta judicial retornou ${plural(processos.length, 'processo', 'processos')} associados à empresa.`
    : diligence.processDiscoveryExecuted
      ? 'A consulta judicial não retornou processo associado à empresa.'
      : 'A consulta judicial não foi executada nesta diligência.';

  const achados = descobertos.length > 0
    ? sentences(
      `Além disso, ${plural(descobertos.length, 'número de processo foi extraído', 'números de processo foram extraídos')} de publicações e diários durante a varredura.`,
      'São pistas para verificação no tribunal de origem, não decisões: o número citado numa matéria não diz quem é parte nem qual o desfecho.',
    )
    : '';

  return {
    id: 'judicial',
    heading: 'Processos judiciais',
    paragraphs: [oficiais, achados].filter(Boolean),
  };
}

function mediaSection(diligence: DiligenceItem): ReportSection {
  const media = diligence.adverseMedia;
  const diarios = diligence.officialGazettes;

  if (!media) {
    return {
      id: 'reputacao',
      heading: 'Reputação e imprensa',
      paragraphs: ['A varredura de imprensa e web não foi executada nesta diligência.'],
    };
  }

  const ativos = (media.results || []).filter((item) => item.status !== 'discarded');
  const comTermo = ativos.filter((item) => (item.matchedTerms?.length || 0) > 0);
  const fortes = ativos.filter((item) => item.matchStrength === 'high');
  const veiculos = [...new Set(ativos.map((item) => item.domain).filter(Boolean))];

  const abertura = media.ok === false
    ? `A varredura de imprensa não pôde ser concluída${media.aviso ? ` (${media.aviso})` : ''}. O que a imprensa publicou sobre a empresa segue não verificado.`
    : sentences(
      `A varredura reuniu ${plural(ativos.length, 'publicação', 'publicações')}`,
      veiculos.length === 1 ? 'de um único veículo,' : veiculos.length > 1 ? `de ${veiculos.length} veículos distintos,` : '',
      comTermo.length === 0
        ? 'nenhuma delas contendo termos de atenção definidos pela política.'
        : ativos.length === 1
          ? 'e ela contém termos de atenção definidos pela política.'
          : `${comTermo.length === 1 ? 'uma delas contém' : `${comTermo.length} delas contêm`} termos de atenção definidos pela política.`,
      media.consultaParcial ? 'A cobertura ficou parcial: parte das consultas não foi concluída pelas fontes gratuitas.' : '',
    );

  // Título e veículo, nunca o que a matéria diz: a coleta guarda o
  // título e o trecho do buscador, não o corpo do texto.
  const destaques = fortes.slice(0, 5).map((item) => {
    const origem = [item.domain, shortDate(item.publishedAt)].filter(Boolean).join(', ');
    return sentences(
      `— "${item.title}"`,
      origem ? `(${origem}).` : '',
      (item.matchedTerms?.length || 0) > 0 ? `Termos localizados: ${item.matchedTerms.join(', ')}.` : '',
    );
  });

  const ressalva = ativos.length > 0
    ? 'As publicações acima são citadas pelo título e pelo veículo, como foram coletadas. O sistema não lê o corpo da matéria, então nada aqui afirma o que ela relata — a leitura é do analista, pelo link registrado no dossiê. Menção nominal em notícia é hipótese a verificar, nunca conclusão.'
    : '';

  const oficiais = diarios
    ? consultationSentence(
      'Diários oficiais municipais',
      { ok: diarios.ok, consultadoEm: diarios.consultadoEm, erro: diarios.erro },
      diarios.results?.length || 0,
      ['publicação localizada', 'publicações localizadas'],
    )
    : '';

  return {
    id: 'reputacao',
    heading: 'Reputação e imprensa',
    paragraphs: [
      abertura,
      destaques.length > 0 ? `Publicações com correlação mais forte:\n${destaques.join('\n')}` : '',
      ressalva,
      oficiais,
    ].filter(Boolean),
  };
}

function offshoreSection(diligence: DiligenceItem): ReportSection | null {
  const offshore = diligence.offshore;
  if (!offshore) return null;

  const base = offshore.ok === false
    ? `A base Offshore Leaks do ICIJ não respondeu${offshore.erro ? ` (${offshore.erro})` : ''}. Estruturas no exterior não foram verificadas nem descartadas.`
    : (offshore.candidates?.length || 0) > 0
      ? sentences(
        `A reconciliação com a base Offshore Leaks do ICIJ trouxe ${plural(offshore.candidates.length, 'correspondência nominal', 'correspondências nominais')} para revisão humana.`,
        'Presença nessa base não implica ilegalidade, e correspondência por nome pode ser homônimo.',
      )
      : 'A reconciliação com a base Offshore Leaks do ICIJ não trouxe correspondência nominal forte.';

  const parcial = (offshore.nomesNaoConsultados?.length || 0) > 0
    ? `${plural(offshore.nomesNaoConsultados!.length, 'nome não chegou a ser consultado', 'nomes não chegaram a ser consultados')} nessa base e seguem sem verificação.`
    : '';

  return {
    id: 'offshore',
    heading: 'Estruturas no exterior',
    paragraphs: [base, parcial].filter(Boolean),
  };
}

function gapsSection(coverage: SourceCoverageItem[]): ReportSection | null {
  const pendentes = coverage.filter((item) => item.status === 'falhou' || item.status === 'nao-consultada');
  if (pendentes.length === 0) return null;

  const lista = pendentes.map((item) => sentences(
    `— ${item.label}: ${SOURCE_STATUS_LABEL[item.status].toLowerCase()}`,
    item.detail ? `(${item.detail}).` : '.',
  ));

  const destaque = pendentes.filter((item) => item.status === 'falhou').length;

  return {
    id: 'lacunas',
    heading: 'O que não foi verificado',
    paragraphs: [
      'Esta seção existe porque um dossiê que só relata o que encontrou induz a erro. As fontes abaixo não produziram resposta utilizável nesta diligência:',
      lista.join('\n'),
      destaque > 0
        ? 'Enquanto essas fontes não responderem, o que diriam permanece desconhecido, e nenhuma conclusão deste relatório pode se apoiar no silêncio delas.'
        : 'Enquanto elas não forem consultadas, o que diriam permanece desconhecido, e nenhuma conclusão deste relatório pode se apoiar no silêncio delas.',
    ],
  };
}

function conclusionSection(
  diligence: DiligenceItem,
  evaluation?: SuapeIntegrityEvaluationResult | null,
): ReportSection {
  const risco = diligence.risco;

  const leitura = sentences(
    `A pesquisa reuniu material suficiente para posicionar a empresa em ${risco?.score ?? 0} de 100 no índice de atenção`,
    risco?.nivel ? `, faixa "${risco.nivel}".` : '.',
    risco?.decisaoDesc || risco?.decisao ? `${risco.decisaoDesc || risco.decisao}` : '',
  );

  const oficial = evaluation?.calculatedRisk
    ? sentences(
      `Para efeito de registro no Mapa de Risco, a classificação é ${evaluation.calculatedRisk}, apurada pelas fórmulas oficiais a partir do questionário do terceiro.`,
      requiresReputationResearch(evaluation.calculatedRisk)
        ? 'Nessa faixa, a política exige o aprofundamento reputacional, que consta das seções acima.'
        : '',
    )
    : 'A classificação oficial permanece pendente até que o questionário de diligência do terceiro seja anexado; sem ele, o Mapa de Risco não pode ser preenchido.';

  const limite = 'Este relatório descreve o que fontes públicas informaram na data da consulta. Ele não afirma culpa, não substitui manifestação jurídica e não vale como certidão. Ausência de achado não é atestado de idoneidade, e cada correlação por nome precisa de confirmação documental antes de sustentar decisão.';

  return {
    id: 'conclusao',
    heading: 'Leitura final',
    paragraphs: [leitura, oficial, limite].filter(Boolean),
  };
}

// ---------- montagem ----------

/**
 * Monta o relatório em prosa a partir do dossiê já coletado.
 *
 * É função pura: mesma diligência, mesmo texto. Isso é o que permite
 * anexar o relatório a um processo — duas execuções não podem divergir.
 */
export function buildNarrativeReport(
  diligence: DiligenceItem,
  evaluation?: SuapeIntegrityEvaluationResult | null,
): NarrativeReport {
  const coverage = deriveSourceCoverage(diligence);

  const sections = [
    summarySection(diligence, coverage, evaluation),
    companySection(diligence),
    peopleSection(diligence),
    sanctionsSection(diligence),
    contractsSection(diligence),
    judicialSection(diligence),
    mediaSection(diligence),
    offshoreSection(diligence),
    gapsSection(coverage),
    conclusionSection(diligence, evaluation),
  ].filter((section): section is ReportSection => section !== null && section.paragraphs.length > 0);

  const title = `Relatório de diligência — ${diligence.razaoSocial}`;
  const subtitle = sentences(
    `CNPJ ${diligence.cnpjFmt || diligence.cnpj}`,
    longDate(diligence.dataAnalise) ? `· consulta de ${longDate(diligence.dataAnalise)}` : '',
  );

  const plainText = [
    title,
    subtitle,
    '',
    ...sections.flatMap((section) => [section.heading.toUpperCase(), '', ...section.paragraphs, '']),
  ].join('\n');

  return {
    title,
    subtitle,
    generatedAt: new Date().toISOString(),
    sections,
    plainText,
  };
}
