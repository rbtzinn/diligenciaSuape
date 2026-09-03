// ==========================================================
// DILIGÊNCIA 360 — Eixos do dossiê
// ==========================================================
// Função pura que agrupa o dossiê nos eixos exibidos na fita superior e
// nas seções. Cada eixo carrega a própria situação de cobertura, que é o
// que permite pintar de cinza o eixo não consultado em vez de fingir que
// ele foi verificado e nada existe.
// ==========================================================

import type { DiligenceItem } from '../../types';
import type { SourceStatus } from './sourceCoverage';

export interface AxisRow {
  id: string;
  cells: string[];
  /** Situação exibida como selo na penúltima coluna. */
  status?: { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' };
  href?: string | null;
}

export interface DossierAxis {
  id: string;
  label: string;
  /** Letra do marcador; o projeto não usa biblioteca de ícones no dossiê. */
  mark: string;
  status: SourceStatus;
  /** Resumo curto exibido no selo da seção. */
  badge: string;
  note?: string;
  columns: string[];
  rows: AxisRow[];
}

function currency(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  if (numeric >= 1_000_000) return `R$ ${(numeric / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (numeric >= 1_000) return `R$ ${(numeric / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function shortDate(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('pt-BR');
}

function badgeFor(status: SourceStatus, count: number, unit: string) {
  if (status === 'falhou') return 'Sem resposta';
  if (status === 'nao-consultada') return 'Não consultada';
  if (count === 0) return 'Nenhum resultado';
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function registrationAxis(diligence: DiligenceItem): DossierAxis {
  const empresa = diligence.empresa || {};
  const rows: AxisRow[] = [];
  const add = (rotulo: string, valor?: string | number | null) => {
    if (valor === null || valor === undefined || valor === '') return;
    rows.push({ id: rotulo, cells: [rotulo, String(valor)] });
  };

  add('Razão social', empresa.razao_social);
  add('Nome fantasia', empresa.nome_fantasia);
  add('Situação cadastral', empresa.descricao_situacao_cadastral);
  add('Início de atividade', empresa.data_inicio_atividade);
  add('Natureza jurídica', empresa.natureza_juridica);
  add('Atividade principal', empresa.cnae_fiscal_descricao);
  add('Município', [empresa.municipio, empresa.uf].filter(Boolean).join('/'));
  add('Capital social', Number.isFinite(Number(empresa.capital_social)) ? currency(empresa.capital_social) : null);

  return {
    id: 'cadastro',
    label: 'Cadastro',
    mark: 'C',
    status: empresa.cnpj ? 'com-achado' : 'falhou',
    badge: empresa.cnpj ? `${rows.length} campos` : 'Sem resposta',
    columns: ['Campo', 'Valor'],
    rows,
  };
}

function shareholdersAxis(diligence: DiligenceItem): DossierAxis {
  const socios = diligence.socios || [];
  const candidatos = new Map(
    (diligence.personSanctions?.resultados || []).map((item) => [item.nome, item.candidatos?.length || 0]),
  );

  return {
    id: 'societario',
    label: 'Societário',
    mark: 'S',
    status: socios.length > 0 ? 'com-achado' : 'sem-achado',
    badge: badgeFor(socios.length > 0 ? 'com-achado' : 'sem-achado', socios.length, 'integrante'),
    note: 'O quadro público não expõe CPF completo, então a busca nominal em sanções devolve candidatos, não confirmações.',
    columns: ['Nome', 'Qualificação', 'Entrada', 'Sanções'],
    rows: socios.map((socio, index) => {
      const total = candidatos.get(socio.nome_socio) || 0;
      return {
        id: `${socio.nome_socio}-${index}`,
        cells: [
          socio.nome_socio,
          socio.qualificacao_socio || '—',
          shortDate(socio.data_entrada_sociedade) || '—',
        ],
        status: total > 0
          ? { label: `${total} a revisar`, tone: 'warn' as const }
          : { label: 'Sem candidato', tone: 'ok' as const },
      };
    }),
  };
}

function contractsAxis(diligence: DiligenceItem): DossierAxis {
  const pncp = diligence.pncp;
  const contratos = pncp?.contratos || [];
  const status: SourceStatus = !pncp
    ? 'nao-consultada'
    : pncp.ok === false ? 'falhou' : contratos.length > 0 ? 'com-achado' : 'sem-achado';

  return {
    id: 'contratos',
    label: 'Contratos',
    mark: '$',
    status,
    badge: badgeFor(status, contratos.length, 'contrato'),
    note: 'Cada contrato é confirmado pelo CNPJ do fornecedor no documento. Contrato público é exposição, não irregularidade.',
    columns: ['Contrato', 'Órgão', 'Vigência', 'Valor'],
    rows: [...contratos]
      .sort((left, right) => (Number(right.valorGlobal) || 0) - (Number(left.valorGlobal) || 0))
      .map((contrato, index) => ({
        id: contrato.numeroControlePncp || `contrato-${index}`,
        cells: [
          contrato.numeroContrato || '—',
          contrato.orgao || '—',
          shortDate(contrato.vigenciaFim) ? `até ${shortDate(contrato.vigenciaFim)}` : '—',
          currency(contrato.valorGlobal),
        ],
        href: contrato.url || null,
      })),
  };
}

function externalControlAxis(diligence: DiligenceItem): DossierAxis {
  const tce = diligence.tcePe;
  const processos = tce?.processos || [];
  const status: SourceStatus = !tce
    ? 'nao-consultada'
    : tce.ok === false ? 'falhou' : processos.length > 0 ? 'com-achado' : 'sem-achado';

  return {
    id: 'controle-externo',
    label: 'Controle externo',
    mark: 'T',
    status,
    badge: badgeFor(status, processos.length, 'processo'),
    note: 'A empresa consta nominalmente como interessada. O resultado é do processo de controle, não uma sanção aplicada a ela.',
    columns: ['Processo', 'Unidade jurisdicionada', 'Exercício', 'Situação'],
    rows: processos.map((processo, index) => {
      const irregular = /IRREGULAR/i.test(processo.outcome || '');
      return {
        id: processo.rawProcessNumber || `tce-${index}`,
        cells: [
          processo.processNumber,
          processo.organization || '—',
          processo.exercise ? String(processo.exercise) : '—',
        ],
        status: irregular
          ? { label: 'Irregular', tone: 'bad' as const }
          : { label: processo.status || 'Em análise', tone: 'muted' as const },
        href: processo.decisionUrl || processo.processUrl || null,
      };
    }),
  };
}

function sanctionsAxis(diligence: DiligenceItem): DossierAxis {
  const rows: AxisRow[] = [];
  let comAchado = 0;
  let falhou = 0;

  const push = (label: string, result?: { ok?: boolean; semChave?: boolean; quantidade?: number }) => {
    if (!result) {
      rows.push({ id: label, cells: [label], status: { label: 'Não consultada', tone: 'muted' } });
      return;
    }
    if (result.semChave || result.ok === false) {
      falhou += 1;
      rows.push({ id: label, cells: [label], status: { label: 'Sem resposta', tone: 'bad' } });
      return;
    }
    const total = result.quantidade || 0;
    if (total > 0) comAchado += 1;
    rows.push({
      id: label,
      cells: [label],
      status: total > 0
        ? { label: `${total} registro${total === 1 ? '' : 's'}`, tone: 'bad' }
        : { label: 'Nenhum resultado', tone: 'ok' },
    });
  };

  push('CEIS — Inidôneas e Suspensas', diligence.ceis);
  push('CNEP — Empresas Punidas', diligence.cnep);

  const pessoas = diligence.personSanctions;
  rows.push({
    id: 'pessoas',
    cells: ['CEIS/CNEP — sócios por nome'],
    status: !pessoas
      ? { label: 'Não consultada', tone: 'muted' }
      : (pessoas.totalCandidates || 0) > 0
        ? { label: `${pessoas.totalCandidates} candidato(s)`, tone: 'warn' }
        : { label: 'Nenhum candidato', tone: 'ok' },
  });

  const offshore = diligence.offshore;
  rows.push({
    id: 'offshore',
    cells: ['Offshore Leaks (ICIJ)'],
    status: !offshore
      ? { label: 'Não consultada', tone: 'muted' }
      : (offshore.candidates?.length || 0) > 0
        ? { label: `${offshore.candidates.length} candidato(s)`, tone: 'warn' }
        : { label: 'Nenhum resultado', tone: 'ok' },
  });

  const status: SourceStatus = falhou > 0 ? 'falhou' : comAchado > 0 ? 'com-achado' : 'sem-achado';
  return {
    id: 'sancoes',
    label: 'Listas restritivas',
    mark: 'L',
    status,
    badge: falhou > 0 ? 'Sem resposta' : comAchado > 0 ? `${comAchado} com registro` : 'Nenhum resultado',
    note: 'Ausência de sanção não constitui atestado de idoneidade.',
    columns: ['Fonte', 'Situação'],
    rows,
  };
}

function mediaAxis(diligence: DiligenceItem): DossierAxis {
  const media = diligence.adverseMedia;
  const gazettes = diligence.officialGazettes;
  const resultados = (media?.results || []).filter((item) => item.status !== 'discarded');
  const falhas = (media?.queriesExecuted || []).filter((item) => item.ok === false).length;

  const rows: AxisRow[] = [
    {
      id: 'noticias',
      cells: ['Notícias (Google News e GDELT)'],
      status: !media
        ? { label: 'Não consultada', tone: 'muted' }
        : resultados.length > 0
          ? { label: `${resultados.length} publicação(ões)`, tone: 'warn' }
          : { label: 'Nenhum resultado', tone: 'ok' },
    },
    {
      id: 'web',
      cells: ['Canal web institucional'],
      status: falhas > 0
        ? { label: `${falhas} consulta(s) sem resposta`, tone: 'bad' }
        : { label: 'Nenhum resultado', tone: 'ok' },
    },
    {
      id: 'diarios',
      cells: ['Diários oficiais (Querido Diário)'],
      status: !gazettes
        ? { label: 'Não consultada', tone: 'muted' }
        : (gazettes.results?.length || 0) > 0
          ? { label: `${gazettes.results.length} publicação(ões)`, tone: 'warn' }
          : { label: 'Nenhum resultado', tone: 'ok' },
    },
  ];

  const status: SourceStatus = falhas > 0
    ? 'falhou'
    : resultados.length > 0 || (gazettes?.results?.length || 0) > 0 ? 'com-achado' : 'sem-achado';

  return {
    id: 'midia',
    label: 'Mídia e diários',
    mark: 'M',
    status,
    badge: badgeFor(status, resultados.length + (gazettes?.results?.length || 0), 'publicação'),
    note: falhas > 0
      ? 'Parte das consultas não foi respondida. Ausência de achado nelas não pode ser lida como ausência de ocorrência.'
      : 'Menção nominal é hipótese investigativa até a validação humana da identidade.',
    columns: ['Fonte', 'Situação'],
    rows,
  };
}

function judicialAxis(diligence: DiligenceItem): DossierAxis {
  const processos = diligence.processosJudiciais || [];
  const descobertos = diligence.processosDescobertos || [];
  const total = processos.length + descobertos.length;
  const status: SourceStatus = !diligence.processDiscoveryExecuted && total === 0
    ? 'nao-consultada'
    : total > 0 ? 'com-achado' : 'sem-achado';

  return {
    id: 'judicial',
    label: 'Judicial',
    mark: 'J',
    status,
    badge: badgeFor(status, total, 'processo'),
    note: 'O DataJud não informa o polo da parte, então a posição processual da empresa não pode ser afirmada a partir daqui.',
    columns: ['Processo', 'Tribunal', 'Classe', 'Ajuizamento'],
    rows: processos.slice(0, 20).map((processo, index) => ({
      id: processo.numeroLimpo || `processo-${index}`,
      cells: [
        processo.numero,
        processo.tribunalNome || '—',
        processo.classe?.nome || '—',
        shortDate(processo.dataAjuizamento) || '—',
      ],
    })),
  };
}

export function deriveDossierAxes(diligence: DiligenceItem): DossierAxis[] {
  return [
    registrationAxis(diligence),
    shareholdersAxis(diligence),
    contractsAxis(diligence),
    externalControlAxis(diligence),
    sanctionsAxis(diligence),
    judicialAxis(diligence),
    mediaAxis(diligence),
  ];
}
