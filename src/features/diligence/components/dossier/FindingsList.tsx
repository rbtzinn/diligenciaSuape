// ==========================================================
// DILIGÊNCIA 360 — Lista única de achados, do mais grave ao menos
// ==========================================================

import React from 'react';
import { Icons } from '../../../../components/ui/Icons';
import type { DossierFinding } from './dossierFindings';
import { SEVERITY_LABEL } from './dossierFindings';

interface FindingsListProps {
  findings: DossierFinding[];
  onOpenDrawer: (drawer: NonNullable<DossierFinding['drawer']>) => void;
}

const FindingCard: React.FC<{
  finding: DossierFinding;
  onOpenDrawer: FindingsListProps['onOpenDrawer'];
}> = ({ finding, onOpenDrawer }) => (
  <article className={`dossier-finding severity-${finding.severity}`}>
    <header className="dossier-finding-head">
      <span className="dossier-finding-severity">{SEVERITY_LABEL[finding.severity]}</span>
      <span className="dossier-finding-source">{finding.source}</span>
    </header>

    <h4 className="dossier-finding-title">{finding.title}</h4>
    {finding.highlight ? <p className="dossier-finding-highlight">{finding.highlight}</p> : null}
    <p className="dossier-finding-description">{finding.description}</p>

    {finding.drawer || finding.url ? (
      <footer className="dossier-finding-actions">
        {finding.drawer ? (
          <button type="button" onClick={() => onOpenDrawer(finding.drawer!)}>
            Ver detalhes
            <Icons.ArrowRight size={13} aria-hidden="true" />
          </button>
        ) : null}
        {finding.url ? (
          <a href={finding.url} target="_blank" rel="noopener noreferrer">
            Abrir fonte
            <Icons.ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
      </footer>
    ) : null}
  </article>
);

export const FindingsList: React.FC<FindingsListProps> = ({ findings, onOpenDrawer }) => {
  if (findings.length === 0) {
    return (
      <div className="dossier-findings-empty">
        <Icons.Info size={20} aria-hidden="true" />
        <p>
          Nenhuma fonte respondeu com conteúdo suficiente para gerar achados. Consulte a cobertura acima para
          identificar quais fontes falharam antes de concluir qualquer coisa sobre a empresa.
        </p>
      </div>
    );
  }

  return (
    <section className="dossier-findings" aria-label="Achados consolidados">
      <header className="dossier-findings-head">
        <h3>Achados</h3>
        <span>{findings.length} item(ns), do mais grave ao menos grave</span>
      </header>
      <div className="dossier-findings-stack">
        {findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} onOpenDrawer={onOpenDrawer} />
        ))}
      </div>
    </section>
  );
};
