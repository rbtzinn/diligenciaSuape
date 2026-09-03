// ==========================================================
// DILIGÊNCIA 360 — Achados consolidados do dossiê
// ==========================================================
// Função pura: lê o dossiê e produz uma lista única, ordenada por gravidade.
//
// Antes, cada fonte tinha a sua gaveta e caberia a quem analisa abrir todas e
// montar o quadro de cabeça. O achado só existia se a pessoa lembrasse de
// procurá-lo. Aqui as fontes convergem para uma lista só.
//
// Nada nesta camada afirma irregularidade. Contrato público é exposição;
// processo de controle externo cita a empresa como interessada; menção em
// mídia é hipótese. O texto de cada achado carrega essa distinção, porque é
// ela que separa um dossiê defensável de uma acusação.
// ==========================================================

import type { DiligenceItem } from '../../types';

export type FindingSeverity = 'critico' | 'alto' | 'moderado' | 'atencao' | 'informativo' | 'positivo';

export interface DossierFinding {
  id: string;
  severity: FindingSeverity;
  /** Fonte oficial que sustenta o achado; aparece como selo no card. */
  source: string;
  title: string;
  description: string;
  /** Valor monetário ou contagem em destaque, quando existir. */
  highlight?: string;
  /** Gaveta que abre o detalhamento, quando houver. */
  drawer?: 'sanctions' | 'processes' | 'media' | 'pncp' | 'shareholders' | 'audit';
  url?: string;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critico: 0,
  alto: 1,
  moderado: 2,
  atencao: 3,
  informativo: 4,
  positivo: 5,
};

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  moderado: 'Moderado',
  atencao: 'Atenção',
  informativo: 'Informativo',
  positivo: 'Sem ocorrência',
};

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function plural(count: number, singular: string, pluralWord: string) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

/** 1. Sanção vigente é o único achado que impede contratar por si só. */
function sanctionFindings(diligence: DiligenceItem): DossierFinding[] {
  const findings: DossierFinding[] = [];

  for (const [id, label, result] of [
    ['ceis', 'CEIS', diligence.ceis],
    ['cnep', 'CNEP', diligence.cnep],
  ] as const) {
    if (!result?.ok) continue;
    const total = result.quantidade || 0;
    const active = result.vigentes ?? 0;

    if (total === 0) {
      findings.push({
        id: `sancao-${id}-limpa`,
        severity: 'positivo',
        source: label,
        title: `Nenhuma sanção no ${label}`,
        description: 'A consulta respondeu e não retornou registro para este CNPJ. Ausência de sanção não é atestado de idoneidade.',
        drawer: 'sanctions',
      });
      continue;
    }

    findings.push({
      id: `sancao-${id}`,
      severity: active > 0 ? 'critico' : 'moderado',
      source: label,
      title: active > 0
        ? `${plural(active, 'sanção vigente', 'sanções vigentes')} no ${label}`
        : `${plural(total, 'sanção histórica', 'sanções históricas')} no ${label}`,
      description: active > 0
        ? 'Sanção em vigor aplicada diretamente à empresa. Verifique abrangência e prazo antes de qualquer decisão.'
        : 'Registro encerrado. Não impede contratar, mas compõe o histórico de integridade.',
      highlight: plural(total, 'registro', 'registros'),
      drawer: 'sanctions',
    });
  }

  const people = diligence.personSanctions;
  if (people?.ok && (people.totalCandidates || 0) > 0) {
    findings.push({
      id: 'sancao-pessoas',
      severity: (people.strongCandidates || 0) > 0 ? 'moderado' : 'atencao',
      source: 'CEIS/CNEP — sócios',
      title: `${plural(people.totalCandidates, 'candidato', 'candidatos')} em busca nominal de sócios`,
      description: 'A busca é por nome, sem CPF completo. Cada retorno é hipótese de homônimo até confirmação documental.',
      drawer: 'sanctions',
    });
  }

  return findings;
}

/** 2. Controle externo: a empresa aparece como interessada, o que não a condena. */
function externalControlFindings(diligence: DiligenceItem): DossierFinding[] {
  const tce = diligence.tcePe;
  if (!tce?.ok) return [];

  const total = tce.processos?.length || 0;
  if (total === 0) {
    return [{
      id: 'tce-limpo',
      severity: 'positivo',
      source: 'TCE-PE',
      title: 'Nenhum processo de controle externo localizado',
      description: 'A consulta ao TCE-PE respondeu e não retornou processo com a empresa entre os interessados.',
    }];
  }

  const irregular = tce.resumo?.resultadosIrregulares || 0;
  return [{
    id: 'tce-processos',
    severity: irregular > 0 ? 'alto' : 'moderado',
    source: 'TCE-PE',
    title: irregular > 0
      ? `${plural(irregular, 'processo julgado irregular', 'processos julgados irregulares')} no TCE-PE`
      : `${plural(total, 'processo de controle externo', 'processos de controle externo')} no TCE-PE`,
    description: 'A empresa consta nominalmente como interessada. O resultado é do processo de controle, e não uma sanção aplicada a ela.',
    highlight: plural(total, 'processo', 'processos'),
    url: tce.processos?.[0]?.processUrl || undefined,
  }];
}

/** 3. Contrato público é exposição mensurável, não irregularidade. */
function publicContractFindings(diligence: DiligenceItem): DossierFinding[] {
  const findings: DossierFinding[] = [];
  const pncp = diligence.pncp;

  if (pncp?.ok) {
    const confirmed = pncp.resumo?.confirmados || 0;
    if (confirmed > 0) {
      findings.push({
        id: 'pncp-contratos',
        severity: 'moderado',
        source: 'PNCP',
        title: `${plural(confirmed, 'contrato público confirmado', 'contratos públicos confirmados')}`,
        description: `Identidade confirmada pelo CNPJ do fornecedor no documento, em ${plural(pncp.resumo?.orgaosDistintos || 0, 'órgão', 'órgãos')}. Exposição ao setor público, não irregularidade.`,
        highlight: currency(pncp.resumo?.valorTotalConfirmado || 0),
        drawer: 'pncp',
      });
    }
    if ((pncp.resumo?.divergentes || 0) > 0) {
      findings.push({
        id: 'pncp-divergentes',
        severity: 'informativo',
        source: 'PNCP',
        title: `${plural(pncp.resumo?.divergentes || 0, 'documento cita o nome', 'documentos citam o nome')}, mas são de outro CNPJ`,
        description: 'Homônimo ou citação de terceiro. Mantido à vista para que o descarte seja auditável.',
        drawer: 'pncp',
      });
    }
  }

  const federal = diligence.federalExposure;
  if (federal?.ok && (federal.resumo?.recursosRecebidos || 0) > 0) {
    findings.push({
      id: 'recursos-federais',
      severity: 'informativo',
      source: 'Portal da Transparência',
      title: 'Recursos federais recebidos',
      description: `Pagamentos de origem federal identificados em ${plural(federal.resumo?.orgaosPagadores || 0, 'órgão', 'órgãos')}.`,
      highlight: currency(federal.recursos?.valorTotal || 0),
    });
  }

  return findings;
}

/** 4. Judicial: o DataJud não informa o polo, então não se afirma posição. */
function judicialFindings(diligence: DiligenceItem): DossierFinding[] {
  const total = diligence.processosJudiciais?.length || 0;
  const discovered = diligence.processosDescobertos?.length || 0;
  if (total === 0 && discovered === 0) return [];

  return [{
    id: 'judicial',
    severity: total > 0 ? 'moderado' : 'atencao',
    source: 'CNJ — DataJud',
    title: `${plural(total + discovered, 'processo judicial', 'processos judiciais')} localizados`,
    description: 'O DataJud não informa o polo da parte, então a posição processual da empresa não pode ser afirmada a partir daqui.',
    drawer: 'processes',
  }];
}

/** 5 e 6. Mídia: menção relevante a risco separada de menção neutra. */
function mediaFindings(diligence: DiligenceItem): DossierFinding[] {
  const media = diligence.adverseMedia;
  if (!media?.ok) return [];

  const results = (media.results || []).filter((item) => item.status !== 'discarded');
  const relevant = results.filter((item) => item.riskRelevant).length;
  const findings: DossierFinding[] = [];

  if (relevant > 0) {
    findings.push({
      id: 'midia-risco',
      severity: 'atencao',
      source: 'Mídia e web',
      title: `${plural(relevant, 'publicação relevante a risco', 'publicações relevantes a risco')}`,
      description: 'Menção nominal é hipótese investigativa. Só vira achado depois de validação humana da identidade.',
      drawer: 'media',
    });
  }

  const neutral = results.length - relevant;
  if (neutral > 0) {
    findings.push({
      id: 'midia-neutra',
      severity: 'informativo',
      source: 'Mídia e web',
      title: `${plural(neutral, 'menção neutra', 'menções neutras')}`,
      description: 'Publicações sem termo adverso no trecho retornado. Não elevam risco.',
      drawer: 'media',
    });
  }

  const gazettes = diligence.officialGazettes;
  if (gazettes?.ok && (gazettes.results?.length || 0) > 0) {
    findings.push({
      id: 'diarios',
      severity: 'informativo',
      source: 'Diários oficiais',
      title: `${plural(gazettes.results.length, 'publicação em diário oficial', 'publicações em diários oficiais')}`,
      description: 'Atos publicados que citam a empresa. Fonte primária, com link para o documento.',
    });
  }

  return findings;
}

export function deriveDossierFindings(diligence: DiligenceItem): DossierFinding[] {
  return [
    ...sanctionFindings(diligence),
    ...externalControlFindings(diligence),
    ...publicContractFindings(diligence),
    ...judicialFindings(diligence),
    ...mediaFindings(diligence),
  ].sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);
}
