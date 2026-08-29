import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../types';
import { EgosIntelligencePanel } from './EgosIntelligencePanel';
import { EvidenceSection } from './EvidenceSection';
import { AuditTimeline } from './AuditTimeline';

interface InvestigationAuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  diligence: DiligenceItem;
  adverseMedia?: AdverseMediaSummary;
  discoveries: ProcessDiscovery[];
}

export const InvestigationAuditDrawer: React.FC<InvestigationAuditDrawerProps> = ({
  isOpen,
  onClose,
  diligence,
  adverseMedia,
  discoveries,
}) => {
  const enrichedProcesses = discoveries.filter((item) => item.dataJud).map((item) => item.dataJud!);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Fontes e trilha de auditoria"
      subtitle="Cobertura, origem e horário de coleta das informações usadas nesta diligência."
      panelClassName="investigation-wide-drawer"
    >
      <div className="investigation-audit-stack">
        <EgosIntelligencePanel egos={diligence.egos} diligenceId={diligence.id} showGraph={false} />
        <EvidenceSection
          ceis={diligence.ceis}
          cnep={diligence.cnep}
          pepResults={diligence.pepResults || []}
          processosJudiciais={enrichedProcesses}
          adverseMedia={adverseMedia}
          consultadoEm={diligence.dataAnalise}
        />
        <AuditTimeline timeline={diligence.timeline || []} />
      </div>
    </Drawer>
  );
};
