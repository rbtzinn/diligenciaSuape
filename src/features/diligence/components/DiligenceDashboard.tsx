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
import { DossierView } from './dossier/DossierView';
import { RiskOverrideModal } from './RiskOverrideModal';
import { EvidenceCenterDrawer } from './EvidenceCenterDrawer';
import { NewsWorkspace } from './NewsWorkspace';
import { mergeNews } from '../utils/newsResults';
import { request } from '../../../lib/api';
import { calculateRisk } from '../utils/risk';
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
    'shareholders' | 'media' | 'sanctions' | 'processes' | 'questionnaire' | 'audit' | 'evidence' | 'ai' | 'pncp' | null
  >(null);
  const [discoveries, setDiscoveries] = useState<ProcessDiscovery[]>(diligence.processosDescobertos || []);
  const [adverseMedia, setAdverseMedia] = useState<AdverseMediaSummary | undefined>(diligence.adverseMedia);
  const [selectedDiscovery, setSelectedDiscovery] = useState<ProcessDiscovery | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState(diligence.status);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false);
  const [mediaRefreshNotice, setMediaRefreshNotice] = useState<string | null>(null);
  // Publicações abrem primeiro, com dossiê e mapa acessíveis pela navegação.
  const [activeTab, setActiveTab] = useState<'noticias' | 'dossie' | 'mapa'>('noticias');
  const [newsProgress, setNewsProgress] = useState<Record<string, number | null>>({});
  const [savingNews, setSavingNews] = useState(false);
  const [savedNewsDiligence, setSavedNewsDiligence] = useState<DiligenceItem | null>(null);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [riskSaving, setRiskSaving] = useState(false);
  const [localRisk, setLocalRisk] = useState<{ diligenceId: string; risk: RiskAssessment } | null>(null);
  const [localEvidence, setLocalEvidence] = useState<{
    diligenceId: string;
    evidenceCenter: NonNullable<DiligenceItem['evidenceCenter']>;
    egos: NonNullable<DiligenceItem['egos']>;
  } | null>(null);
  const effectiveRisk = localRisk?.diligenceId === diligence.id ? localRisk.risk : savedNewsDiligence?.risco || diligence.risco;
  const effectiveEvidenceCenter = localEvidence?.diligenceId === diligence.id ? localEvidence.evidenceCenter : diligence.evidenceCenter;
  const effectiveEgos = localEvidence?.diligenceId === diligence.id ? localEvidence.egos : savedNewsDiligence?.egos || diligence.egos;
  const displayDiligence = useMemo(
    () => ({ ...diligence, ...savedNewsDiligence, status: workflowStatus, risco: effectiveRisk, adverseMedia, evidenceCenter: effectiveEvidenceCenter, egos: effectiveEgos }),
    [adverseMedia, diligence, savedNewsDiligence, workflowStatus, effectiveEgos, effectiveEvidenceCenter, effectiveRisk],
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
        municipio: diligence.empresa.municipio,
        uf: diligence.empresa.uf,
        shareholders: Array.isArray(diligence.socios) ? diligence.socios : [],
        forceRefresh: true,
      });
      if (!refreshed.ok) {
        setMediaRefreshNotice(refreshed.aviso || 'As fontes não responderam; os resultados anteriores foram preservados.');
        return;
      }
      setAdverseMedia((previous) => mergeNews(previous, refreshed));
      setMediaRefreshNotice(
        refreshed.consultaParcial
          ? 'Atualização parcial concluída. As fontes que responderam já aparecem nesta tela e nos próximos PDFs.'
          : 'Notícias atualizadas nesta tela e nos próximos PDFs.'
      );
    } finally {
      setIsRefreshingMedia(false);
    }
  };

  const handleNewsSearch = async (subject: string, restart = false) => {
    if (isRefreshingMedia || savingNews) return;
    setIsRefreshingMedia(true);
    setMediaRefreshNotice(null);
    try {
      const refreshed = await DiligenceService.searchAdverseMedia({
        cnpj: diligence.cnpj, razaoSocial: diligence.razaoSocial,
        nomeFantasia: diligence.nomeFantasia,
        municipio: diligence.empresa.municipio, uf: diligence.empresa.uf,
        shareholders: diligence.socios || [], newsOnly: true, subjectName: subject,
        queryOffset: restart ? 0 : newsProgress[subject] || 0, forceRefresh: true,
      });
      if (!refreshed.ok) {
        setMediaRefreshNotice(refreshed.aviso || 'As fontes não responderam. Seus links anteriores foram preservados; tente esta etapa novamente.');
        return;
      }
      const oldUrls = new Set((adverseMedia?.results || []).map((r) => r.canonicalUrl || r.url));
      const added = refreshed.results.filter((r) => !oldUrls.has(r.canonicalUrl || r.url)).length;
      setAdverseMedia((previous) => mergeNews(previous, refreshed));
      setNewsProgress((previous) => ({ ...previous, [subject]: refreshed.batch?.nextOffset ?? null }));
      setMediaRefreshNotice(`${added} novos links encontrados. ${refreshed.consultaParcial ? 'Algumas fontes ou etapas estão pendentes. ' : ''}Salve no dossiê para atualizar o histórico e o indicador de atenção.`);
    } catch (error) {
      setMediaRefreshNotice(error instanceof Error ? error.message : 'Não foi possível ampliar a busca.');
    } finally { setIsRefreshingMedia(false); }
  };

  const handleSaveNews = async () => {
    if (savingNews || isRefreshingMedia) return;
    setSavingNews(true);
    try {
      const automaticRisk = calculateRisk({ ...displayDiligence, discoveries });
      const response = await request<{ ok: boolean; data: DiligenceItem }>(`/api/diligences/${diligence.id}/media`, {
        method: 'PATCH', body: JSON.stringify({ adverseMedia, automaticRisk }),
      });
      const saved = response.data;
      setSavedNewsDiligence(saved);
      setLocalRisk(null);
      setMediaRefreshNotice('Publicações e revisões salvas no histórico; indicador automático atualizado.');
    } catch (error) {
      setMediaRefreshNotice(error instanceof Error ? error.message : 'Não foi possível salvar as publicações.');
    } finally { setSavingNews(false); }
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
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <nav aria-label="Visões da diligência" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-4 py-2">
        {([['noticias', 'Notícias e links'], ['dossie', 'Dossiê'], ['mapa', 'Mapa de vínculos']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)}
            className={`shrink-0 rounded-md px-4 py-2 text-sm font-semibold ${activeTab === id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-canvas'}`}>{label}</button>
        ))}
      </nav>
      {activeTab === 'noticias' && <NewsWorkspace diligence={displayDiligence} busy={isRefreshingMedia} saving={savingNews}
        progress={newsProgress} notice={mediaRefreshNotice} onSearch={handleNewsSearch} onSave={handleSaveNews}
        onReview={handleMediaStatusChange} onAudit={() => setActiveDrawer('media')} />}

      {activeTab === 'dossie' ? (
        <DossierView
          diligence={displayDiligence}
          isExportingPdf={isExportingPdf}
          onBack={onBack}
          onExportPdf={handleExportPdf}
          onOpenNetwork={() => setActiveTab('mapa')}
          onOpenAudit={() => setActiveDrawer('audit')}
        />
      ) : null}

      {/* Ao sair do mapa, desmontamos o Cytoscape. Quando o analista
          volta, o ramo inicial é recalculado e enquadrado no espaço
          disponível, sem herdar zoom e pan do nó anterior. */}
      {activeTab === 'mapa' ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            onOpenEvidence={() => setActiveDrawer('evidence')}
            onOpenAiAnalysis={() => setActiveDrawer('ai')}
            onOpenPncp={() => setActiveDrawer('pncp')}
            onDrillCompany={onDrillCompany}
            onBackToDossier={() => setActiveTab('dossie')}
          />
        </div>
      ) : null}

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
        tcePeOpenData={diligence.tcePeOpenData}
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
      <EvidenceCenterDrawer
        isOpen={activeDrawer === 'evidence'}
        onClose={() => setActiveDrawer(null)}
        diligence={displayDiligence}
        onChange={(evidenceCenter, egos) => setLocalEvidence({ diligenceId: diligence.id, evidenceCenter, egos })}
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
