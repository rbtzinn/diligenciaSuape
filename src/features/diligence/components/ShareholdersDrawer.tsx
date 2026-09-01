// ==========================================================
// DILIGÊNCIA 360 — Linha do Tempo de Diretores e Sócios
// Cinco exercícios, período de vínculo, cobertura e proveniência
// ==========================================================

import React, { useState, useMemo } from 'react';
import { GovernanceHistoryResult, Shareholder, PepPartnerResult } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Icons } from '../../../components/ui/Icons';
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
      panelClassName="governance-drawer"
    >
      <div className="governance-history">
        <section className={`governance-coverage ${timeline.historical ? 'history-available' : ''}`} aria-labelledby="governance-coverage-title">
          <div className="governance-coverage-icon" aria-hidden="true">
            <Icons.Clock size={22} />
          </div>
          <div>
            <span>{timeline.historical ? 'HISTÓRICO OFICIAL LOCALIZADO' : 'COBERTURA HISTÓRICA'}</span>
            <h4 id="governance-coverage-title">
              {timeline.historical ? 'Administração e posição acionária por exercício' : 'O quadro atual não substitui a linha do tempo oficial'}
            </h4>
            {timeline.historical ? (
              <>
                <p>
                  O sistema comparou os arquivos anuais do Formulário de Referência da CVM. Os anos identificam o FRE de referência; “consta” não presume que a pessoa manteve o mesmo cargo durante todo o ano.
                </p>
                {timeline.notice ? <p className="governance-coverage-extra">{timeline.notice}</p> : null}
              </>
            ) : (
              <>
                <p>
                  A fonte consultada confirma quem está no quadro vigente e, quando disponível, a data de ingresso.
                  Pessoas que já saíram exigem a Certidão Específica — Linha do Tempo do QSA ou os atos societários.
                </p>
                {isJointStockCompany ? (
                  <p className="governance-coverage-extra">
                    Para esta S.A., acionistas também devem ser conferidos nos documentos da CVM ou no livro societário.
                  </p>
                ) : null}
              </>
            )}
          </div>
          <span className="governance-coverage-status">
            {timeline.historical ? `${timeline.consultedYears}/${timeline.years.length} exercícios` : 'Histórico parcial'}
          </span>
        </section>

        <div className="governance-kpis" aria-label="Resumo do quadro de governança">
          <div><strong>{timeline.years.length}</strong><span>exercícios visíveis</span></div>
          <div><strong>{timeline.directors}</strong><span>diretor(es) e conselheiro(s)</span></div>
          <div><strong>{timeline.shareholders}</strong><span>sócio(s) ou acionista(s)</span></div>
          <div>
            <strong>{timeline.historical ? `${timeline.consultedYears}/${timeline.years.length}` : `${timeline.datedEntries}/${timeline.entries.length}`}</strong>
            <span>{timeline.historical ? 'arquivos anuais consultados' : 'com data de ingresso'}</span>
          </div>
          <div>
            <strong>{timeline.entries.filter((entry) => !entry.isCurrent).length}</strong>
            <span>não constam no exercício mais recente</span>
          </div>
        </div>

        <div className="governance-toolbar">
          <div className="governance-filters" aria-label="Filtrar tipo de vínculo">
            {FILTERS.map((filter) => (
              <button
                type="button"
                key={filter.id}
                className={activeFilter === filter.id ? 'active' : ''}
                aria-pressed={activeFilter === filter.id}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="governance-search">
            <Icons.Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar pessoa ou cargo"
              placeholder="Buscar pessoa ou cargo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        </div>

        <div className="governance-timeline-scroll">
          <div className="governance-timeline" style={{ '--exercise-count': timeline.years.length } as React.CSSProperties}>
            <div className="governance-timeline-head">
              <span>Pessoa e evidência mais recente</span>
              {timeline.years.map((year) => (
                <span key={year}>
                  {year}
                  {timeline.historical ? <small>FRE</small> : year === timeline.currentYear ? <small>em curso</small> : null}
                </span>
              ))}
            </div>

            {filteredEntries.length > 0 ? filteredEntries.map((entry) => {
              const pepData = pepMap.get(entry.name.trim().toLocaleUpperCase('pt-BR'));
              const hasPepCandidate = Boolean(pepData?.encontrado);
              return (
                <article className="governance-person-row" key={entry.id}>
                  <div className="governance-person">
                    <div className={`governance-person-mark ${entry.categories.includes('director') ? 'director' : 'shareholder'}`} aria-hidden="true">
                      {entry.categories.includes('director') ? <Icons.Shield size={16} /> : <Icons.Users size={16} />}
                    </div>
                    <div>
                      <strong>{entry.name}</strong>
                      <span>{entry.sourceKind === 'cvm_fre' ? `Função mais recente · ${entry.qualification}` : entry.qualification}</span>
                      <div className="governance-person-meta">
                        <em>{categoryLabel(entry.categories)}</em>
                        <small>{entry.periodSummary || periodLabel(entry.startDate, entry.endDate)}</small>
                        {hasPepCandidate ? <b>PEP a validar</b> : null}
                        {timeline.historical && !entry.isCurrent ? <b className="former">Não consta em {timeline.currentYear}</b> : null}
                      </div>
                      {entry.evidenceSummary ? <small className="governance-evidence-line">{entry.evidenceSummary}</small> : null}
                      {/* Sócio pessoa jurídica: abre nova diligência sem redigitar o CNPJ. */}
                      {onDrillCompany && entryCnpj(entry.document) ? (
                        <button
                          type="button"
                          className="governance-drill-button"
                          onClick={() => onDrillCompany(entryCnpj(entry.document) as string, entry.name)}
                        >
                          <Icons.Search size={13} aria-hidden="true" />
                          <span>Fazer a diligência desta empresa</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {entry.exercises.map((exercise) => (
                    <div
                      className={`governance-exercise ${exercise.status}`}
                      key={exercise.year}
                      aria-label={`${exercise.year}: ${exercise.status === 'confirmed' ? 'consta no exercício' : exercise.status === 'not_listed' ? 'não consta no exercício' : exercise.status === 'unknown' ? 'sem cobertura histórica' : 'fora do período'}`}
                    >
                      {exercise.status === 'confirmed' ? <><i /><span>Consta</span></> : null}
                      {exercise.status === 'not_listed' ? <><i>—</i><span>Não consta</span></> : null}
                      {exercise.status === 'unknown' ? <><i>?</i><span>Sem fonte</span></> : null}
                      {exercise.status === 'outside' ? <><i>—</i><span>Fora</span></> : null}
                    </div>
                  ))}
                </article>
              );
            }) : (
              <div className="governance-empty">
                <Icons.Search size={20} aria-hidden="true" />
                <strong>Nenhum vínculo corresponde ao filtro.</strong>
                <span>Altere a categoria ou o termo pesquisado.</span>
              </div>
            )}
          </div>
        </div>

        <div className="governance-legend">
          <span><i className="confirmed" /> Consta no documento do exercício</span>
          {timeline.historical ? <span><i className="not-listed">—</i> Não consta no documento anual</span> : null}
          <span><i className="unknown">?</i> Exercício sem fonte conclusiva</span>
          <span><i className="outside">—</i> Fora do período informado</span>
        </div>

        <footer className="governance-source">
          <Icons.Database size={16} aria-hidden="true" />
          <span>
            <strong>{timeline.historical ? 'Fonte histórica:' : 'Fonte do quadro atual:'}</strong>{' '}
            {timeline.sourceUrl ? <a href={timeline.sourceUrl} target="_blank" rel="noreferrer">{timeline.sourceName || sourceName}</a> : (timeline.sourceName || sourceName)}
          </span>
          {(timeline.consultedAt || consultedAt) ? <time dateTime={timeline.consultedAt || consultedAt}>Consultado em {Formatters.dateTime(timeline.consultedAt || consultedAt || '')}</time> : null}
        </footer>
      </div>
    </Drawer>
  );
};
