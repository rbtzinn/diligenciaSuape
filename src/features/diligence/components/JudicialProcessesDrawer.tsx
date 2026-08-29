import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import type { ProcessDiscovery } from '../types';
import { JudicialDiscoverySection } from './JudicialDiscoverySection';

interface JudicialProcessesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  discoveries: ProcessDiscovery[];
  onUpdateDiscoveries: (items: ProcessDiscovery[]) => void;
  onOpenDiscovery: (item: ProcessDiscovery) => void;
  onEnrich: (item: ProcessDiscovery) => void;
  enrichingId: string | null;
}

export const JudicialProcessesDrawer: React.FC<JudicialProcessesDrawerProps> = ({
  isOpen,
  onClose,
  discoveries,
  onUpdateDiscoveries,
  onOpenDiscovery,
  onEnrich,
  enrichingId,
}) => (
  <Drawer
    isOpen={isOpen}
    onClose={onClose}
    title="Processos e publicações jurídicas"
    subtitle="Números descobertos são candidatos até a validação no DataJud ou na fonte original."
    panelClassName="investigation-wide-drawer"
  >
    <JudicialDiscoverySection
      discoveries={discoveries}
      onUpdateDiscoveries={onUpdateDiscoveries}
      onOpenDrawer={onOpenDiscovery}
      onEnrich={onEnrich}
      enrichingId={enrichingId}
    />
  </Drawer>
);
