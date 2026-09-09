// ==========================================================
// DILIGÊNCIA 360 — Gaveta de publicações e ocorrências
// ==========================================================
// A barra de filtros eram oito botões numa `div` com `flex-wrap`:
// no celular ela ocupava quatro fileiras e mais da metade da altura
// útil da gaveta antes do primeiro resultado. Agora é a mesma fita de
// abas do dossiê, que rola em vez de quebrar, e cada filtro leva a
// sua contagem.
//
// Saíram também as classes `.btn` do CSS e os blocos
// `clean-state-block`/`warn-state-block`.
// ==========================================================

import React, { useState } from 'react';
import { AdverseMediaSummary, AdverseMediaStatus } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { AdverseMediaCard } from './AdverseMediaCard';
import { Formatters } from '../../../lib/formatters';
import { formatMediaPlan, formatMediaProviders } from '../utils/mediaSources';
import { Button } from '../../../components/ui/Button';
import { Note } from '../../../components/ui/Note';
import { Section } from '../../../components/ui/Section';
import { TabStrip, TabItem } from '../../../components/ui/TabStrip';
import { Icons } from '../../../components/ui/Icons';

type MediaFilter = 'all' | 'person' | 'company' | 'adverse' | 'general' | 'high' | 'validated' | 'discarded';

interface AdverseMediaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  adverseMedia?: AdverseMediaSummary;
  onStatusChange?: (id: string, newStatus: AdverseMediaStatus) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshNotice?: string | null;
}

export const AdverseMediaDrawer: React.FC<AdverseMediaDrawerProps> = ({
  isOpen,
  onClose,
  adverseMedia,
  onStatusChange,
  onRefresh,
  isRefreshing = false,
  refreshNotice,
}) => {
  const [filter, setFilter] = useState<MediaFilter>('all');

  if (!adverseMedia) return null;

  const results = adverseMedia.results || [];
  const queries = adverseMedia.queriesExecuted || [];
  const failedQueryCount = queries.filter((item) => item.ok === false).length;
  const companyCount = adverseMedia.companyResultsCount ?? results.filter((item) => item.subjectType !== 'person').length;
  const personCount = adverseMedia.personResultsCount ?? results.filter((item) => item.subjectType === 'person').length;
  const adverseCount = adverseMedia.riskRelevantCount ?? results.filter((item) => item.riskRelevant !== false).length;
  const generalCount = adverseMedia.generalMentionsCount ?? results.filter((item) => item.riskRelevant === false).length;

  const filtered = results.filter((item) => {
    if (filter === 'person') return item.subjectType === 'person';
    if (filter === 'company') return item.subjectType !== 'person';
    if (filter === 'adverse') return item.riskRelevant !== false;
    if (filter === 'general') return item.riskRelevant === false;
    if (filter === 'high') return item.matchStrength === 'high';
    if (filter === 'validated') return item.status === 'validated';
    if (filter === 'discarded') return item.status === 'discarded';
    return true;
  });

  const tabs: TabItem[] = [
    { id: 'all', label: 'Todos', count: results.length },
    { id: 'person', label: 'Pessoas', count: personCount },
    { id: 'company', label: 'Empresa', count: companyCount },
    { id: 'adverse', label: 'Com termos de atenção', count: adverseCount },
    { id: 'general', label: 'Menções gerais', count: generalCount },
    { id: 'high', label: 'Maior correlação', count: adverseMedia.strongMatches },
    { id: 'validated', label: 'Validados', count: results.filter((item) => item.status === 'validated').length },
    { id: 'discarded', label: 'Descartados', count: results.filter((item) => item.status === 'discarded').length },
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Publicações e ocorrências: empresa e pessoas"
      subtitle={`${companyCount} da empresa · ${personCount} de pessoas · ${adverseMedia.peopleSearched || 0} integrante(s) pesquisado(s) · ${Formatters.dateTime(adverseMedia.consultadoEm)}`}
    >
      {/* ---- Descarte por identidade ---- */}
      {/* "5 resultados" e "5 de 60, com 55 descartados por não serem desta
          empresa" descrevem coberturas muito diferentes. */}
      {(adverseMedia.falsePositivesDiscarded || 0) > 0 ? (
        <Note tone="ok" role="status">
          {adverseMedia.falsePositivesDiscarded} resultado(s) foram descartados por não sustentarem a
          identidade da empresa: citavam apenas uma palavra da razão social, sem CNPJ, nome completo
          ou qualquer outra âncora. Eles não constam da lista abaixo nem do cálculo de exposição.
        </Note>
      ) : null}

      {/* ---- Atualização ---- */}
      {onRefresh ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 text-2xs text-ink-3">
              {formatMediaPlan(adverseMedia.queryPlanVersion)} ·{' '}
              {formatMediaProviders(adverseMedia.providerSources, adverseMedia.provider)}
            </span>

            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              isLoading={isRefreshing}
              loadingLabel="Atualizando…"
              icon={<Icons.RefreshCw size={14} aria-hidden="true" />}
            >
              Atualizar notícias
            </Button>
          </div>

          {refreshNotice ? (
            <Note tone={adverseMedia.consultaParcial ? 'warn' : 'ok'} role="status">
              {refreshNotice}
            </Note>
          ) : null}
        </div>
      ) : null}

      {/* ---- Consultas executadas ---- */}
      {queries.length > 0 ? (
        <Section
          collapsible
          defaultOpen={false}
          title={`Consultas realizadas no provedor (${queries.length})`}
          subtitle={failedQueryCount > 0 ? `${failedQueryCount} sem resposta do provedor` : undefined}
          trailing={
            failedQueryCount > 0 ? (
              <Icons.AlertCircle size={15} aria-hidden="true" className="text-high" />
            ) : undefined
          }
          flush
        >
          <ul className="divide-y divide-line-soft">
            {queries.map((query, index) => (
              <li key={`${query.query}-${index}`} className="flex min-w-0 items-center gap-2 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-2xs font-bold uppercase tracking-wide ${
                      query.subjectType === 'person' ? 'text-warn-text' : 'text-brand'
                    }`}
                  >
                    {query.subjectType === 'person' ? 'Pessoa' : 'Empresa'} ·{' '}
                    {query.subjectName || 'Entidade pesquisada'}
                  </span>
                  <code className="block truncate font-mono text-2xs text-ink-2">{query.query}</code>
                </span>

                {/* Consulta bloqueada e consulta sem achado são opostos.
                    Mostrar "0 itens" nas duas esconde a falha do canal. */}
                <span
                  title={query.ok === false ? query.erro || 'A consulta não foi respondida pelo provedor.' : undefined}
                  className={`shrink-0 text-2xs ${
                    query.ok === false ? 'font-bold text-high-text' : 'text-ink-3'
                  }`}
                >
                  {query.ok === false
                    ? `falhou${query.status ? ` (HTTP ${query.status})` : ''}`
                    : `${query.count} itens`}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ---- Filtros ---- */}
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-line bg-surface px-1">
        <TabStrip
          items={tabs}
          activeId={filter}
          onSelect={(id) => setFilter(id as MediaFilter)}
          label="Filtros de publicações"
          className="!mx-0 !px-0"
        />
      </div>

      {/* ---- Resultados ---- */}
      {filtered.length === 0 ? (
        <Note tone="neutral" icon={<Icons.Filter size={15} aria-hidden="true" />}>
          Nenhum resultado para o filtro selecionado.
        </Note>
      ) : (
        <div className="flex min-w-0 flex-col gap-2.5">
          {filtered.map((item) => (
            <AdverseMediaCard key={item.id} item={item} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}

      <p className="rounded-lg bg-surface-subtle p-3 text-2xs leading-relaxed text-ink-3">
        A busca pública apenas localiza conteúdo para leitura. Correspondência de nome não confirma identidade, fato,
        investigação, processo, crime ou condenação.
      </p>
    </Drawer>
  );
};
