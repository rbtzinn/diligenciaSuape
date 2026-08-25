import type { GovernanceHistoryResult, GovernanceHistorySnapshot, Shareholder } from '../types';

export type GovernanceCategory = 'director' | 'shareholder' | 'other';
export type ExerciseStatus = 'confirmed' | 'not_listed' | 'unknown' | 'outside';

export interface GovernanceTimelineEntry {
  id: string;
  name: string;
  qualification: string;
  document?: string;
  startDate?: string;
  endDate?: string;
  categories: GovernanceCategory[];
  exercises: Array<{ year: number; status: ExerciseStatus }>;
  isCurrent: boolean;
  periodSummary?: string;
  evidenceSummary?: string;
  sourceKind: 'current_registry' | 'cvm_fre';
}

export interface GovernanceTimeline {
  years: number[];
  entries: GovernanceTimelineEntry[];
  directors: number;
  shareholders: number;
  datedEntries: number;
  currentYear: number;
  historical: boolean;
  coverageStatus: GovernanceHistoryResult['coverageStatus'] | 'current_only';
  consultedYears: number;
  sourceName?: string;
  sourceUrl?: string;
  consultedAt?: string;
  notice?: string;
}

const DIRECTOR_PATTERN = /ADMINISTR|DIRETOR|PRESIDENTE|CONSELHEIR|GESTOR|REPRESENTANTE|LIQUIDANTE/;
const SHAREHOLDER_PATTERN = /SOCIO|ACIONISTA|QUOTISTA|TITULAR|CONSORCIAD|COMANDIT|COOPERAD|FILIAD/;

function normalized(value?: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseCalendarDate(value?: string): Date | null {
  const text = String(value || '').trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function categoriesFor(qualification: string): GovernanceCategory[] {
  const value = normalized(qualification);
  const categories: GovernanceCategory[] = [];
  if (DIRECTOR_PATTERN.test(value)) categories.push('director');
  if (SHAREHOLDER_PATTERN.test(value)) categories.push('shareholder');
  return categories.length > 0 ? categories : ['other'];
}

function currentRegistryExerciseStatus(
  year: number,
  startDate: Date | null,
  endDate: Date | null,
  currentYear: number,
): ExerciseStatus {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  if (startDate && startDate > yearEnd) return 'outside';
  if (endDate && endDate < yearStart) return 'outside';
  if (endDate) return 'confirmed';
  return year === currentYear ? 'confirmed' : 'unknown';
}

function earliestSnapshotDate(snapshots: GovernanceHistorySnapshot[]) {
  const candidates = snapshots
    .flatMap((snapshot) => [snapshot.firstMandateStart, snapshot.possessionDate])
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, parsed: parseCalendarDate(value) }))
    .filter((item): item is { value: string; parsed: Date } => Boolean(item.parsed))
    .sort((left, right) => left.parsed.getTime() - right.parsed.getTime());
  return candidates[0]?.value;
}

function formatPercent(value?: number | null) {
  if (!Number.isFinite(value)) return undefined;
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(Number(value));
}

function buildCvmTimeline(history: GovernanceHistoryResult, referenceDate: Date): GovernanceTimeline {
  const currentYear = referenceDate.getFullYear();
  const years = history.years.length > 0
    ? [...history.years].sort((left, right) => left - right)
    : Array.from({ length: 5 }, (_, index) => currentYear - 4 + index);
  const coverage = new Map(history.coverage.map((item) => [item.year, item.status]));

  const entries = history.members.map((member): GovernanceTimelineEntry => {
    const categories: GovernanceCategory[] = [];
    if (member.categories.some((category) => category !== 'shareholder')) categories.push('director');
    if (member.categories.includes('shareholder')) categories.push('shareholder');
    if (categories.length === 0) categories.push('other');

    const latest = member.latestSnapshot;
    const startDate = categories.includes('director') ? earliestSnapshotDate(member.snapshots) : undefined;
    const sharePercent = formatPercent(latest.totalSharePercent);
    const roleChanged = new Set(member.snapshots.map((snapshot) => `${snapshot.category}:${normalized(snapshot.qualification)}`)).size > 1;
    const periodSummary = categories.includes('shareholder')
      ? sharePercent !== undefined
        ? `Participação no exercício ${latest.year}: ${sharePercent}%`
        : `Posição acionária no exercício ${latest.year}`
      : startDate
        ? `${roleChanged ? 'Último início declarado' : 'Início declarado'}: ${startDate}${latest.mandateTerm ? ` · prazo: ${latest.mandateTerm}` : ''}`
        : latest.mandateTerm
          ? `Prazo informado: ${latest.mandateTerm}`
          : `${member.firstSeenExercise} a ${member.lastSeenExercise} no FRE`;
    const evidenceParts = [
      latest.electionDate ? `Eleição ${latest.electionDate}` : null,
      latest.possessionDate ? `Posse ${latest.possessionDate}` : null,
      latest.controller ? 'Controlador' : null,
    ].filter(Boolean);

    return {
      id: member.id,
      name: member.name,
      qualification: member.qualification || 'Vínculo de governança',
      document: member.document,
      startDate,
      categories,
      exercises: years.map((year) => {
        if (member.years.includes(year)) return { year, status: 'confirmed' as const };
        const status = coverage.get(year);
        return {
          year,
          status: status === 'consulted' || status === 'no_record' ? 'not_listed' as const : 'unknown' as const,
        };
      }),
      isCurrent: member.presentInLatestExercise,
      periodSummary,
      evidenceSummary: evidenceParts.join(' · ') || undefined,
      sourceKind: 'cvm_fre',
    };
  }).sort((left, right) => {
    const leftRank = left.categories.includes('director') ? 0 : left.categories.includes('shareholder') ? 1 : 2;
    const rightRank = right.categories.includes('director') ? 0 : right.categories.includes('shareholder') ? 1 : 2;
    return leftRank - rightRank || left.name.localeCompare(right.name, 'pt-BR');
  });

  return {
    years,
    entries,
    directors: entries.filter((entry) => entry.categories.includes('director')).length,
    shareholders: entries.filter((entry) => entry.categories.includes('shareholder')).length,
    datedEntries: entries.filter((entry) => Boolean(entry.startDate)).length,
    currentYear: years[years.length - 1] || currentYear,
    historical: true,
    coverageStatus: history.coverageStatus,
    consultedYears: history.consultedYears || history.coverage.filter((item) => item.status === 'consulted').length,
    sourceName: history.provider,
    sourceUrl: history.sourceUrl,
    consultedAt: history.consultadoEm,
    notice: history.aviso,
  };
}

export function buildGovernanceTimeline(
  shareholders: Shareholder[],
  history?: GovernanceHistoryResult,
  referenceDate = new Date(),
): GovernanceTimeline {
  if (history?.applicable && history.ok && history.members.length > 0) {
    return buildCvmTimeline(history, referenceDate);
  }

  const currentYear = referenceDate.getFullYear();
  const years = Array.from({ length: 5 }, (_, index) => currentYear - 4 + index);

  const entries = shareholders
    .filter((item) => Boolean(item.nome_socio?.trim()))
    .map((item, index): GovernanceTimelineEntry => {
      const qualification = item.qualificacao_socio?.trim() || 'Vínculo não qualificado';
      const startDate = parseCalendarDate(item.data_entrada_sociedade);
      const endDate = parseCalendarDate(item.data_saida_sociedade);
      const categories = categoriesFor(qualification);

      return {
        id: `${normalized(item.nome_socio)}-${normalized(qualification)}-${index}`,
        name: item.nome_socio.trim(),
        qualification,
        document: item.cnpj_cpf_do_socio,
        startDate: item.data_entrada_sociedade,
        endDate: item.data_saida_sociedade,
        categories,
        exercises: years.map((year) => ({
          year,
          status: currentRegistryExerciseStatus(year, startDate, endDate, currentYear),
        })),
        isCurrent: !endDate || endDate >= referenceDate,
        sourceKind: 'current_registry',
      };
    })
    .sort((left, right) => {
      const leftRank = left.categories.includes('director') ? 0 : left.categories.includes('shareholder') ? 1 : 2;
      const rightRank = right.categories.includes('director') ? 0 : right.categories.includes('shareholder') ? 1 : 2;
      return leftRank - rightRank || left.name.localeCompare(right.name, 'pt-BR');
    });

  return {
    years,
    entries,
    directors: entries.filter((entry) => entry.categories.includes('director')).length,
    shareholders: entries.filter((entry) => entry.categories.includes('shareholder')).length,
    datedEntries: entries.filter((entry) => Boolean(entry.startDate)).length,
    currentYear,
    historical: false,
    coverageStatus: history?.coverageStatus || 'current_only',
    consultedYears: 1,
    sourceName: history?.provider,
    sourceUrl: history?.sourceUrl,
    consultedAt: history?.consultadoEm,
    notice: history?.aviso || history?.erro,
  };
}
