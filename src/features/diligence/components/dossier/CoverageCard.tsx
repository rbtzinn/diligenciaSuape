// ==========================================================
// DILIGÊNCIA 360 — Cartão de fontes consultadas
// Compacto por escolha: o que precisa saltar é a fonte que falhou.
// ==========================================================

import React from 'react';
import type { SourceCoverageItem, SourceStatus } from './sourceCoverage';
import { SOURCE_STATUS_LABEL, summarizeCoverage } from './sourceCoverage';

interface CoverageCardProps {
  items: SourceCoverageItem[];
  onOpenDetail: () => void;
}

const CHIP_CLASS: Record<SourceStatus, string> = {
  'com-achado': 'ok',
  'sem-achado': 'clean',
  falhou: 'fail',
  'nao-consultada': 'none',
};

export const CoverageCard: React.FC<CoverageCardProps> = ({ items, onOpenDetail }) => {
  const resumo = summarizeCoverage(items);
  const respondidas = resumo['com-achado'] + resumo['sem-achado'];

  // Fonte que falhou vem primeiro: é a informação que muda a decisão.
  const ordenadas = [...items].sort((left, right) => {
    const peso = (status: SourceStatus) => (status === 'falhou' ? 0 : status === 'com-achado' ? 1 : status === 'sem-achado' ? 2 : 3);
    return peso(left.status) - peso(right.status);
  });

  return (
    <section className="dossier-card">
      <header className="dossier-card-head">
        <h3>Fontes consultadas</h3>
        <span>{respondidas} de {resumo.total}</span>
      </header>

      <div className="dossier-card-body">
        <div className="dossier-chips">
          {ordenadas.map((item) => (
            <span
              key={item.id}
              className={`dossier-chip ${CHIP_CLASS[item.status]}`}
              title={`${item.label}: ${SOURCE_STATUS_LABEL[item.status]}${item.detail ? ` — ${item.detail}` : ''}`}
            >
              <i aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="dossier-card-foot">
        <button type="button" onClick={onOpenDetail}>Ver fontes e auditoria</button>
      </div>
    </section>
  );
};
