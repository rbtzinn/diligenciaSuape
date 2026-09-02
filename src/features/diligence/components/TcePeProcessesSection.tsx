import React from 'react';
import { Badge } from '../../../components/ui/Badge';
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

export const TcePeProcessesSection: React.FC<TcePeProcessesSectionProps> = ({ summary }) => {
  if (!summary) return null;

  return (
    <section className="pncp-section" aria-labelledby="tce-pe-processes-title">
      <h3 id="tce-pe-processes-title">Controle externo — TCE-PE ({summary.processos.length})</h3>
      <p className="pncp-hint">
        Processos oficiais em que o nome empresarial aparece na lista de interessados. O vínculo é nominal porque essa
        base do TCE-PE não informa o CNPJ da parte.
      </p>

      {!summary.ok ? (
        <div className="pncp-notice pncp-notice-error">
          <strong>Consulta ao TCE-PE indisponível.</strong>
          <p>{summary.erro}</p>
        </div>
      ) : null}

      {summary.consultaParcial ? (
        <div className="pncp-notice pncp-notice-warning">
          <strong>Cobertura parcial.</strong>
          <p>Uma parte da pesquisa ou dos detalhes processuais não respondeu.</p>
        </div>
      ) : null}

      {summary.ok && summary.processos.length === 0 ? (
        <p className="pncp-hint">Nenhum processo foi localizado pelos nomes empresariais pesquisados.</p>
      ) : null}

      {summary.processos.map((process) => (
        <article className="pncp-card" key={process.rawProcessNumber || process.processNumber}>
          <header className="pncp-card-head">
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <Badge variant={process.relevance === 'high' ? 'high' : process.relevance === 'medium' ? 'medium' : 'neutral'} size="sm">
                {process.modality || 'Processo TCE-PE'}
              </Badge>
              {process.outcome ? (
                <Badge variant={/irregular/i.test(process.outcome) ? 'high' : 'neutral'} size="sm">
                  Resultado do processo: {process.outcome}
                </Badge>
              ) : null}
            </div>
            <strong>{process.processNumber}</strong>
          </header>

          <p className="pncp-card-object">{process.description || 'Descrição não disponibilizada pela fonte.'}</p>

          <dl className="pncp-card-grid">
            <div><dt>Órgão fiscalizado</dt><dd>{process.organization || '—'}</dd></div>
            <div><dt>Município / exercício</dt><dd>{[process.municipality, process.exercise].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt>Situação</dt><dd>{process.status || '—'}</dd></div>
            <div><dt>Julgamento</dt><dd>{formatDate(process.judgmentDate)}</dd></div>
            <div><dt>Relator</dt><dd>{process.rapporteur || '—'}</dd></div>
            <div><dt>Acórdão</dt><dd>{process.decisionNumber || '—'}</dd></div>
            <div><dt>Nome encontrado</dt><dd>{process.interestedName || '—'}</dd></div>
            <div><dt>Correspondência</dt><dd>{process.matchBasis}</dd></div>
          </dl>

          {process.contractsMentioned.length > 0 ? (
            <p className="pncp-hint"><strong>Contratos citados:</strong> {process.contractsMentioned.join(', ')}</p>
          ) : null}

          {process.considerations.length > 0 ? (
            <details className="pncp-details">
              <summary>Fundamentos publicados ({process.considerations.length})</summary>
              <ul>{process.considerations.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </details>
          ) : null}

          {process.determinations.length > 0 ? (
            <details className="pncp-details">
              <summary>Determinações publicadas ({process.determinations.length})</summary>
              <ul>{process.determinations.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </details>
          ) : null}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {process.processUrl ? (
              <a className="pncp-card-link" href={process.processUrl} target="_blank" rel="noopener noreferrer">
                Abrir processo <Icons.ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : null}
            {process.decisionUrl ? (
              <a className="pncp-card-link" href={process.decisionUrl} target="_blank" rel="noopener noreferrer">
                Abrir decisão <Icons.ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : null}
          </div>

          <div className="pncp-notice pncp-notice-warning">
            <p>{process.attributionWarning}</p>
          </div>
        </article>
      ))}

      {summary.limitacao ? <p className="pncp-disclaimer">{summary.limitacao}</p> : null}
    </section>
  );
};
