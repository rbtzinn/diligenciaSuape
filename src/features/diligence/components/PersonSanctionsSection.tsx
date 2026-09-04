// ==========================================================
// DILIGÊNCIA 360 — Sanções de sócios pessoa física
// ==========================================================
// A busca é nominal: nada aqui confirma identidade. Por isso o
// índice de compatibilidade aparece como número, e nunca como
// probabilidade ou selo de culpa.
//
// O desenho vinha de components/person-sanctions.css, com paleta e
// corpos próprios. Agora sai das seções, fatos e selos do projeto.
// ==========================================================

import React from 'react';
import { PersonSanctionsSummary, PersonSanctionCandidate } from '../types';
import { Section } from '../../../components/ui/Section';
import { Chip, ChipTone } from '../../../components/ui/Chip';
import { Note } from '../../../components/ui/Note';
import { Fact, FactGrid } from '../../../components/ui/Facts';
import { Icons } from '../../../components/ui/Icons';
import { cn } from '../../../lib/cn';

interface PersonSanctionsSectionProps {
  personSanctions?: PersonSanctionsSummary;
}

/** Selo de cobertura. "Indisponível" nunca vira "sem correspondência". */
function coverageChip(summary?: PersonSanctionsSummary) {
  const chip = (tone: ChipTone, label: string) => (
    <Chip tone={tone} size="sm" dot>
      {label}
    </Chip>
  );

  if (!summary) return chip('muted', 'Não consultado');

  switch (summary.coverageStatus) {
    case 'NOT_APPLICABLE':
      return chip('muted', 'Sem sócio pessoa física');
    case 'UNAVAILABLE':
      return chip('high', 'Indisponível');
    case 'PARTIAL':
      return chip('warn', 'Cobertura parcial');
    default:
      return summary.totalCandidates > 0
        ? chip('warn', `${summary.totalCandidates} para revisar`)
        : chip('ok', 'Sem correspondência');
  }
}

const CandidateRow: React.FC<{ candidate: PersonSanctionCandidate }> = ({ candidate }) => {
  const strong = candidate.score >= 90;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2.5 rounded-lg border-l-4 border border-line bg-surface p-3',
        strong ? 'border-l-high' : 'border-l-warn',
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <strong className="min-w-0 flex-1 text-sm font-bold leading-snug text-ink">{candidate.sancionado}</strong>
        <Chip
          tone={strong ? 'high' : 'warn'}
          size="sm"
          title="Índice de compatibilidade — não é probabilidade"
          className="num shrink-0"
        >
          {candidate.score}/100
        </Chip>
      </div>

      <FactGrid columns={3}>
        <Fact label="Cadastro" value={candidate.cadastro} />
        <Fact label="Documento" value={candidate.documentoSancionado || 'não informado'} mono />
        <Fact label="Sanção" value={candidate.sancao || 'não informada'} />
        <Fact label="Órgão" value={candidate.orgao || 'não informado'} />
        <Fact label="Vigência" value={`${candidate.inicio || '—'} a ${candidate.fim || '—'}`} />
        <Fact
          label="Situação"
          value={candidate.vigente ? 'Vigente' : 'Expirada'}
          tone={candidate.vigente ? 'high' : 'muted'}
        />
      </FactGrid>

      {/* Sinal que casou e sinal que não casou precisam ser
          distinguíveis: é o que sustenta ou derruba a coincidência. */}
      {(candidate.signals || []).length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1 border-t border-line-soft pt-2">
          {(candidate.signals || []).map((signal) => (
            <li key={signal.code} className="flex min-w-0 items-start gap-2">
              <span
                aria-hidden="true"
                className={cn('mt-1 size-1.5 shrink-0 rounded-full', signal.matched ? 'bg-ok' : 'bg-line-strong')}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'text-xs',
                    signal.matched ? 'font-semibold text-ink' : 'text-ink-3',
                  )}
                >
                  {signal.label}
                </span>
                <span className="block text-2xs leading-snug text-ink-3">{signal.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const PersonSanctionsSection: React.FC<PersonSanctionsSectionProps> = ({ personSanctions }) => {
  const results = personSanctions?.resultados || [];
  const withCandidates = results.filter((person) => person.candidatos.length > 0);

  const emptyCopy =
    personSanctions?.coverageStatus === 'UNAVAILABLE'
      ? 'Nenhum sócio pôde ser rastreado nesta execução. Ausência de resultado não é ausência de sanção.'
      : personSanctions?.coverageStatus === 'NOT_APPLICABLE'
        ? 'O quadro societário não tem sócio pessoa física.'
        : 'Nenhuma correspondência nominal nos cadastros consultados.';

  return (
    <Section
      mark={<Icons.Users size={12} />}
      title="Sócios pessoa física em CEIS e CNEP"
      subtitle="Busca nominal — não confirma identidade"
      trailing={coverageChip(personSanctions)}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-xs leading-relaxed text-ink-3">
          {personSanctions?.limitacao
            || 'O quadro societário público não expõe o CPF completo do sócio, então a busca é feita por nome.'}
        </p>

        {personSanctions && personSanctions.coverageStatus !== 'NOT_APPLICABLE' ? (
          <p className="text-xs leading-relaxed text-ink-2">
            {personSanctions.peopleSearched} de {personSanctions.peopleInQsa} sócio(s) pessoa física pesquisado(s)
            {personSanctions.peopleTruncated ? ' (limite técnico atingido)' : ''}.
            {personSanctions.aviso ? ` ${personSanctions.aviso}` : ''}
          </p>
        ) : null}

        {withCandidates.length === 0 ? (
          <Note
            tone={personSanctions?.coverageStatus === 'UNAVAILABLE' ? 'warn' : 'ok'}
            icon={
              personSanctions?.coverageStatus === 'UNAVAILABLE' ? (
                <Icons.AlertTriangle size={15} aria-hidden="true" />
              ) : (
                <Icons.Check size={15} aria-hidden="true" />
              )
            }
          >
            {emptyCopy}
          </Note>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            {withCandidates.map((person) => (
              <section key={person.nome} className="flex min-w-0 flex-col gap-2">
                <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line-soft pb-1.5">
                  <strong className="min-w-0 text-sm font-bold text-ink">{person.nome}</strong>
                  <span className="text-xs text-ink-3">{person.qualificacao || 'Integrante do QSA'}</span>
                  {person.maskedCpf ? (
                    <code className="ml-auto rounded-sm bg-surface-active px-1.5 font-mono text-2xs text-ink-2">
                      {person.maskedCpf}
                    </code>
                  ) : null}
                </header>

                {person.candidatos.map((candidate, index) => (
                  <CandidateRow key={`${candidate.cadastro}-${candidate.processo}-${index}`} candidate={candidate} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
};
