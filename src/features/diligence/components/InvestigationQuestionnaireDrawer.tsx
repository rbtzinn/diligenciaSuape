import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../types';
import { ComplexQuestionnairePanel } from './ComplexQuestionnairePanel';

interface InvestigationQuestionnaireDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAudit: () => void;
  diligence: DiligenceItem;
  adverseMedia?: AdverseMediaSummary;
  discoveries: ProcessDiscovery[];
}

export const InvestigationQuestionnaireDrawer: React.FC<InvestigationQuestionnaireDrawerProps> = ({
  isOpen,
  onClose,
  onOpenAudit,
  diligence,
  adverseMedia,
  discoveries,
}) => (
  <Drawer
    isOpen={isOpen}
    onClose={onClose}
    title="Checagens orientadas pela política"
    subtitle="Perguntas automáticas ajudam a localizar lacunas; a conclusão continua sendo humana."
    panelClassName="investigation-wide-drawer"
  >
    <div className="investigation-drawer-reset">
      <ComplexQuestionnairePanel
        diligence={diligence}
        adverseMedia={adverseMedia}
        discoveries={discoveries}
        onOpenEvidence={onOpenAudit}
      />
    </div>
  </Drawer>
);
