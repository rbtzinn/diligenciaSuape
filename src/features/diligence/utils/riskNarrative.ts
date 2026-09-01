// ==========================================================
// DILIGÊNCIA 360 — Leitura de risco em linguagem simples
// Traduz o índice e as evidências em frases que qualquer pessoa
// da área de negócio entende, sem substituir o detalhamento técnico.
// Nada aqui inventa dado: tudo vem do que as fontes responderam.
// ==========================================================

import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery, RiskDetail } from '../types';

export type NarrativeTone = 'clear' | 'attention' | 'critical';

export interface RiskNarrative {
  tone: NarrativeTone;
  headline: string;
  verdict: string;
  supports: string[];
  gaps: string[];
  nextStep: string;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isCoverageGap(detail: RiskDetail): boolean {
  return detail.natureza === 'coverage' || detail.categoria === 'COBERTURA';
}

function companyAgeYears(openingDate?: string): number | null {
  if (!openingDate) return null;
  const parsed = new Date(openingDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Monta a leitura textual da diligência.
 * O tom acompanha o índice de atenção, mas sanção vigente e mídia forte
 * elevam o tom mesmo com índice baixo: registro oficial pesa mais que média.
 */
export function buildRiskNarrative(
  diligence: DiligenceItem,
  adverseMedia?: AdverseMediaSummary,
  discoveries: ProcessDiscovery[] = [],
): RiskNarrative {
  const score = Math.max(0, Math.min(100, diligence.risco?.score || 0));
  const details = Array.isArray(diligence.risco?.detalhes) ? diligence.risco.detalhes : [];
  const confirmed = details.filter((item) => item.natureza === 'confirmed');
  const gapDetails = details.filter(isCoverageGap);

  const activeSanctions = (diligence.ceis?.registros || [])
    .concat(diligence.cnep?.registros || [])
    .filter((item) => item.vigente === true).length;
  const mediaItems = (adverseMedia?.results || []).filter((item) => item.status !== 'discarded');
  const strongMedia = mediaItems.filter((item) => item.matchStrength === 'high').length;
  const gazettes = diligence.officialGazettes;
  const gazetteCount = gazettes?.ok ? gazettes.totalFound : 0;
  const pendingReview = mediaItems.filter((item) => item.status === 'candidate').length;

  const tone: NarrativeTone = activeSanctions > 0 || score >= 60
    ? 'critical'
    : (score >= 35 || strongMedia > 0 ? 'attention' : 'clear');

  const headline = tone === 'critical'
    ? 'Não avance sem revisar'
    : tone === 'attention'
      ? 'Precisa de leitura humana'
      : 'Nada bloqueia por enquanto';

  const verdict = activeSanctions > 0
    ? `Há ${pluralize(activeSanctions, 'sanção vigente', 'sanções vigentes')} em base oficial. Isso impede contratar antes de análise jurídica.`
    : tone === 'critical'
      ? 'O conjunto de sinais é forte o bastante para exigir decisão consciente, com parecer registrado.'
      : tone === 'attention'
        ? 'Nenhum impedimento oficial apareceu, mas há achados que uma pessoa precisa confirmar ou descartar.'
        : 'Nenhum impedimento oficial ativo foi encontrado nas fontes que responderam nesta execução.';

  const supports: string[] = [];
  const situation = String(diligence.empresa?.descricao_situacao_cadastral || '').trim();
  const ageYears = companyAgeYears(diligence.empresa?.data_inicio_atividade);
  if (situation) {
    supports.push(
      ageYears !== null && ageYears > 0
        ? `Situação na Receita: ${situation.toLowerCase()}, com ${pluralize(ageYears, 'ano', 'anos')} de atividade.`
        : `Situação na Receita: ${situation.toLowerCase()}.`,
    );
  }
  if (activeSanctions > 0) {
    supports.push(`${pluralize(activeSanctions, 'sanção vigente', 'sanções vigentes')} em CEIS ou CNEP.`);
  }
  if (strongMedia > 0) {
    supports.push(`${pluralize(strongMedia, 'publicação', 'publicações')} com correlação alta com a entidade.`);
  } else if (mediaItems.length > 0) {
    supports.push(`${pluralize(mediaItems.length, 'publicação candidata', 'publicações candidatas')}, nenhuma com correlação alta.`);
  }
  if (gazetteCount > 0) {
    const people = gazettes?.peopleSearched || 0;
    supports.push(
      people > 0
        ? `${pluralize(gazetteCount, 'edição', 'edições')} de diário oficial citam a empresa ou ${pluralize(people, 'pessoa pesquisada', 'pessoas pesquisadas')}.`
        : `${pluralize(gazetteCount, 'edição', 'edições')} de diário oficial citam a empresa.`,
    );
  }
  if (discoveries.length > 0) {
    supports.push(`${pluralize(discoveries.length, 'processo localizado', 'processos localizados')} a partir das evidências.`);
  }
  for (const item of confirmed) {
    if (supports.length >= 6) break;
    if (!supports.some((text) => text.includes(item.criterio))) supports.push(`${item.criterio}.`);
  }

  const gaps = gapDetails.map((item) => item.criterio);
  if (gazettes && !gazettes.ok) gaps.push('Diários oficiais não responderam');
  if (adverseMedia && !adverseMedia.ok) gaps.push('Busca de notícias e documentos não concluída');

  const nextStep = activeSanctions > 0
    ? 'Abra as sanções oficiais e leve o caso ao jurídico antes de qualquer decisão.'
    : pendingReview > 0
      ? `Revise ${pluralize(pendingReview, 'achado pendente', 'achados pendentes')} em Notícias e documentos: confirme ou descarte cada um.`
      : gaps.length > 0
        ? `Complete a cobertura: ${gaps.length === 1 ? gaps[0].toLowerCase() : `${gaps.length} verificações ficaram em aberto`}.`
        : 'Registre a conclusão e finalize a diligência.';

  return {
    tone,
    headline,
    verdict,
    supports: supports.slice(0, 6),
    gaps: [...new Set(gaps)].slice(0, 5),
    nextStep,
  };
}
