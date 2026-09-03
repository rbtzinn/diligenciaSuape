// ==========================================================
// DILIGÊNCIA 360 — Linha do tempo de diretores e sócios
// ==========================================================
// Cinco exercícios, período de vínculo, cobertura e proveniência.
// A distinção entre "não consta no documento do exercício" e
// "exercício sem fonte conclusiva" continua explícita: são as duas
// células que um leitor apressado leria como a mesma coisa.
//
// O desenho vinha de governance-history/{coverage,people}.css — 620
// linhas com paleta própria em hexadecimal e corpos de até 0.55rem
// (menos de 9px). A matriz pessoa × exercício continua sendo uma
// grade que rola na horizontal, agora com a largura das colunas
// declarada no componente, e não por uma variável CSS solta.
// ==========================================================

import React, { useState, useMemo } from 'react';
import { GovernanceHistoryResult, Shareholder, PepPartnerResult } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Icons } from '../../../components/ui/Icons';
import { Chip } from '../../../components/ui/Chip';
import { Note } from '../../../components/ui/Note';
import { Button } from '../../../components/ui/Button';
import { TabStrip } from '../../../components/ui/TabStrip';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Fact, FactGrid } from '../../../components/ui/Facts';
import { cn } from '../../../lib/cn';
import { Formatters } from '../../../lib/formatters';
import { buildGovernanceTimeline, type GovernanceCategory } from '../utils/governanceHistory';
import { extractShareholderCnpj } from '../utils/entityCnpj';

/** Só sócio pessoa jurídica com CNPJ completo permite abrir nova diligência. */
function entryCnpj(document?: string): string | null {
  return extractShareholderCnpj({ nome_socio: '', cnpj_cpf_do_socio: document });
}

interface ShareholdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  socios: Shareholder[];
  pepResults: PepPartnerResult[];
  sourceName?: string;
  consultedAt?: string;
  legalNature?: string;
  governanceHistory?: GovernanceHistoryResult;
  onDrillCompany?: (cnpj: string, name: string) => void;
}

type GovernanceFilter = 'all' | GovernanceCategory | 'former';

const FILTERS: Array<{ id: GovernanceFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'director', label: 'Direção e conselhos' },
  { id: 'shareholder', label: 'Sócios e acionistas' },
  { id: 'former', label: 'Não constam em 2026' },
];

function periodLabel(startDate?: string, endDate?: string) {
  if (startDate && endDate) return `${Formatters.date(startDate)} a ${Formatters.date(endDate)}`;
  if (startDate) return `Desde ${Formatters.date(startDate)}`;
  if (endDate) return `Até ${Formatters.date(endDate)}`;
  return 'Ingresso não informado pela fonte';
}

function categoryLabel(categories: GovernanceCategory[]) {
  if (categories.includes('director') && categories.includes('shareholder')) return 'Sócio e administrador';
  if (categories.includes('director')) return 'Administração';
  if (categories.includes('shareholder')) return 'Participação societária';
  return 'Outro vínculo cadastral';
}

/** Coluna da pessoa mais uma coluna por exercício. */
const GRID_COLS = '[grid-template-columns:minmax(270px,2fr)_repeat(var(--exercise-count),minmax(82px,0.7fr))]';

/**
 * As quatro células da matriz. "Não consta no documento" e "sem
 * fonte conclusiva" são estados opostos e precisam ser
 * distinguíveis à primeira vista — antes só o glifo os separava.
 */
const EXERCISE_COPY = {
  confirmed: {
    glyph: '✓',
    label: 'Consta',
    legend: 'Consta no documento do exercício',
    aria: 'consta no exercício',
    surface: 'bg-ok-bg',
    mark: 'text-ok-text',
  },
  not_listed: {
    glyph: '—',
    label: 'Não consta',
    legend: 'Não consta no documento anual',
    aria: 'não consta no exercício',
    surface: 'bg-warn-bg',
    mark: 'text-warn-text',
  },
  unknown: {
    glyph: '?',
    label: 'Sem fonte',
    legend: 'Exercício sem fonte conclusiva',
    aria: 'sem cobertura histórica',
    surface: 'bg-surface-subtle',
    mark: 'text-ink-muted',
  },
  outside: {
    glyph: '—',
    label: 'Fora',
    legend: 'Fora do período informado',
    aria: 'fora do período',
    surface: 'bg-surface',
    mark: 'text-ink-muted',
  },
} as const;

export const ShareholdersDrawer: React.FC<ShareholdersDrawerProps> = ({
  isOpen,
  onClose,
  socios = [],
  pepResults = [],
  sourceName = 'Receita Federal / BrasilAPI',
  consultedAt,
  legalNature,
  governanceHistory,
  onDrillCompany,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<GovernanceFilter>('all');

  const timeline = useMemo(() => buildGovernanceTimeline(socios, governanceHistory), [governanceHistory, socios]);
  const isJointStockCompany = useMemo(() => {
    const nature = String(legalNature || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return nature.includes('ANONIMA') || nature.includes('ECONOMIA MISTA');
  }, [legalNature]);

  const pepMap = useMemo(() => {
    const map = new Map<string, PepPartnerResult>();
    pepResults.forEach((p) => map.set(p.nome.trim().toLocaleUpperCase('pt-BR'), p));
    return map;
  }, [pepResults]);

  const filteredEntries = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return timeline.entries.filter((entry) => {
      const matchesFilter = activeFilter === 'all'
        || (activeFilter === 'former' ? !entry.isCurrent : entry.categories.includes(activeFilter));
      const matchesSearch = !term.trim()
        || entry.name.toLowerCase().includes(term)
        || entry.qualification.toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchTerm, timeline.entries]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Diretores e sócios — últimos 5 exercícios"
      subtitle={`${timeline.years[0]} a ${timeline.currentYear} · ${timeline.entries.length} pessoa(s) ou acionista(s) identificados`}
      width="xl"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {/* ---- Cobertura da fonte ---- */}
        <Note
          tone={timeline.historical ? 'ok' : 'warn'}
          icon={<Icons.Clock size={16} aria-hidden="true" />}
          title={
            timeline.historical
              ? 'Administração e posição acionária por exercício'
              : 'O quadro atual não substitui a linha do tempo oficial'
          }
          action={
            <Chip tone={timeline.historical ? 'ok' : 'warn'} size="sm">
              {timeline.historical
                ? `${timeline.consultedYears}/${timeline.years.length} exercícios`
                : 'Histórico parcial'}
            </Chip>
          }
        >
          {timeline.historical ? (
            <>
              <p>
                O sistema comparou os arquivos anuais do Formulário de Referência da CVM. Os anos identificam o FRE de
                referência; “consta” não presume que a pessoa manteve o mesmo cargo durante todo o ano.
              </p>
              {timeline.notice ? <p className="mt-1">{timeline.notice}</p> : null}
            </>
          ) : (
            <>
              <p>
                A fonte consultada confirma quem está no quadro vigente e, quando disponível, a data de ingresso.
                Pessoas que já saíram exigem a Certidão Específica — Linha do Tempo do QSA ou os atos societários.
              </p>
              {isJointStockCompany ? (
                <p className="mt-1">
                  Para esta S.A., acionistas também devem ser conferidos nos documentos da CVM ou no livro societário.
                </p>
              ) : null}
            </>
          )}
        </Note>

        {/* ---- Resumo ---- */}
        <section
          aria-label="Resumo do quadro de governança"
          className="rounded-card border border-line bg-surface p-4 shadow-xs"
        >
          <FactGrid columns={3}>
            <Fact label="Exercícios visíveis" value={timeline.years.length} />
            <Fact label="Diretor(es) e conselheiro(s)" value={timeline.directors} />
            <Fact label="Sócio(s) ou acionista(s)" value={timeline.shareholders} />
            <Fact
              label={timeline.historical ? 'Arquivos anuais consultados' : 'Com data de ingresso'}
              value={
                timeline.historical
                  ? `${timeline.consultedYears}/${timeline.years.length}`
                  : `${timeline.datedEntries}/${timeline.entries.length}`
              }
            />
            <Fact
              label="Não constam no exercício mais recente"
              value={timeline.entries.filter((entry) => !entry.isCurrent).length}
              tone="warn"
            />
          </FactGrid>
        </section>

        {/* ---- Filtros ---- */}
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <TabStrip
            items={FILTERS.map((filter) => ({ id: filter.id, label: filter.label }))}
            activeId={activeFilter}
            onSelect={(id) => setActiveFilter(id as GovernanceFilter)}
            label="Filtrar tipo de vínculo"
            className="lg:mx-0 lg:px-0"
          />

          <label className="relative flex min-w-0 shrink-0 items-center lg:w-[260px]">
            <Icons.Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-3" />
            <input
              type="search"
              aria-label="Buscar pessoa ou cargo"
              placeholder="Buscar pessoa ou cargo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="min-h-[var(--control-height-sm)] w-full min-w-0 rounded-[var(--control-radius-sm)] border border-line bg-surface pl-9 pr-3 text-xs text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus:shadow-[var(--ring-focus)]"
            />
          </label>
        </div>

        {/* ---- Matriz pessoa × exercício ----
            Rola na horizontal dentro do próprio cartão: com cinco
            exercícios mais a coluna da pessoa, não há largura de
            celular que caiba sem cortar. */}
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-xs">
          <div className="overflow-x-auto overscroll-x-contain">
            <div
              className="min-w-[820px]"
              style={{
                ['--exercise-count' as string]: timeline.years.length,
              }}
            >
              <div className={cn('grid border-b border-line bg-surface-subtle', GRID_COLS)}>
                <span className="flex min-h-[46px] flex-col justify-center px-4 text-2xs font-bold uppercase tracking-wide text-ink-3">
                  Pessoa e evidência mais recente
                </span>
                {timeline.years.map((year) => (
                  <span
                    key={year}
                    className="num flex min-h-[46px] flex-col items-center justify-center border-l border-line-soft px-2 text-xs font-bold text-ink-2"
                  >
                    {year}
                    {timeline.historical ? (
                      <small className="text-2xs font-bold text-brand">FRE</small>
                    ) : year === timeline.currentYear ? (
                      <small className="text-2xs font-bold text-brand">em curso</small>
                    ) : null}
                  </span>
                ))}
              </div>

              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => {
                  const pepData = pepMap.get(entry.name.trim().toLocaleUpperCase('pt-BR'));
                  const hasPepCandidate = Boolean(pepData?.encontrado);
                  const drillCnpj = entryCnpj(entry.document);
                  const isDirector = entry.categories.includes('director');

                  return (
                    <article key={entry.id} className={cn('grid border-b border-line-soft last:border-b-0', GRID_COLS)}>
                      <div className="flex min-w-0 items-start gap-2.5 p-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'grid size-8 shrink-0 place-items-center rounded-md',
                            isDirector ? 'bg-brand-soft text-brand' : 'bg-surface-active text-ink-2',
                          )}
                        >
                          {isDirector ? <Icons.Shield size={15} /> : <Icons.Users size={15} />}
                        </span>

                        <div className="min-w-0 flex-1">
                          <strong className="block text-sm font-bold leading-snug text-ink">{entry.name}</strong>
                          <span className="block text-xs text-ink-2">
                            {entry.sourceKind === 'cvm_fre'
                              ? `Função mais recente · ${entry.qualification}`
                              : entry.qualification}
                          </span>

                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                            <Chip tone="muted" size="sm">
                              {categoryLabel(entry.categories)}
                            </Chip>
                            <span className="text-2xs text-ink-3">
                              {entry.periodSummary || periodLabel(entry.startDate, entry.endDate)}
                            </span>
                            {hasPepCandidate ? (
                              <Chip tone="warn" size="sm">
                                PEP a validar
                              </Chip>
                            ) : null}
                            {timeline.historical && !entry.isCurrent ? (
                              <Chip tone="neutral" size="sm">
                                Não consta em {timeline.currentYear}
                              </Chip>
                            ) : null}
                          </div>

                          {entry.evidenceSummary ? (
                            <span className="mt-1 block text-2xs leading-snug text-ink-3">{entry.evidenceSummary}</span>
                          ) : null}

                          {/* Sócio pessoa jurídica: abre nova diligência
                              sem redigitar o CNPJ. */}
                          {onDrillCompany && drillCnpj ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1.5"
                              onClick={() => onDrillCompany(drillCnpj, entry.name)}
                              icon={<Icons.Search size={13} aria-hidden="true" />}
                            >
                              Fazer a diligência desta empresa
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {entry.exercises.map((exercise) => (
                        <div
                          key={exercise.year}
                          aria-label={`${exercise.year}: ${EXERCISE_COPY[exercise.status].aria}`}
                          className={cn(
                            'flex min-w-0 flex-col items-center justify-center gap-0.5 border-l border-line-soft p-2 text-center',
                            EXERCISE_COPY[exercise.status].surface,
                          )}
                        >
                          <span aria-hidden="true" className={cn('text-sm font-bold', EXERCISE_COPY[exercise.status].mark)}>
                            {EXERCISE_COPY[exercise.status].glyph}
                          </span>
                          <span className="text-2xs leading-tight">{EXERCISE_COPY[exercise.status].label}</span>
                        </div>
                      ))}
                    </article>
                  );
                })
              ) : (
                <EmptyState
                  icon={<Icons.Search size={18} />}
                  title="Nenhum vínculo corresponde ao filtro."
                  description="Altere a categoria ou o termo pesquisado."
                />
              )}
            </div>
          </div>
        </div>

        {/* ---- Legenda ---- */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface-subtle px-3 py-2.5">
          {(['confirmed', 'not_listed', 'unknown', 'outside'] as const)
            .filter((status) => timeline.historical || status !== 'not_listed')
            .map((status) => (
              <span key={status} className="flex items-center gap-1.5 text-2xs text-ink-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-4 place-items-center rounded-sm text-2xs font-bold',
                    EXERCISE_COPY[status].surface,
                    EXERCISE_COPY[status].mark,
                  )}
                >
                  {EXERCISE_COPY[status].glyph}
                </span>
                {EXERCISE_COPY[status].legend}
              </span>
            ))}
        </div>

        {/* ---- Proveniência ---- */}
        <footer className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line-soft pt-3 text-2xs text-ink-3">
          <Icons.Database size={14} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0">
            <strong className="font-semibold text-ink-2">
              {timeline.historical ? 'Fonte histórica:' : 'Fonte do quadro atual:'}
            </strong>{' '}
            {timeline.sourceUrl ? (
              <a
                href={timeline.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brand hover:underline"
              >
                {timeline.sourceName || sourceName}
              </a>
            ) : (
              timeline.sourceName || sourceName
            )}
          </span>
          {timeline.consultedAt || consultedAt ? (
            <time dateTime={timeline.consultedAt || consultedAt} className="ml-auto shrink-0">
              Consultado em {Formatters.dateTime(timeline.consultedAt || consultedAt || '')}
            </time>
          ) : null}
        </footer>
      </div>
    </Drawer>
  );
};
