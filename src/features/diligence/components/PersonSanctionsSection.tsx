// ==========================================================
// DILIGÊNCIA 360 — Sanções de sócios pessoa física
// A busca é nominal: nada aqui confirma identidade.
// ==========================================================

import React from 'react';
import { PersonSanctionsSummary, PersonSanctionCandidate } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Icons } from '../../../components/ui/Icons';

interface PersonSanctionsSectionProps {
  personSanctions?: PersonSanctionsSummary;
}

function coverageBadge(summary?: PersonSanctionsSummary) {
  if (!summary) return <Badge variant="neutral">Não consultado</Badge>;
  switch (summary.coverageStatus) {
    case 'NOT_APPLICABLE':
      return <Badge variant="neutral">Sem sócio pessoa física</Badge>;
    case 'UNAVAILABLE':
      return <Badge variant="critical">Indisponível</Badge>;
    case 'PARTIAL':
      return <Badge variant="medium">Cobertura parcial</Badge>;
    default:
      return summary.totalCandidates > 0
        ? <Badge variant="medium">{summary.totalCandidates} para revisar</Badge>
        : <Badge variant="success">✓ Sem correspondência</Badge>;
  }
}

const CandidateRow: React.FC<{ candidate: PersonSanctionCandidate }> = ({ candidate }) => (
  <div className={`person-sanction-candidate ${candidate.score >= 90 ? 'is-strong' : 'is-weak'}`}>
    <div className="person-sanction-candidate-head">
      <strong>{candidate.sancionado}</strong>
      <span className="person-sanction-score" title="Índice de compatibilidade — não é probabilidade">
        {candidate.score}/100
      </span>
    </div>
    <dl className="person-sanction-facts">
      <div><dt>Cadastro</dt><dd>{candidate.cadastro}</dd></div>
      <div><dt>Documento</dt><dd>{candidate.documentoSancionado || 'não informado'}</dd></div>
      <div><dt>Sanção</dt><dd>{candidate.sancao || 'não informada'}</dd></div>
      <div><dt>Órgão</dt><dd>{candidate.orgao || 'não informado'}</dd></div>
      <div><dt>Vigência</dt><dd>{candidate.inicio || '—'} a {candidate.fim || '—'}</dd></div>
      <div><dt>Situação</dt><dd>{candidate.vigente ? 'Vigente' : 'Expirada'}</dd></div>
    </dl>
    <ul className="person-sanction-signals">
      {(candidate.signals || []).map((signal) => (
        <li key={signal.code} className={signal.matched ? 'is-matched' : ''}>
          <span>{signal.label}</span>
          <small>{signal.detail}</small>
        </li>
      ))}
    </ul>
  </div>
);

export const PersonSanctionsSection: React.FC<PersonSanctionsSectionProps> = ({ personSanctions }) => {
  const results = personSanctions?.resultados || [];
  const withCandidates = results.filter((person) => person.candidatos.length > 0);

  return (
    <Card
      title="Sócios pessoa física em CEIS e CNEP"
      icon={<Icons.Users size={16} />}
      action={coverageBadge(personSanctions)}
    >
      <p className="person-sanction-limit">
        {personSanctions?.limitacao
          || 'O quadro societário público não expõe o CPF completo do sócio, então a busca é feita por nome.'}
      </p>

      {personSanctions && personSanctions.coverageStatus !== 'NOT_APPLICABLE' ? (
        <p className="person-sanction-scope">
          {personSanctions.peopleSearched} de {personSanctions.peopleInQsa} sócio(s) pessoa física pesquisado(s)
          {personSanctions.peopleTruncated ? ' (limite técnico atingido)' : ''}.
          {personSanctions.aviso ? ` ${personSanctions.aviso}` : ''}
        </p>
      ) : null}

      {withCandidates.length === 0 ? (
        <p className="person-sanction-empty">
          {personSanctions?.coverageStatus === 'UNAVAILABLE'
            ? 'Nenhum sócio pôde ser rastreado nesta execução. Ausência de resultado não é ausência de sanção.'
            : personSanctions?.coverageStatus === 'NOT_APPLICABLE'
              ? 'O quadro societário não tem sócio pessoa física.'
              : 'Nenhuma correspondência nominal nos cadastros consultados.'}
        </p>
      ) : (
        <div className="person-sanction-list">
          {withCandidates.map((person) => (
            <section className="person-sanction-person" key={person.nome}>
              <header>
                <strong>{person.nome}</strong>
                <span>{person.qualificacao || 'Integrante do QSA'}</span>
                {person.maskedCpf ? <code>{person.maskedCpf}</code> : null}
              </header>
              {person.candidatos.map((candidate, index) => (
                <CandidateRow key={`${candidate.cadastro}-${candidate.processo}-${index}`} candidate={candidate} />
              ))}
            </section>
          ))}
        </div>
      )}
    </Card>
  );
};
