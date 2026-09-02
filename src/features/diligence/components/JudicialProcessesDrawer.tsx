import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import type { ProcessDiscovery, TcePeSummary } from '../types';
import { JudicialDiscoverySection } from './JudicialDiscoverySection';
import { TcePeProcessesSection } from './TcePeProcessesSection';

interface JudicialProcessesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  discoveries: ProcessDiscovery[];
  onUpdateDiscoveries: (items: ProcessDiscovery[]) => void;
  onOpenDiscovery: (item: ProcessDiscovery) => void;
  onEnrich: (item: ProcessDiscovery) => void;
  enrichingId: string | null;
  tcePe?: TcePeSummary;
}

export const JudicialProcessesDrawer: React.FC<JudicialProcessesDrawerProps> = ({
  isOpen,
  onClose,
  discoveries,
  onUpdateDiscoveries,
  onOpenDiscovery,
  onEnrich,
  enrichingId,
  tcePe,
}) => (
  <Drawer
    isOpen={isOpen}
    onClose={onClose}
    title="Processos e publicações jurídicas"
    subtitle="Controle externo oficial e números judiciais são mostrados com a proveniência e o grau de vínculo."
    panelClassName="investigation-wide-drawer"
  >
    <div className="pncp-stack">
      <TcePeProcessesSection summary={tcePe} />
      <JudicialDiscoverySection
        discoveries={discoveries}
        onUpdateDiscoveries={onUpdateDiscoveries}
        onOpenDrawer={onOpenDiscovery}
        onEnrich={onEnrich}
        enrichingId={enrichingId}
      />
    </div>
  </Drawer>
);
