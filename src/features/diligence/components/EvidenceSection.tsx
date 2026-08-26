// ==========================================================
// DILIGÊNCIA 360 — Cobertura de fontes orientada à ação
// ==========================================================

import React from 'react';
import { SanctionsResult, PepPartnerResult, JudicialProcessItem, AdverseMediaSummary } from '../types';
import { Card } from '../../../components/ui/Card';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

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

const SourceRow: React.FC<{ source: SourceItem }> = ({ source }) => (
  <article className={`source-state-row source-state-row-${source.state}`}>
    <span className="source-state-icon" aria-hidden="true">
      {source.state === 'consulted'
        ? <Icons.CheckCircle size={17} />
        : source.state === 'action'
          ? <Icons.AlertTriangle size={17} />
          : <Icons.Info size={17} />}
    </span>
    <div className="source-state-main">
      <strong>{source.base}</strong>
      <span>{source.provider}</span>
    </div>
    <span className="source-state-status">{source.status}</span>
    <span className="source-state-result">{source.result}</span>
    <time className="font-mono">{source.time}</time>
  </article>
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
    <Card
      title="Cobertura das fontes"
      icon={<Icons.Database size={16} aria-hidden="true" />}
      className="dash-full-width source-coverage-card"
    >
      <div className="source-coverage-intro">
        <p>O que exige ação aparece primeiro. Consultas concluídas e fontes não aplicáveis ficam recolhidas para reduzir ruído.</p>
        <div className="source-coverage-metrics" aria-label="Resumo da cobertura">
          <span className={actionSources.length > 0 ? 'has-action' : ''}><strong>{actionSources.length}</strong> não consultada(s)</span>
          <span><strong>{consultedSources.length}</strong> consultada(s)</span>
          <span><strong>{notApplicableSources.length}</strong> não aplicável(is)</span>
        </div>
      </div>

      {actionSources.length > 0 ? (
        <section className="source-action-group" aria-labelledby="source-action-title">
          <header>
            <Icons.AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong id="source-action-title">Fontes que ainda exigem ação</strong>
              <span>Essas lacunas condicionam a conclusão do dossiê.</span>
            </div>
          </header>
          <div>{actionSources.map((source) => <SourceRow source={source} key={source.base} />)}</div>
        </section>
      ) : null}

      <details className="source-state-group" open={actionSources.length === 0}>
        <summary>
          <span><Icons.CheckCircle size={17} aria-hidden="true" /> {consultedSources.length} fontes consultadas <strong>✓</strong></span>
          <Icons.ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div>{consultedSources.map((source) => <SourceRow source={source} key={source.base} />)}</div>
      </details>

      {notApplicableSources.length > 0 ? (
        <details className="source-state-group source-state-group-muted">
          <summary>
            <span><Icons.Info size={17} aria-hidden="true" /> {notApplicableSources.length} não aplicável(is) nesta execução</span>
            <Icons.ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div>{notApplicableSources.map((source) => <SourceRow source={source} key={source.base} />)}</div>
        </details>
      ) : null}
    </Card>
  );
};
