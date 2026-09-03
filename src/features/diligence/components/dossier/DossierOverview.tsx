// ==========================================================
// DILIGÊNCIA 360 — Visão de achados do dossiê
// Compõe cabeçalho, cobertura e achados. Sem lógica própria:
// as duas derivações moram em módulos puros e testáveis.
// ==========================================================

import React, { useMemo } from 'react';
import type { DiligenceItem } from '../../types';
import { DossierHeader } from './DossierHeader';
import { SourceCoverageStrip } from './SourceCoverageStrip';
import { FindingsList } from './FindingsList';
import { deriveDossierFindings } from './dossierFindings';
import type { DossierFinding } from './dossierFindings';
import { deriveSourceCoverage } from './sourceCoverage';

interface DossierOverviewProps {
  diligence: DiligenceItem;
  onOpenDrawer: (drawer: NonNullable<DossierFinding['drawer']>) => void;
}

export const DossierOverview: React.FC<DossierOverviewProps> = ({ diligence, onOpenDrawer }) => {
  const findings = useMemo(() => deriveDossierFindings(diligence), [diligence]);
  const coverage = useMemo(() => deriveSourceCoverage(diligence), [diligence]);

  return (
    <div className="dossier-overview">
      <DossierHeader diligence={diligence} />
      <SourceCoverageStrip items={coverage} />
      <FindingsList findings={findings} onOpenDrawer={onOpenDrawer} />
    </div>
  );
};
