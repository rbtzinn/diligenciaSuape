// ==========================================================
// DILIGÊNCIA 360 — Cobertura de fontes orientada à ação
// ==========================================================
// O que exige ação aparece primeiro; consulta concluída e fonte não
// aplicável ficam recolhidas. A distinção entre "consultamos e nada
// há" e "não consultamos" é o ponto da tela, e agora ela também está
// na cor da linha, não só no texto.
//
// O desenho saiu de dossier-v3/evidence.css, cujas linhas de fonte
// eram um grid de cinco colunas que no celular cortava a data e o
// resultado.
// ==========================================================

import React from 'react';
import { SanctionsResult, PepPartnerResult, JudicialProcessItem, AdverseMediaSummary } from '../types';
import { Section } from '../../../components/ui/Section';
import { Icons } from '../../../components/ui/Icons';
import { Fact, FactGrid } from '../../../components/ui/Facts';
import { Formatters } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';

interface EvidenceSectionProps {
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  pepResults: PepPartnerResult[];
  processosJudiciais?: JudicialProcessItem[];
  adverseMedia?: AdverseMediaSummary;
  consultadoEm?: string;
}

type SourceState = 'consulted' | 'action' | 'not_applicable';

interface SourceItem {
  base: string;
  provider: string;
  status: string;
  result: string;
  time: string;
  state: SourceState;
}

const STATE_STYLE: Record<SourceState, { row: string; icon: string }> = {
  consulted: { row: 'border-l-ok', icon: 'text-ok' },
  action: { row: 'border-l-warn bg-warn-bg/40', icon: 'text-warn' },
  not_applicable: { row: 'border-l-line-strong', icon: 'text-ink-muted' },
};

const SourceRow: React.FC<{ source: SourceItem }> = ({ source }) => (
  <article
    className={cn(
      'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-l-4 border-line-soft px-3 py-2.5 last:border-b-0',
      STATE_STYLE[source.state].row,
    )}
  >
    <span aria-hidden="true" className={cn('shrink-0', STATE_STYLE[source.state].icon)}>
      {source.state === 'consulted' ? (
        <Icons.CheckCircle size={16} />
      ) : source.state === 'action' ? (
        <Icons.AlertTriangle size={16} />
      ) : (
        <Icons.Info size={16} />
      )}
    </span>

    <span className="min-w-0 flex-1 basis-[180px]">
      <strong className="block truncate text-sm font-bold text-ink">{source.base}</strong>
      <span className="block truncate text-2xs text-ink-3">{source.provider}</span>
    </span>

    <span className="shrink-0 text-xs font-semibold text-ink-2">{source.status}</span>
    <span className="min-w-0 flex-1 basis-[120px] text-xs text-ink-3">{source.result}</span>
    <time className="num shrink-0 font-mono text-2xs text-ink-muted">{source.time}</time>
  </article>
);

/** Grupo recolhível de fontes num mesmo estado. */
const SourceGroup: React.FC<{
  icon: React.ReactNode;
  label: React.ReactNode;
  sources: SourceItem[];
  defaultOpen?: boolean;
  muted?: boolean;
}> = ({ icon, label, sources, defaultOpen = false, muted = false }) => (
  <details open={defaultOpen} className="overflow-hidden rounded-lg border border-line bg-surface">
    <summary
      className={cn(
        'flex min-w-0 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-surface-hover',
        muted ? 'text-ink-3' : 'text-ink-2',
      )}
    >
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      <Icons.ChevronDown size={15} aria-hidden="true" className="shrink-0 text-ink-3" />
    </summary>
    <div className="border-t border-line-soft">
      {sources.map((source) => (
        <SourceRow source={source} key={source.base} />
      ))}
    </div>
  </details>
);

export const EvidenceSection: React.FC<EvidenceSectionProps> = ({
  ceis,
  cnep,
  pepResults,
  processosJudiciais = [],
  adverseMedia,
  consultadoEm,
}) => {
  const pepHits = pepResults.filter((partner) => partner.encontrado).length;
  const fallbackDate = consultadoEm || new Date().toISOString();
  const sourceTime = (value?: string) => Formatters.time(value || fallbackDate);

  const sanctionSource = (base: string, result?: SanctionsResult): SourceItem => {
    if (!result) {
      return {
        base,
        provider: 'Portal da Transparência',
        status: 'Não consultado',
        result: 'Execute novamente a diligência para consultar esta fonte.',
        time: sourceTime(),
        state: 'action',
      };
    }
    if (result.semChave) {
      return {
        base,
        provider: 'Portal da Transparência',
        status: 'Não consultado',
        result: 'Configure a chave de acesso do Portal da Transparência.',
        time: sourceTime(result.consultadoEm),
        state: 'action',
      };
    }
    if (!result.ok) {
      return {
        base,
        provider: 'Portal da Transparência',
        status: 'Não consultado',
        result: 'Fonte indisponível nesta execução; tente novamente.',
        time: sourceTime(result.consultadoEm),
        state: 'action',
      };
    }
    return {
      base,
      provider: 'Portal da Transparência',
      status: 'Consultado',
      result: result.encontrado ? `${result.quantidade} registro(s)` : 'Nenhum registro encontrado',
      time: sourceTime(result.consultadoEm),
      state: 'consulted',
    };
  };

  const sources: SourceItem[] = [
    {
      base: 'Dados da empresa',
      provider: 'Receita Federal (BrasilAPI)',
      status: 'Consultado',
      result: 'Cadastro completo recuperado',
      time: sourceTime(),
      state: 'consulted',
    },
    sanctionSource('Empresas impedidas (CEIS)', ceis),
    sanctionSource('Punições por corrupção (CNEP)', cnep),
    pepResults.length > 0
      ? {
          base: 'Cargos políticos (PEP)',
          provider: 'Portal da Transparência',
          status: 'Consultado',
          result: pepHits > 0 ? `${pepHits} possível(is) coincidência(s)` : 'Nenhum registro encontrado',
          time: sourceTime(),
          state: 'consulted',
        }
      : {
          base: 'Cargos políticos (PEP)',
          provider: 'Portal da Transparência',
          status: 'Não aplicável',
          result: 'Não havia pessoa relacionada disponível para pesquisa.',
          time: sourceTime(),
          state: 'not_applicable',
        },
    !adverseMedia || adverseMedia.semChave || !adverseMedia.ok
      ? {
          base: 'Notícias na internet',
          provider: adverseMedia?.provider || 'Brave Search',
          status: 'Não consultado',
          result: adverseMedia?.semChave
            ? 'Configure o provedor de pesquisa pública.'
            : 'A busca não foi concluída nesta execução.',
          time: sourceTime(adverseMedia?.consultadoEm),
          state: 'action',
        }
      : {
          base: 'Notícias na internet',
          provider: adverseMedia.provider || 'Brave Search',
          status: 'Consultado',
          result: `${adverseMedia.results?.length || 0} resultado(s) analisado(s)`,
          time: sourceTime(adverseMedia.consultadoEm),
          state: 'consulted',
        },
    processosJudiciais.length > 0
      ? {
          base: 'Processos na Justiça',
          provider: 'CNJ (DataJud)',
          status: 'Consultado',
          result: `${processosJudiciais.length} processo(s) consultado(s)`,
          time: sourceTime(processosJudiciais[0]?.consultadoEm),
          state: 'consulted',
        }
      : {
          base: 'Processos na Justiça',
          provider: 'CNJ (DataJud)',
          status: 'Não aplicável',
          result: 'Nenhum número CNJ validado para consulta.',
          time: sourceTime(),
          state: 'not_applicable',
        },
  ];

  const actionSources = sources.filter((source) => source.state === 'action');
  const consultedSources = sources.filter((source) => source.state === 'consulted');
  const notApplicableSources = sources.filter((source) => source.state === 'not_applicable');

  return (
    <Section
      mark={<Icons.Database size={12} aria-hidden="true" />}
      title="Cobertura das fontes"
      subtitle="O que exige ação aparece primeiro"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm leading-relaxed text-ink-2">
          O que exige ação aparece primeiro. Consultas concluídas e fontes não aplicáveis ficam recolhidas para reduzir
          ruído.
        </p>

        <FactGrid columns={3}>
          <Fact
            label="Não consultada(s)"
            value={actionSources.length}
            tone={actionSources.length > 0 ? 'warn' : 'muted'}
          />
          <Fact label="Consultada(s)" value={consultedSources.length} tone="ok" />
          <Fact label="Não aplicável(is)" value={notApplicableSources.length} tone="muted" />
        </FactGrid>

        {actionSources.length > 0 ? (
          <section
            aria-labelledby="source-action-title"
            className="overflow-hidden rounded-lg border border-warn-line bg-surface"
          >
            <header className="flex min-w-0 items-start gap-2 border-b border-warn-line bg-warn-bg px-3 py-2.5">
              <Icons.AlertTriangle size={17} aria-hidden="true" className="mt-px shrink-0 text-warn" />
              <div className="min-w-0">
                <strong id="source-action-title" className="block text-sm font-bold text-warn-text">
                  Fontes que ainda exigem ação
                </strong>
                <span className="block text-xs text-warn-text/80">
                  Essas lacunas condicionam a conclusão do dossiê.
                </span>
              </div>
            </header>
            <div>
              {actionSources.map((source) => (
                <SourceRow source={source} key={source.base} />
              ))}
            </div>
          </section>
        ) : null}

        <SourceGroup
          icon={<Icons.CheckCircle size={16} className="text-ok" />}
          label={`${consultedSources.length} fontes consultadas`}
          sources={consultedSources}
          defaultOpen={actionSources.length === 0}
        />

        {notApplicableSources.length > 0 ? (
          <SourceGroup
            icon={<Icons.Info size={16} className="text-ink-muted" />}
            label={`${notApplicableSources.length} não aplicável(is) nesta execução`}
            sources={notApplicableSources}
            muted
          />
        ) : null}
      </div>
    </Section>
  );
};
