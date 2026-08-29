import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import type { SanctionsResult } from '../types';
import { SanctionsSection } from './SanctionsSection';

interface InvestigationSanctionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
}

export const InvestigationSanctionsDrawer: React.FC<InvestigationSanctionsDrawerProps> = ({
  isOpen,
  onClose,
  ceis,
  cnep,
}) => (
  <Drawer
    isOpen={isOpen}
    onClose={onClose}
    title="Sanções oficiais"
    subtitle="CEIS e CNEP permanecem separados de notícias e hipóteses."
  >
    <div className="investigation-sanctions-stack">
      <SanctionsSection ceis={ceis} cnep={cnep} />
    </div>
  </Drawer>
);
