import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import type { PersonSanctionsSummary, SanctionsResult } from '../types';
import { SanctionsSection } from './SanctionsSection';
import { PersonSanctionsSection } from './PersonSanctionsSection';

interface InvestigationSanctionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  personSanctions?: PersonSanctionsSummary;
}

export const InvestigationSanctionsDrawer: React.FC<InvestigationSanctionsDrawerProps> = ({
  isOpen,
  onClose,
  ceis,
  cnep,
  personSanctions,
}) => (
  <Drawer
    isOpen={isOpen}
    onClose={onClose}
    title="Sanções oficiais"
    subtitle="CEIS e CNEP permanecem separados de notícias e hipóteses."
  >
    <div className="investigation-sanctions-stack">
      <SanctionsSection ceis={ceis} cnep={cnep} />
      <PersonSanctionsSection personSanctions={personSanctions} />
    </div>
  </Drawer>
);
