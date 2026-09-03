// ==========================================================
// DILIGÊNCIA 360 — Visão de decisão do dossiê
// ==========================================================
// Ordem de leitura: resposta, números, evidências, rede.
// Toda derivação mora em módulo puro; aqui só há composição.
// ==========================================================

import React, { useMemo } from 'react';
import type { DiligenceItem } from '../../types';
import { VerdictCard } from './VerdictCard';
import { EvidenceCard } from './EvidenceCard';
import { CoverageCard } from './CoverageCard';
import { deriveDossierFindings } from './dossierFindings';
import type { DossierFinding } from './dossierFindings';
import { deriveSourceCoverage } from './sourceCoverage';
import { deriveDossierKpis } from './dossierKpis';
import { contractRows, externalControlRows, shareholderRows } from './dossierRows';

interface DossierOverviewProps {
  diligence: DiligenceItem;
  onOpenDrawer: (drawer: NonNullable<DossierFinding['drawer']>) => void;
  onOpenNetwork: () => void;
}

export const DossierOverview: React.FC<DossierOverviewProps> = ({
  diligence,
  onOpenDrawer,
  onOpenNetwork,
}) => {
  const findings = useMemo(() => deriveDossierFindings(diligence), [diligence]);
  const coverage = useMemo(() => deriveSourceCoverage(diligence), [diligence]);
  const kpis = useMemo(() => deriveDossierKpis(diligence), [diligence]);
  const contratos = useMemo(() => contractRows(diligence), [diligence]);
  const processos = useMemo(() => externalControlRows(diligence), [diligence]);
  const socios = useMemo(() => shareholderRows(diligence), [diligence]);

  const totalContratos = diligence.pncp?.resumo?.confirmados || 0;
  const totalProcessos = diligence.tcePe?.processos?.length || 0;
  const totalSocios = diligence.socios?.length || 0;
  const entidades = diligence.egos?.metrics?.entities || 0;

  return (
    <div className="dossier-grid">
      <VerdictCard diligence={diligence} findings={findings} coverage={coverage} />

      <div className="dossier-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="dossier-card dossier-kpi">
            <span className="dossier-kpi-label">{kpi.label}</span>
            <span className="dossier-kpi-value">{kpi.value}</span>
            <span className="dossier-kpi-note">{kpi.note}</span>
          </div>
        ))}
      </div>

      <EvidenceCard
        title="Contratos públicos"
        source="PNCP"
        rows={contratos}
        emptyMessage="Nenhum contrato confirmado pelo CNPJ do fornecedor nas buscas realizadas."
        action={totalContratos > 0
          ? { label: `Ver ${totalContratos} contrato${totalContratos === 1 ? '' : 's'}`, onClick: () => onOpenDrawer('pncp') }
          : undefined}
      />

      <EvidenceCard
        title="Controle externo"
        source="TCE-PE"
        rows={processos}
        emptyMessage="Nenhum processo com a empresa entre os interessados."
        action={totalProcessos > 0
          ? { label: `Ver ${totalProcessos} processo${totalProcessos === 1 ? '' : 's'}`, onClick: () => onOpenDrawer('audit') }
          : undefined}
      />

      <EvidenceCard
        title="Quadro societário"
        source={`${totalSocios} integrante${totalSocios === 1 ? '' : 's'}`}
        rows={socios}
        emptyMessage="O quadro societário público não retornou integrantes."
        action={totalSocios > 0
          ? { label: 'Ver quadro societário', onClick: () => onOpenDrawer('shareholders') }
          : undefined}
      />

      <CoverageCard items={coverage} onOpenDetail={() => onOpenDrawer('audit')} />

      <section className="dossier-card dossier-network span-all">
        <div className="dossier-network-preview" aria-hidden="true">
          <span className="dossier-network-node root" />
          <span className="dossier-network-node n1" />
          <span className="dossier-network-node n2" />
          <span className="dossier-network-node n3" />
          <span className="dossier-network-node n4" />
        </div>
        <button type="button" className="dossier-network-foot" onClick={onOpenNetwork}>
          <strong>
            Rede de relações
            {entidades > 0 ? ` · ${entidades} entidades` : ''}
          </strong>
          <span>Abrir mapa completo →</span>
        </button>
      </section>
    </div>
  );
};
