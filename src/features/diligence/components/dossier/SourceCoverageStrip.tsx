// ==========================================================
// DILIGÊNCIA 360 — Faixa de cobertura das fontes
// Mostra o que respondeu, o que veio vazio e o que falhou.
// ==========================================================

import React from 'react';
import type { SourceCoverageItem } from './sourceCoverage';
import { SOURCE_STATUS_LABEL, summarizeCoverage } from './sourceCoverage';

interface SourceCoverageStripProps {
  items: SourceCoverageItem[];
}

export const SourceCoverageStrip: React.FC<SourceCoverageStripProps> = ({ items }) => {
  const resumo = summarizeCoverage(items);

  return (
    <section className="dossier-coverage" aria-label="Cobertura das fontes consultadas">
      <header className="dossier-coverage-head">
        <h3>Cobertura das fontes</h3>
        <span className={`dossier-coverage-badge ${resumo.completa ? 'is-complete' : 'is-partial'}`}>
          {resumo.completa
            ? `${resumo.total} fontes responderam`
            : `${resumo.falhou} sem resposta · ${resumo['nao-consultada']} não consultada(s)`}
        </span>
      </header>

      {!resumo.completa ? (
        <p className="dossier-coverage-warning">
          Ausência de achado nas fontes que não responderam não pode ser lida como ausência de ocorrência.
        </p>
      ) : null}

      <ul className="dossier-coverage-list">
        {items.map((item) => (
          <li key={item.id} className={`dossier-coverage-item status-${item.status}`}>
            <span className="dossier-coverage-dot" aria-hidden="true" />
            <span className="dossier-coverage-label">{item.label}</span>
            <span className="dossier-coverage-status">
              {SOURCE_STATUS_LABEL[item.status]}
              {item.detail ? <em>{item.detail}</em> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
