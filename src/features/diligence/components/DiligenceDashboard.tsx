import React, { useMemo, useState } from 'react';
import type { AdverseMediaStatus, AdverseMediaSummary, DiligenceItem, ProcessDiscovery, RiskAssessment } from '../types';
import { DiligenceService } from '../services/diligence.service';
import { DiscoveryEngine } from '../utils/discoveryEngine';
import { DiligenceHeader } from './DiligenceHeader';
import { DecisionOverview } from './DecisionOverview';
import { EvidenceWorkspace } from './EvidenceWorkspace';
import { ImmersiveNetworkTab } from './ImmersiveNetworkTab';
import { ShareholdersDrawer } from './ShareholdersDrawer';
import { AdverseMediaDrawer } from './AdverseMediaDrawer';
import { JudicialDiscoveryDrawer } from './JudicialDiscoveryDrawer';
import { RiskOverrideModal } from './RiskOverrideModal';
import { Icons } from '../../../components/ui/Icons';
import { Button } from '../../../components/ui/Button';
import { ReportService } from '../../report/services/report.service';

export type DashboardTab = 'overview' | 'network' | 'evidence';

interface DiligenceDashboardProps {
  diligence: DiligenceItem;
  onBack: () => void;
  activeTab?: DashboardTab;
  onTabChange?: (tab: DashboardTab) => void;
}

export const DiligenceDashboard: React.FC<DiligenceDashboardProps> = ({
  diligence,
  onBack,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<DashboardTab>('overview');
  const activeTab = controlledTab || internalTab;
  const [activeDrawer, setActiveDrawer] = useState<'shareholders' | 'media' | null>(null);
  const [discoveries, setDiscoveries] = useState<ProcessDiscovery[]>(diligence.processosDescobertos || []);
  const [adverseMedia, setAdverseMedia] = useState<AdverseMediaSummary | undefined>(diligence.adverseMedia);
  const [selectedDiscovery, setSelectedDiscovery] = useState<ProcessDiscovery | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState(diligence.status);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [riskSaving, setRiskSaving] = useState(false);
  const [localRisk, setLocalRisk] = useState<{ diligenceId: string; risk: RiskAssessment } | null>(null);
  const effectiveRisk = localRisk?.diligenceId === diligence.id ? localRisk.risk : diligence.risco;
  const displayDiligence = useMemo(
    () => ({ ...diligence, risco: effectiveRisk }),
    [diligence, effectiveRisk],
  );

  const setActiveTab = (tab: DashboardTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

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

        setDiscoveries((current) => DiscoveryEngine.updateStatus(current, discovery.processNumber, 'enriched', dataJudItem));
        setSelectedDiscovery((current) => current?.processNumber === discovery.processNumber
          ? { ...current, status: 'enriched', dataJud: dataJudItem }
          : current);
      }
    } finally {
      setEnrichingId(null);
    }
  };

  const handleMediaStatusChange = (id: string, newStatus: AdverseMediaStatus) => {
    setAdverseMedia((current) => current ? {
      ...current,
      results: current.results.map((item) => item.id === id ? { ...item, status: newStatus } : item),
    } : current);
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await ReportService.downloadReport(diligence.id, diligence.status !== 'completed');
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleRiskOverride = async (payload: { score: number; level: string; justification: string }) => {
    setRiskSaving(true);
    try {
      const risk = await DiligenceService.overrideRisk(diligence.id, payload);
      setLocalRisk({ diligenceId: diligence.id, risk });
      setRiskModalOpen(false);
    } finally {
      setRiskSaving(false);
    }
  };

  const safeFindings = Array.isArray(diligence.egos?.findings) ? diligence.egos.findings : [];
  const safeRelationships = Array.isArray(diligence.egos?.relationships) ? diligence.egos.relationships : [];
  const safeEvidences = Array.isArray(diligence.egos?.evidences) ? diligence.egos.evidences : [];
  const safeShareholders = Array.isArray(diligence.socios) ? diligence.socios : [];
  const safePepResults = Array.isArray(diligence.pepResults) ? diligence.pepResults : [];
  const findingReviewCount = safeFindings.filter((finding) =>
    finding.status === 'REVIEW' || finding.status === 'INCONCLUSIVE'
  ).length;
  const riskReviewCount = (effectiveRisk?.detalhes || []).filter((detail) => detail.requerRevisao).length;
  const reviewCount = Math.max(findingReviewCount, riskReviewCount);
  const networkCount = safeRelationships.length;
  const evidenceCount = safeEvidences.length;

  return (
    <main className={`dossier-v3 ${activeTab === 'network' ? 'dossier-v3-network' : ''}`}>
      {activeTab !== 'network' ? <DiligenceHeader diligence={displayDiligence} onBack={onBack} /> : null}

      <nav className="dossier-mode-nav" aria-label="Modos do dossiê">
        <div className="dossier-mode-group" role="tablist" aria-label="Visualização do dossiê">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={activeTab === 'overview' ? 'active' : ''}
            onClick={() => setActiveTab('overview')}
          >
            <Icons.Compass size={17} aria-hidden="true" />
            <span><strong>Resumo Executivo</strong><small>Decisão e próximo passo</small></span>
            {reviewCount > 0 ? <i>{reviewCount}</i> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'network'}
            className={activeTab === 'network' ? 'active' : ''}
            onClick={() => setActiveTab('network')}
          >
            <Icons.Network size={17} aria-hidden="true" />
            <span><strong>Rede de Vínculos</strong><small>Exploração imersiva</small></span>
            {networkCount > 0 ? <i>{networkCount}</i> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'evidence'}
            className={activeTab === 'evidence' ? 'active' : ''}
            onClick={() => setActiveTab('evidence')}
          >
            <Icons.Database size={17} aria-hidden="true" />
            <span><strong>Evidências</strong><small>Fontes e auditoria</small></span>
            {evidenceCount > 0 ? <i>{evidenceCount}</i> : null}
          </button>
        </div>

        <div className="dossier-mode-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={isExportingPdf ? <Icons.Loader size={14} aria-hidden="true" /> : <Icons.Download size={14} aria-hidden="true" />}
            onClick={handleExportPdf}
            disabled={isExportingPdf}
          >
            {isExportingPdf
              ? 'Gerando PDF…'
              : diligence.status === 'completed'
                ? 'Baixar Dossiê PDF'
                : 'Baixar Prévia PDF'}
          </Button>
          {activeTab === 'network' ? (
            <Button variant="ghost" size="sm" onClick={onBack} icon={<Icons.ArrowLeft size={14} aria-hidden="true" />}>
              Nova Consulta
            </Button>
          ) : null}
        </div>
      </nav>

      <div className="dossier-mode-stage" role="tabpanel">
        {activeTab === 'overview' ? (
          <DecisionOverview
            diligence={displayDiligence}
            adverseMedia={adverseMedia}
            discoveries={discoveries}
            workflowStatus={workflowStatus}
            onWorkflowStatusChange={setWorkflowStatus}
            onOpenNetwork={() => setActiveTab('network')}
            onOpenEvidence={() => setActiveTab('evidence')}
            onEditRisk={() => setRiskModalOpen(true)}
          />
        ) : null}

        {activeTab === 'network' ? (
          <ImmersiveNetworkTab
            egos={diligence.egos}
            targetCompanyName={diligence.razaoSocial}
          />
        ) : null}

        {activeTab === 'evidence' ? (
          <EvidenceWorkspace
            diligence={displayDiligence}
            discoveries={discoveries}
            adverseMedia={adverseMedia}
            onOpenShareholders={() => setActiveDrawer('shareholders')}
            onOpenMedia={() => setActiveDrawer('media')}
            onUpdateDiscoveries={setDiscoveries}
            onOpenDiscovery={setSelectedDiscovery}
            onEnrichDiscovery={handleEnrichDiscovery}
            enrichingId={enrichingId}
            onMediaStatusChange={handleMediaStatusChange}
          />
        ) : null}
      </div>

      <ShareholdersDrawer
        isOpen={activeDrawer === 'shareholders'}
        onClose={() => setActiveDrawer(null)}
        socios={safeShareholders}
        pepResults={safePepResults}
        sourceName={diligence.companySource}
        consultedAt={diligence.companyConsultedAt || diligence.dataAnalise}
        legalNature={diligence.empresa.natureza_juridica}
        governanceHistory={diligence.governanceHistory}
      />
      <AdverseMediaDrawer
        isOpen={activeDrawer === 'media'}
        onClose={() => setActiveDrawer(null)}
        adverseMedia={adverseMedia}
        onStatusChange={handleMediaStatusChange}
      />
      <JudicialDiscoveryDrawer
        isOpen={!!selectedDiscovery}
        onClose={() => setSelectedDiscovery(null)}
        discovery={selectedDiscovery}
        onStatusChange={(number, status) => setDiscoveries((current) => DiscoveryEngine.updateStatus(current, number, status))}
        onEnrich={handleEnrichDiscovery}
        isEnriching={enrichingId === selectedDiscovery?.processNumber}
      />
      <RiskOverrideModal
        isOpen={riskModalOpen}
        risk={effectiveRisk}
        isSaving={riskSaving}
        onClose={() => setRiskModalOpen(false)}
        onSubmit={handleRiskOverride}
      />
    </main>
  );
};
