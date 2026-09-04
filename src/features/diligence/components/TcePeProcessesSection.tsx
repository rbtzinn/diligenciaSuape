// ==========================================================
// DILIGÊNCIA 360 — Controle externo (TCE-PE)
// ==========================================================
// Vinha de pncp.css, que declarava as suas próprias cores em
// hexadecimal (#cfe0d4, #dde4ec, #6b7a8d) e corpos em rem soltos
// (0.95, 0.83, 0.74) — nenhum deles na escala do projeto. Agora usa
// as seções, os fatos e os avisos do sistema.
//
// O texto que separa vínculo nominal de vínculo por documento fica
// preservado: esta base do TCE-PE não informa o CNPJ da parte, e
// essa ressalva é o que impede o achado de virar acusação.
// ==========================================================

import React from 'react';
import { Chip } from '../../../components/ui/Chip';
import { Section } from '../../../components/ui/Section';
import { Note } from '../../../components/ui/Note';
import { Fact, FactGrid } from '../../../components/ui/Facts';
import { Icons } from '../../../components/ui/Icons';
import type { TcePeSummary } from '../types';

interface TcePeProcessesSectionProps {
  summary?: TcePeSummary;
}

function formatDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
}

const SourceLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
  >
    {children}
    <Icons.ExternalLink size={12} aria-hidden="true" />
  </a>
);

export const TcePeProcessesSection: React.FC<TcePeProcessesSectionProps> = ({ summary }) => {
  if (!summary) return null;

  return (
    <Section
      mark="T"
      title={`Controle externo — TCE-PE (${summary.processos.length})`}
      subtitle="Vínculo nominal: esta base não informa o CNPJ da parte"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm leading-relaxed text-ink-2">
          Processos oficiais em que o nome empresarial aparece na lista de interessados. O vínculo é nominal porque essa
          base do TCE-PE não informa o CNPJ da parte.
        </p>

        {!summary.ok ? (
          <Note tone="high" title="Consulta ao TCE-PE indisponível." role="alert">
            {summary.erro}
          </Note>
        ) : null}

        {summary.consultaParcial ? (
          <Note tone="warn" title="Cobertura parcial.">
            Uma parte da pesquisa ou dos detalhes processuais não respondeu.
          </Note>
        ) : null}

<<<<<<< HEAD
      {/* Descarte por identidade. Sem esta linha, um dossiê que reteve 1 de 12
          processos seria lido como se o TCE-PE tivesse devolvido apenas 1. */}
      {(summary.falsePositivesDiscarded || 0) > 0 ? (
        <div className="pncp-notice">
          <strong>
            {summary.falsePositivesDiscarded} processo(s) descartado(s) por incompatibilidade de identidade.
          </strong>
          <p>
            O nome empresarial apareceu, mas o processo trata de outro objeto — tipicamente ato de pessoal
            do órgão — ou a identificação não se sustentou. Eles não entram na exposição e permanecem
            registrados para conferência.
          </p>
        </div>
      ) : null}

      {summary.ok && summary.processos.length === 0 ? (
        <p className="pncp-hint">
          {summary.sourceStatus === 'EMPTY' || !summary.sourceStatus
            ? 'A fonte respondeu e nenhum processo foi localizado pelos nomes empresariais pesquisados.'
            : 'Nenhum processo atribuível à empresa após a verificação de identidade.'}
        </p>
      ) : null}
=======
        {summary.ok && summary.processos.length === 0 ? (
          <Note tone="ok" icon={<Icons.Check size={15} aria-hidden="true" />}>
            Nenhum processo foi localizado pelos nomes empresariais pesquisados.
          </Note>
        ) : null}
>>>>>>> 7522d3339a5eec82602cb402732a3535a6156c83

        {summary.processos.map((process) => (
          <article
            key={process.rawProcessNumber || process.processNumber}
            className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-surface-subtle p-3.5"
          >
            <header className="flex min-w-0 flex-wrap items-center gap-2">
              <Chip
                tone={process.relevance === 'high' ? 'high' : process.relevance === 'medium' ? 'warn' : 'neutral'}
                size="sm"
              >
                {process.modality || 'Processo TCE-PE'}
              </Chip>

              {process.outcome ? (
                <Chip tone={/irregular/i.test(process.outcome) ? 'high' : 'neutral'} size="sm">
                  Resultado: {process.outcome}
                </Chip>
              ) : null}

              <strong className="ml-auto font-mono text-sm font-bold text-ink">{process.processNumber}</strong>
            </header>

            <p className="text-sm leading-relaxed text-ink-2">
              {process.description || 'Descrição não disponibilizada pela fonte.'}
            </p>

            <FactGrid columns={3}>
              <Fact label="Órgão fiscalizado" value={process.organization || '—'} />
              <Fact
                label="Município / exercício"
                value={[process.municipality, process.exercise].filter(Boolean).join(' · ') || '—'}
              />
              <Fact label="Situação" value={process.status || '—'} />
              <Fact label="Julgamento" value={formatDate(process.judgmentDate)} />
              <Fact label="Relator" value={process.rapporteur || '—'} />
              <Fact label="Acórdão" value={process.decisionNumber || '—'} />
              <Fact label="Nome encontrado" value={process.interestedName || '—'} />
              <Fact label="Correspondência" value={process.matchBasis} />
            </FactGrid>

            {process.contractsMentioned.length > 0 ? (
              <p className="text-xs leading-relaxed text-ink-3">
                <strong className="font-semibold text-ink-2">Contratos citados:</strong>{' '}
                {process.contractsMentioned.join(', ')}
              </p>
            ) : null}

            {process.considerations.length > 0 ? (
              <PublishedList title="Fundamentos publicados" items={process.considerations} />
            ) : null}

            {process.determinations.length > 0 ? (
              <PublishedList title="Determinações publicadas" items={process.determinations} />
            ) : null}

            {process.processUrl || process.decisionUrl ? (
              <div className="flex min-w-0 flex-wrap gap-3">
                {process.processUrl ? <SourceLink href={process.processUrl}>Abrir processo</SourceLink> : null}
                {process.decisionUrl ? <SourceLink href={process.decisionUrl}>Abrir decisão</SourceLink> : null}
              </div>
            ) : null}

            <Note tone="warn">{process.attributionWarning}</Note>
          </article>
        ))}

        {summary.limitacao ? (
          <p className="border-t border-line-soft pt-3 text-2xs leading-relaxed text-ink-3">{summary.limitacao}</p>
        ) : null}
      </div>
    </Section>
  );
};

/** Lista recolhível de trechos publicados pela fonte. */
const PublishedList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <details className="overflow-hidden rounded-md border border-line bg-surface">
    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-hover">
      {title} ({items.length})
    </summary>
    <ul className="flex list-disc flex-col gap-1.5 border-t border-line-soft px-3 py-2.5 pl-7 text-xs leading-relaxed text-ink-2">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  </details>
);
