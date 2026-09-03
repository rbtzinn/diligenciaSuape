// ==========================================================
// DILIGÊNCIA 360 — Cabeçalho de decisão do dossiê
// Responde, sem clique: quem é, qual o nível e o que fazer.
// ==========================================================

import React from 'react';
import type { DiligenceItem } from '../../types';

interface DossierHeaderProps {
  diligence: DiligenceItem;
}

function formatDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleString('pt-BR');
}

export const DossierHeader: React.FC<DossierHeaderProps> = ({ diligence }) => {
  const risco = diligence.risco;
  const consultedAt = formatDate(diligence.companyConsultedAt || diligence.dataAnalise);

  return (
    <header className={`dossier-header tone-${risco?.cor || 'neutral'}`}>
      <div className="dossier-header-identity">
        <h2>{diligence.razaoSocial}</h2>
        <p translate="no">
          CNPJ {diligence.cnpjFmt}
          {diligence.empresa?.descricao_situacao_cadastral
            ? ` · ${diligence.empresa.descricao_situacao_cadastral}`
            : ''}
          {diligence.empresa?.municipio ? ` · ${diligence.empresa.municipio}` : ''}
          {diligence.empresa?.uf ? `/${diligence.empresa.uf}` : ''}
        </p>
      </div>

      <div className="dossier-header-risk">
        <span className="dossier-header-level">{risco?.nivel || 'Nível não calculado'}</span>
        <strong className="dossier-header-decision">{risco?.decisao || '—'}</strong>
        {/* Exposição mede necessidade de análise, nunca culpabilidade. */}
        <p className="dossier-header-note">{risco?.decisaoDesc}</p>
        {consultedAt ? <span className="dossier-header-date">Consultado em {consultedAt}</span> : null}
      </div>
    </header>
  );
};
