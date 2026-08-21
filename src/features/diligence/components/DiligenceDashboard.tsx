// ==========================================================
// DILIGÊNCIA 360 — Dashboard Executivo de Diligência (Fase 4C)
// Resumo Primeiro. Evidência Depois. Ficha Executiva de Análise
// ==========================================================

import React, { useState } from 'react';
import { DiligenceItem, ProcessDiscovery, AdverseMediaSummary, AdverseMediaStatus } from '../types';
import { DiligenceService } from '../services/diligence.service';
import { DiscoveryEngine } from '../utils/discoveryEngine';
import { DiligenceHeader } from './DiligenceHeader';
import { ExecutiveKpiBar } from './ExecutiveKpiBar';
import { ExecutiveSummaryBanner } from './ExecutiveSummaryBanner';
import { WorkflowControlBar } from '../../workflow/components/WorkflowControlBar';
import { AttentionPanel } from './AttentionPanel';
import { RiskVisualizer } from './RiskVisualizer';
import { CompanyProfile } from './CompanyProfile';
import { ShareholdersSection } from './ShareholdersSection';
import { ShareholdersDrawer } from './ShareholdersDrawer';
import { SanctionsSection } from './SanctionsSection';
import { SanctionsDrawer } from './SanctionsDrawer';
import { PepSection } from './PepSection';
import { AdverseMediaSection } from './AdverseMediaSection';
import { AdverseMediaDrawer } from './AdverseMediaDrawer';
import { JudicialDiscoverySection } from './JudicialDiscoverySection';
import { JudicialDiscoveryDrawer } from './JudicialDiscoveryDrawer';
import { EvidenceSection } from './EvidenceSection';
import { ConclusionPanel } from './ConclusionPanel';
import { AuditTimeline } from './AuditTimeline';
import { DashboardSectionHeader } from './DashboardSectionHeader';
import { EgosIntelligencePanel } from './EgosIntelligencePanel';

interface DiligenceDashboardProps {
  diligence: DiligenceItem;
  onBack: () => void;
}

export const DiligenceDashboard: React.FC<DiligenceDashboardProps> = ({
  diligence,
  onBack,
}) => {
  const [activeDrawer, setActiveDrawer] = useState<'socios' | 'ceis' | 'cnep' | 'media' | null>(null);
  const [discoveries, setDiscoveries] = useState<ProcessDiscovery[]>(diligence.processosDescobertos || []);
  const [adverseMedia, setAdverseMedia] = useState<AdverseMediaSummary | undefined>(diligence.adverseMedia);
  const [selectedDiscovery, setSelectedDiscovery] = useState<ProcessDiscovery | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState(diligence.status);

  const { empresa, socios, ceis, cnep, pepResults, risco, analise, timeline } = diligence;

  const handleEnrichDiscovery = async (discovery: ProcessDiscovery) => {
    setEnrichingId(discovery.processNumber);
    try {
      const res = await DiligenceService.getProcessoJudicial(discovery.processNumber);
      if (res.ok && res.classe) {
        const dataJudItem = {
          numero: res.numero || discovery.formattedProcessNumber,
          numeroLimpo: res.numeroLimpo || discovery.processNumber,
          tribunal: res.tribunal || discovery.tribunal,
          tribunalNome: res.tribunalNome || '',
          grau: res.grau || 'G1',
          classe: res.classe,
          categoria: res.categoria || { id: 'outros', label: 'Outras Ações', badgeVariant: 'neutral' as const },
          assuntos: res.assuntos || [],
          orgaoJulgador: res.orgaoJulgador || { codigo: 0, nome: 'Não informado' },
          dataAjuizamento: res.dataAjuizamento || '',
          nivelSigilo: res.nivelSigilo ?? 0,
          sistema: res.sistema || 'PJe',
          formato: res.formato || 'Eletrônico',
          ultimaAtualizacao: res.ultimaAtualizacao || '',
          totalMovimentos: res.totalMovimentos || 0,
          movimentos: res.movimentos || [],
          fonte: res.fonte || 'CNJ - DataJud',
          consultadoEm: res.consultadoEm || new Date().toISOString(),
        };

        setDiscoveries((prev) => DiscoveryEngine.updateStatus(prev, discovery.processNumber, 'enriched', dataJudItem));
        if (selectedDiscovery && selectedDiscovery.processNumber === discovery.processNumber) {
          setSelectedDiscovery((prev) => (prev ? { ...prev, status: 'enriched', dataJud: dataJudItem } : null));
        }
      }
    } finally {
      setEnrichingId(null);
    }
  };

  const handleMediaStatusChange = (id: string, newStatus: AdverseMediaStatus) => {
    if (!adverseMedia) return;
    setAdverseMedia((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        results: prev.results.map((r) => (r.id === id ? { ...r, status: newStatus } : r)),
      };
    });
  };

  const enrichedProcesses = discoveries.filter((d) => d.dataJud).map((d) => d.dataJud!);

  return (
    <main className="dash-shell animate-fade-in">
      <DiligenceHeader diligence={diligence} onBack={onBack} />

      <ExecutiveSummaryBanner
        empresa={empresa}
        ceis={ceis}
        cnep={cnep}
        pepResults={pepResults}
        adverseMedia={adverseMedia}
        discoveries={discoveries}
        onReviewPendencies={() => setActiveDrawer('socios')}
      />

      <EgosIntelligencePanel egos={diligence.egos} diligenceId={diligence.id} />

      <section className="dashboard-chapter" aria-labelledby="verification-title">
        <DashboardSectionHeader
          id="verification-title"
          eyebrow="Leitura rápida"
          title="O que foi verificado"
          description="Um panorama das consultas realizadas. Selecione um cartão para abrir os detalhes disponíveis."
        />
        <ExecutiveKpiBar
          empresa={empresa}
          sociosCount={socios.length}
          pepResults={pepResults}
          ceis={ceis}
          cnep={cnep}
          adverseMedia={adverseMedia}
          discoveries={discoveries}
          onOpenSocios={() => setActiveDrawer('socios')}
          onOpenCeis={() => setActiveDrawer('ceis')}
          onOpenCnep={() => setActiveDrawer('cnep')}
          onOpenPep={() => setActiveDrawer('socios')}
          onOpenMedia={() => setActiveDrawer('media')}
        />
      </section>

      <section className="dashboard-chapter" aria-labelledby="action-title">
        <DashboardSectionHeader
          id="action-title"
          eyebrow="Próximo passo"
          title="O que fazer agora"
          description="Pendências e decisões aparecem primeiro; os controles administrativos vêm logo em seguida."
        />
        <AttentionPanel
          analise={analise}
          onOpenCeis={() => setActiveDrawer('ceis')}
          onOpenCnep={() => setActiveDrawer('cnep')}
          onOpenSocios={() => setActiveDrawer('socios')}
          onOpenMedia={() => setActiveDrawer('media')}
        />
        <WorkflowControlBar
          diligence={{ ...diligence, status: workflowStatus }}
          onStatusChange={setWorkflowStatus}
        />
      </section>

      <section className="dashboard-chapter" aria-labelledby="analysis-title">
        <DashboardSectionHeader
          id="analysis-title"
          eyebrow="Como chegamos ao resultado"
          title="Entenda a análise"
          description="Veja o que influenciou a nota e quais bases públicas participaram da verificação."
        />
        <RiskVisualizer
          risco={risco}
          ceis={ceis}
          cnep={cnep}
          pepResults={pepResults}
          adverseMedia={adverseMedia}
          discoveries={discoveries}
        />
      </section>

      <section className="dashboard-chapter dashboard-chapter-details" aria-labelledby="details-title">
        <DashboardSectionHeader
          id="details-title"
          eyebrow="Consulta completa"
          title="Dados e evidências"
          description="Informações cadastrais, pessoas relacionadas e registros encontrados, organizados por assunto."
        />
        <div className="dash-grid">
          <CompanyProfile empresa={empresa} cnpjFmt={diligence.cnpjFmt} />
          <ShareholdersSection
            socios={socios}
            pepResults={pepResults}
            onOpenDrawer={() => setActiveDrawer('socios')}
          />
        </div>
        <div className="dash-grid">
          <SanctionsSection ceis={ceis} cnep={cnep} />
          <PepSection pepResults={pepResults} onOpenDrawer={() => setActiveDrawer('socios')} />
        </div>
        <AdverseMediaSection
          adverseMedia={adverseMedia}
          onOpenDrawer={() => setActiveDrawer('media')}
          onStatusChange={handleMediaStatusChange}
        />
        <JudicialDiscoverySection
          discoveries={discoveries}
          onUpdateDiscoveries={setDiscoveries}
          onOpenDrawer={(d) => setSelectedDiscovery(d)}
          onEnrich={handleEnrichDiscovery}
          enrichingId={enrichingId}
        />
        <ConclusionPanel risco={risco} />
        <EvidenceSection
          ceis={ceis}
          cnep={cnep}
          pepResults={pepResults}
          processosJudiciais={enrichedProcesses}
          adverseMedia={adverseMedia}
          consultadoEm={diligence.dataAnalise}
        />
        <AuditTimeline timeline={timeline} />
      </section>

      {/* Drawers Globais de Detalhe Progressivo */}
      <ShareholdersDrawer isOpen={activeDrawer === 'socios'} onClose={() => setActiveDrawer(null)} socios={socios} pepResults={pepResults} />
      <SanctionsDrawer isOpen={activeDrawer === 'ceis'} onClose={() => setActiveDrawer(null)} tipo="CEIS" registros={ceis?.registros || []} />
      <SanctionsDrawer isOpen={activeDrawer === 'cnep'} onClose={() => setActiveDrawer(null)} tipo="CNEP" registros={cnep?.registros || []} />
      <AdverseMediaDrawer isOpen={activeDrawer === 'media'} onClose={() => setActiveDrawer(null)} adverseMedia={adverseMedia} onStatusChange={handleMediaStatusChange} />
      <JudicialDiscoveryDrawer
        isOpen={!!selectedDiscovery}
        onClose={() => setSelectedDiscovery(null)}
        discovery={selectedDiscovery}
        onStatusChange={(num, st) => setDiscoveries((prev) => DiscoveryEngine.updateStatus(prev, num, st))}
        onEnrich={handleEnrichDiscovery}
        isEnriching={enrichingId === selectedDiscovery?.processNumber}
      />
    </main>
  );
};
