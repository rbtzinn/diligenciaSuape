// ==========================================================
// DILIGÊNCIA 360 — Cartão de evidência
// Um formato só para todo bloco de conteúdo do dossiê, para que
// os cartões fiquem do mesmo tamanho e alinhados na grade.
// ==========================================================

import React from 'react';

export interface EvidenceRow {
  id: string;
  title: string;
  detail?: string;
  /** Valor em destaque à direita, como soma de contrato. */
  value?: string;
  /** Etiqueta à direita, como situação do processo. */
  tag?: { label: string; tone?: 'neutral' | 'red' | 'green' };
}

interface EvidenceCardProps {
  title: string;
  source: string;
  rows: EvidenceRow[];
  emptyMessage: string;
  action?: { label: string; onClick: () => void };
}

export const EvidenceCard: React.FC<EvidenceCardProps> = ({
  title,
  source,
  rows,
  emptyMessage,
  action,
}) => (
  <section className="dossier-card">
    <header className="dossier-card-head">
      <h3>{title}</h3>
      <span>{source}</span>
    </header>

    <div className="dossier-card-body">
      {rows.length === 0 ? (
        <p className="dossier-card-empty">{emptyMessage}</p>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="dossier-row">
            <div className="dossier-row-main">
              <strong>{row.title}</strong>
              {row.detail ? <em>{row.detail}</em> : null}
            </div>
            {row.value ? <span className="dossier-row-value">{row.value}</span> : null}
            {row.tag ? (
              <span className={`dossier-tag tone-${row.tag.tone || 'neutral'}`}>{row.tag.label}</span>
            ) : null}
          </div>
        ))
      )}
    </div>

    {action ? (
      <div className="dossier-card-foot">
        <button type="button" onClick={action.onClick}>{action.label}</button>
      </div>
    ) : null}
  </section>
);
