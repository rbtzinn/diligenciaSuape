import React, { useMemo, useState } from 'react';
import type { AdverseMediaStatus, AdverseMediaSummary, DiligenceItem, ProcessDiscovery, RiskAssessment } from '../types';
import { DiligenceService } from '../services/diligence.service';
import { DiscoveryEngine } from '../utils/discoveryEngine';
import { ImmersiveNetworkTab } from './ImmersiveNetworkTab';
import { ShareholdersDrawer } from './ShareholdersDrawer';
import { AdverseMediaDrawer } from './AdverseMediaDrawer';
import { JudicialDiscoveryDrawer } from './JudicialDiscoveryDrawer';
import { JudicialProcessesDrawer } from './JudicialProcessesDrawer';
import { InvestigationSanctionsDrawer } from './InvestigationSanctionsDrawer';
import { InvestigationQuestionnaireDrawer } from './InvestigationQuestionnaireDrawer';
import { InvestigationAuditDrawer } from './InvestigationAuditDrawer';
import { AiAnalysisDrawer } from './AiAnalysisDrawer';
import { PncpContractsDrawer } from './PncpContractsDrawer';
import { DossierOverview } from './dossier/DossierOverview';
import { RiskOverrideModal } from './RiskOverrideModal';
import { ReportService } from '../../report/services/report.service';

interface DiligenceDashboardProps {
  diligence: DiligenceItem;
  onBack: () => void;
  onDrillCompany?: (cnpj: string, name: string) => void;
}

export const DiligenceDashboard: React.FC<DiligenceDashboardProps> = ({
  diligence,
  onBack,
  onDrillCompany,
}) => {
  const [activeDrawer, setActiveDrawer] = useState<
    'shareholders' | 'media' | 'sanctions' | 'processes' | 'questionnaire' | 'audit' | 'ai' | 'pncp' | null
  >(null);
  const [discoveries, setDiscoveries] = useState<ProcessDiscovery[]>(diligence.processosDescobertos || []);
  const [adverseMedia, setAdverseMedia] = useState<AdverseMediaSummary | undefined>(diligence.adverseMedia);
  const [selectedDiscovery, setSelectedDiscovery] = useState<ProcessDiscovery | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState(diligence.status);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [mediaRefreshNotice, setMediaRefreshNotice] = useState<string | null>(null);
  // Achados abrem primeiro: o conteúdo do dossiê deixa de depender de
  // descobrir um painel lateral. O grafo continua disponível na outra aba.
  const [activeTab, setActiveTab] = useState<'achados' | 'rede'>('achados');
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [riskSaving, setRiskSaving] = useState(false);
  const [localRisk, setLocalRisk] = useState<{ diligenceId: string; risk: RiskAssessment } | null>(null);
  const effectiveRisk = localRisk?.diligenceId === diligence.id ? localRisk.risk : diligence.risco;
  const displayDiligence = useMemo(
    () => ({ ...diligence, risco: effectiveRisk, adverseMedia }),
    [adverseMedia, diligence, effectiveRisk],
  );

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

  const handleRefreshMedia = async () => {
    if (isRefreshingMedia) return;
    setIsRefreshingMedia(true);
    setMediaRefreshNotice(null);
    try {
      const refreshed = await DiligenceService.searchAdverseMedia({
        cnpj: diligence.cnpj,
        razaoSocial: diligence.razaoSocial,
        nomeFantasia: diligence.nomeFantasia,
        shareholders: Array.isArray(diligence.socios) ? diligence.socios : [],
        forceRefresh: true,
      });
      if (!refreshed.ok) {
        setMediaRefreshNotice(refreshed.aviso || 'As fontes não responderam; os resultados anteriores foram preservados.');
        return;
      }
      const reviewedStatuses = new Map(
        (adverseMedia?.results || []).map((item) => [item.canonicalUrl || item.url || item.id, item.status])
      );
      const results = refreshed.results.map((item) => ({
        ...item,
        status: reviewedStatuses.get(item.canonicalUrl || item.url || item.id) || item.status,
      }));
      setAdverseMedia({ ...refreshed, results });
      setMediaRefreshNotice(
        refreshed.consultaParcial
          ? 'Atualização parcial concluída. As fontes que responderam já aparecem nesta tela e nos próximos PDFs.'
          : 'Notícias atualizadas nesta tela e nos próximos PDFs.'
      );
    } finally {
      setIsRefreshingMedia(false);
    }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await ReportService.downloadReport(
        diligence.id,
        diligence.status !== 'completed',
        displayDiligence
      );
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      alert(error instanceof Error ? error.message : 'Falha ao baixar o dossiê em PDF.');
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

  const safeShareholders = Array.isArray(diligence.socios) ? diligence.socios : [];
  const safePepResults = Array.isArray(diligence.pepResults) ? diligence.pepResults : [];

  return (
    <main className="investigation-dossier has-dossier-tabs">
      <button type="button" className="investigation-back-sr" onClick={onBack}>
        Nova consulta
      </button>

      <nav className="dossier-tabs" aria-label="Seções do dossiê">
        <button
          type="button"
          className={'dossier-tab ' + (activeTab === 'achados' ? 'is-active' : '')}
          onClick={() => setActiveTab('achados')}
        >
          Achados
        </button>
        <button
          type="button"
          className={'dossier-tab ' + (activeTab === 'rede' ? 'is-active' : '')}
          onClick={() => setActiveTab('rede')}
        >
          Rede e evidências
        </button>
      </nav>

      {activeTab === 'achados' ? (
        <DossierOverview diligence={displayDiligence} onOpenDrawer={setActiveDrawer} />
      ) : null}

      <div className="dossier-network-panel" hidden={activeTab !== 'rede'}>
      <ImmersiveNetworkTab
        diligence={displayDiligence}
        adverseMedia={adverseMedia}
        discoveries={discoveries}
        workflowStatus={workflowStatus}
        isExportingPdf={isExportingPdf}
        onWorkflowStatusChange={setWorkflowStatus}
        onExportPdf={handleExportPdf}
        onEditRisk={() => setRiskModalOpen(true)}
        onOpenPeople={() => setActiveDrawer('shareholders')}
        onOpenSanctions={() => setActiveDrawer('sanctions')}
        onOpenMedia={() => setActiveDrawer('media')}
        onOpenProcesses={() => setActiveDrawer('processes')}
        onOpenQuestionnaire={() => setActiveDrawer('questionnaire')}
        onOpenAudit={() => setActiveDrawer('audit')}
        onOpenAiAnalysis={() => setActiveDrawer('ai')}
        onOpenPncp={() => setActiveDrawer('pncp')}
        onDrillCompany={onDrillCompany}
      />
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
        onDrillCompany={onDrillCompany}
      />
      <AdverseMediaDrawer
        isOpen={activeDrawer === 'media'}
        onClose={() => setActiveDrawer(null)}
        adverseMedia={adverseMedia}
        onStatusChange={handleMediaStatusChange}
        onRefresh={handleRefreshMedia}
        isRefreshing={isRefreshingMedia}
        refreshNotice={mediaRefreshNotice}
      />
      <InvestigationSanctionsDrawer
        isOpen={activeDrawer === 'sanctions'}
        onClose={() => setActiveDrawer(null)}
        ceis={diligence.ceis}
        cnep={diligence.cnep}
        personSanctions={diligence.personSanctions}
      />
      <JudicialProcessesDrawer
        isOpen={activeDrawer === 'processes'}
        onClose={() => setActiveDrawer(null)}
        discoveries={discoveries}
        onUpdateDiscoveries={setDiscoveries}
        onOpenDiscovery={(item) => {
          setActiveDrawer(null);
          setSelectedDiscovery(item);
        }}
        onEnrich={handleEnrichDiscovery}
        enrichingId={enrichingId}
        tcePe={diligence.tcePe}
      />
      <InvestigationQuestionnaireDrawer
        isOpen={activeDrawer === 'questionnaire'}
        onClose={() => setActiveDrawer(null)}
        onOpenAudit={() => setActiveDrawer('audit')}
        diligence={displayDiligence}
        adverseMedia={adverseMedia}
        discoveries={discoveries}
      />
      <InvestigationAuditDrawer
        isOpen={activeDrawer === 'audit'}
        onClose={() => setActiveDrawer(null)}
        diligence={displayDiligence}
        adverseMedia={adverseMedia}
        discoveries={discoveries}
      />
      <PncpContractsDrawer
        isOpen={activeDrawer === 'pncp'}
        onClose={() => setActiveDrawer(null)}
        pncp={diligence.pncp}
        federalExposure={diligence.federalExposure}
      />
      <AiAnalysisDrawer
        isOpen={activeDrawer === 'ai'}
        onClose={() => setActiveDrawer(null)}
        diligence={displayDiligence}
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
