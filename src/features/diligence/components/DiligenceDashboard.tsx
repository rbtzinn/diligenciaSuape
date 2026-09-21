import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { currencyToNumber } from '../../../lib/masks';
import { NarrativeReportView } from './NarrativeReportView';
import { SuapeIntegrityEvaluationView } from './SuapeIntegrityEvaluationView';
import { ResearchOverviewView } from './ResearchOverviewView';
import {
  evaluateSuapeIntegrity,
  type IntegrityAnswers,
} from '../utils/suapeRiskMapRowGenerator';
import { mergeNews } from '../utils/newsResults';
import { request } from '../../../lib/api';
import { calculateRisk } from '../utils/risk';
import { ReportService } from '../../report/services/report.service';
import { Icons } from '../../../components/ui/Icons';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';

interface DiligenceDashboardProps {
  diligence: DiligenceItem;
  onBack: () => void;
  onDrillCompany?: (cnpj: string, name: string) => void;
}

type DashboardSection = 'overview' | 'suape' | 'mapa' | 'noticias' | 'dossie' | 'relatorio';

function isDashboardSection(section: string | undefined): section is DashboardSection {
  return section === 'overview' || section === 'suape' || section === 'mapa'
    || section === 'noticias' || section === 'dossie' || section === 'relatorio';
}

export const DiligenceDashboard: React.FC<DiligenceDashboardProps> = ({
  diligence,
  onBack,
  onDrillCompany,
}) => {
  const navigate = useNavigate();
  const { section } = useParams<{ section: string }>();
  const activeTab: DashboardSection = isDashboardSection(section) ? section : 'overview';
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
  const [mobileSectionsOpen, setMobileSectionsOpen] = useState(false);
  const [newsProgress, setNewsProgress] = useState<Record<string, number | null>>({});
  const [savingNews, setSavingNews] = useState(false);
  const [savedNewsDiligence, setSavedNewsDiligence] = useState<DiligenceItem | null>(null);
  // Respostas e regras da política pertencem apenas ao complemento SUAPE.
  // O índice da pesquisa continua vindo de diligence.risco.
  const [integrityAnswers, setIntegrityAnswers] = useState<IntegrityAnswers>({});
  const [contractValueStr, setContractValueStr] = useState('');
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
  // O campo é mascarado, então o texto tem forma única e a leitura é
  // direta. Antes cada tela tinha o seu `parseFloat` com regex de
  // milhar, e duas leituras do mesmo campo podiam divergir.
  const contractValue = useMemo(() => currencyToNumber(contractValueStr) ?? 0, [contractValueStr]);

  const displayDiligence = useMemo(
    () => ({ ...diligence, ...savedNewsDiligence, status: workflowStatus, risco: effectiveRisk, adverseMedia, evidenceCenter: effectiveEvidenceCenter, egos: effectiveEgos }),
    [adverseMedia, diligence, savedNewsDiligence, workflowStatus, effectiveEgos, effectiveEvidenceCenter, effectiveRisk],
  );

  /** Classificação da política SUAPE, independente do índice da pesquisa. */
  const officialEvaluation = useMemo(
    () => evaluateSuapeIntegrity(displayDiligence, contractValue, integrityAnswers),
    [displayDiligence, contractValue, integrityAnswers],
  );
  const sections = [
    { id: 'overview', label: 'Visão geral', detail: 'Índice e prioridades', icon: <Icons.BarChart size={17} /> },
    { id: 'dossie', label: 'Dossiê completo', detail: 'Todas as fontes', icon: <Icons.ShieldCheck size={17} /> },
    { id: 'mapa', label: 'Vínculos', detail: 'Pessoas e empresas', icon: <Icons.Network size={17} /> },
    { id: 'noticias', label: 'Reputação', detail: 'Notícias e documentos', icon: <Icons.Globe size={17} /> },
    { id: 'relatorio', label: 'Relatório', detail: 'Síntese para leitura', icon: <Icons.FileText size={17} /> },
  ] as const;
  const openSection = (id: DashboardSection) => {
    if (id !== activeTab) {
      navigate(`/diligence/${encodeURIComponent(diligence.id)}/${id}`);
    }
    setMobileSectionsOpen(false);
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

  /**
   * Grava a linha da avaliação na aba do Mapa de Risco.
   *
   * Devolve a frase que a tela mostra em vez de um booleano: "gravada na
   * linha 14" e "atualizada a linha 14" são resultados diferentes para
   * quem vai conferir a planilha, e ambos precisam ser ditos.
   */
  const handleSaveRiskMapRow = async (linha: { cabecalho: string[]; valores: string[] }) => {
    const resposta = await request<{
      ok: boolean;
      aba: string;
      linha?: number;
      criada?: boolean;
      abaCriada?: boolean;
      erro?: string;
    }>(`/api/diligences/${diligence.id}/mapa-de-risco`, {
      method: 'POST',
      body: JSON.stringify(linha),
    });

    if (!resposta.ok) {
      throw new Error(resposta.erro || 'A planilha não aceitou a linha.');
    }

    const aba = resposta.abaCriada ? `Aba ${resposta.aba} criada. ` : '';
    return resposta.criada
      ? `${aba}Linha gravada na aba ${resposta.aba}, linha ${resposta.linha}.`
      : `${aba}Linha ${resposta.linha} da aba ${resposta.aba} atualizada com esta avaliação.`;
  };

  const handleSaveNews = async () => {
    if (savingNews || isRefreshingMedia) return;
    setSavingNews(true);
    try {
      const automaticRisk = calculateRisk({ ...displayDiligence, discoveries });
      const response = await request<{
        ok: boolean;
        data: DiligenceItem;
        planilhaDeNoticias?: { ok: boolean; linhas?: number; aba?: string; erro?: string };
      }>(`/api/diligences/${diligence.id}/media`, {
        method: 'PATCH', body: JSON.stringify({ adverseMedia, automaticRisk }),
      });
      const saved = response.data;
      setSavedNewsDiligence(saved);
      setLocalRisk(null);
      // A aba legível da planilha pode falhar sozinha, com o histórico já
      // gravado. Dizer só "salvo" esconderia que a planilha ficou para trás.
      const planilha = response.planilhaDeNoticias;
      setMediaRefreshNotice(
        planilha?.ok
          ? `Publicações e revisões salvas no histórico e na aba ${planilha.aba} da planilha (${planilha.linhas} linha(s)); indicador automático atualizado.`
          : planilha
            ? `Salvo no histórico, mas a aba ${planilha.aba} da planilha não foi atualizada: ${planilha.erro || 'motivo não informado'}.`
            : 'Publicações e revisões salvas no histórico; indicador automático atualizado.'
      );
    } catch (error) {
      setMediaRefreshNotice(error instanceof Error ? error.message : 'Não foi possível salvar as publicações.');
    } finally { setSavingNews(false); }
  };

  /**
   * Aprofundamento pedido pela classificação Alto ou Muito Alto: reinicia
   * a varredura reputacional sobre a razão social e leva o analista até
   * os resultados. Nenhuma busca nova foi inventada — é a mesma rota que
   * a aba de notícias usa.
   */
  const handleDeepenResearch = async () => {
    openSection('noticias');
    await handleNewsSearch(displayDiligence.razaoSocial, true);
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
      {/* A identificação permanece fixa acima da navegação lateral.
          No celular o menu de seções abre como gaveta. */}
      <div className="shrink-0 border-b border-deep-line bg-deep text-on-deep">
        <div className="mx-auto flex w-full max-w-content items-center gap-2 px-gutter py-2 sm:gap-3 sm:py-3">
          {/* Só a seta, em qualquer largura: o rótulo "Nova busca"
              repetia o que a seta já diz e, no celular, empurrava o
              CNPJ para fora. */}
          <Button
            size="sm"
            variant="deep"
            iconOnly
            aria-label="Voltar para nova busca"
            title="Voltar para nova busca"
            icon={<Icons.ArrowLeft size={16} />}
            onClick={onBack}
          />

          <div className="hidden h-6 w-px shrink-0 bg-deep-line sm:block" />

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-2xs font-bold text-on-deep sm:text-xs">
                {displayDiligence.cnpjFmt}
              </span>
              <Chip
                size="sm"
                tone={
                  displayDiligence.empresa?.descricao_situacao_cadastral === 'ATIVA' ? 'ok' : 'warn'
                }
              >
                {displayDiligence.empresa?.descricao_situacao_cadastral || 'ATIVA'}
              </Chip>
              {/* O município já aparece no cabeçalho do dossiê; no
                  celular ele só disputaria espaço com o CNPJ. */}
              {displayDiligence.empresa?.municipio ? (
                <span className="hidden text-2xs text-on-deep-3 sm:inline">
                  {displayDiligence.empresa.municipio}/{displayDiligence.empresa.uf}
                </span>
              ) : null}
            </div>
            <h1 className="truncate text-xs font-bold text-on-deep">
              {displayDiligence.razaoSocial}
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileSectionsOpen(true)}
              aria-label="Abrir seções da diligência"
              aria-controls="diligence-sections"
              aria-expanded={mobileSectionsOpen}
              className="grid size-9 place-items-center rounded-md border border-deep-line bg-deep-raised text-on-deep lg:hidden"
            >
              <Icons.Menu size={17} />
            </button>
            {/* O índice da pesquisa mantém seu cálculo e ajuste próprios. */}
            <button
              type="button"
              onClick={() => setRiskModalOpen(true)}
              title="Ajustar ou justificar o índice de atenção"
              aria-label={`Índice de atenção ${effectiveRisk.score} de 100; ajustar ou justificar`}
              className="flex min-h-[var(--control-height-sm)] items-center gap-2 rounded-[var(--control-radius-sm)] border border-deep-line bg-deep-raised px-2 text-left transition-colors hover:bg-deep-hover sm:px-3"
            >
              <span className="hidden text-2xs text-on-deep-3 sm:inline">Atenção</span>
              <span className="num text-xs font-bold text-brand-on-deep">{effectiveRisk.score}/100</span>
            </button>

            {/* Um botão só. Passar `hidden` no `className` não esconde
                nada aqui: a classe base do botão já traz `inline-flex`,
                e `cn` não resolve conflito entre utilitários — quem
                decide é a ordem no CSS gerado. Quem some no celular é o
                rótulo, como já se faz na barra do aplicativo. */}
            <Button
              size="sm"
              variant="deep"
              title="Exportar dossiê em PDF"
              icon={<Icons.Download size={16} />}
              isLoading={isExportingPdf}
              loadingLabel="Gerando…"
              onClick={handleExportPdf}
            >
              <span className="hidden sm:inline">Exportar PDF</span>
              <span className="sr-only sm:hidden">Exportar dossiê em PDF</span>
            </Button>
          </div>
        </div>

      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        {mobileSectionsOpen ? (
          <button
            type="button"
            onClick={() => setMobileSectionsOpen(false)}
            aria-label="Fechar seções da diligência"
            className="fixed inset-0 z-backdrop bg-[rgb(10_31_53/0.55)] lg:hidden"
          />
        ) : null}
        <nav
          id="diligence-sections"
          aria-label="Seções da diligência"
          className={`z-drawer fixed inset-y-0 left-0 flex w-[252px] shrink-0 flex-col overflow-y-auto border-r border-deep-line bg-deep px-3 py-5 text-on-deep transition-transform lg:static lg:visible lg:translate-x-0 ${mobileSectionsOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}
        >
          <div className="mb-6 flex items-start justify-between gap-2 px-2">
            <div>
              <p className="text-2xs font-bold uppercase tracking-[0.16em] text-brand-on-deep">Diligência 360</p>
              <p className="mt-1 text-xs text-on-deep-2">Escolha o que deseja analisar</p>
            </div>
            <button type="button" onClick={() => setMobileSectionsOpen(false)} aria-label="Fechar menu" className="grid size-8 place-items-center rounded-md hover:bg-deep-hover lg:hidden"><Icons.Close size={16} /></button>
          </div>
          <p className="px-3 text-2xs font-bold uppercase tracking-[0.13em] text-on-deep-3">Pesquisa automática</p>
          <div className="mt-2 space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-current={activeTab === section.id ? 'page' : undefined}
                onClick={() => openSection(section.id)}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${activeTab === section.id ? 'bg-surface text-brand shadow-sm' : 'text-on-deep-2 hover:bg-deep-hover hover:text-on-deep'}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-deep-raised text-brand-on-deep group-[aria-current=page]:bg-brand-soft group-[aria-current=page]:text-brand">{section.icon}</span>
                <span className="min-w-0"><span className="block text-xs font-bold">{section.label}</span><span className={`block truncate text-2xs ${activeTab === section.id ? 'text-ink-3' : 'text-on-deep-3'}`}>{section.detail}</span></span>
              </button>
            ))}
          </div>
          <div className="mt-6 border-t border-deep-line pt-5">
            <p className="px-3 text-2xs font-bold uppercase tracking-[0.13em] text-on-deep-3">Complemento SUAPE</p>
            <button
              type="button"
              aria-current={activeTab === 'suape' ? 'page' : undefined}
              onClick={() => openSection('suape')}
              className={`mt-2 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${activeTab === 'suape' ? 'border-brand-line bg-surface text-brand' : 'border-deep-line bg-deep-raised text-on-deep hover:border-brand-on-deep'}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-gold-soft text-gold"><Icons.FileSpreadsheet size={17} /></span>
              <span className="min-w-0"><span className="block text-xs font-bold">Avaliação de integridade</span><span className={`block text-2xs ${activeTab === 'suape' ? 'text-ink-3' : 'text-on-deep-3'}`}>{officialEvaluation.calculatedRisk ? officialEvaluation.riskDisplay : 'Anexar questionário'}</span></span>
            </button>
            <p className="px-3 pt-3 text-2xs leading-relaxed text-on-deep-3">Questionário + Política de Contratação de Terceiros.</p>
          </div>
          <div className="mt-auto border-t border-deep-line px-3 pt-4 text-2xs leading-relaxed text-on-deep-3">O índice da pesquisa e a avaliação SUAPE têm critérios próprios.</div>
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

      {activeTab === 'overview' ? (
        <ResearchOverviewView
          diligence={displayDiligence}
          onOpenDossier={() => openSection('dossie')}
          onOpenNetwork={() => openSection('mapa')}
          onOpenReputation={() => openSection('noticias')}
          onOpenSuape={() => openSection('suape')}
        />
      ) : null}

      <div hidden={activeTab !== 'suape'} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SuapeIntegrityEvaluationView
          diligence={displayDiligence}
          discoveries={discoveries}
          answers={integrityAnswers}
          onAnswersChange={setIntegrityAnswers}
          valorContratoStr={contractValueStr}
          onValorContratoChange={setContractValueStr}
          onOpenEvidence={() => setActiveDrawer('evidence')}
          onSaveRiskMapRow={handleSaveRiskMapRow}
          onOpenNetwork={() => openSection('mapa')}
          onDeepenResearch={handleDeepenResearch}
          isResearching={isRefreshingMedia}
          researchNotice={mediaRefreshNotice}
        />
      </div>

      {activeTab === 'noticias' && (
        <NewsWorkspace
          diligence={displayDiligence}
          busy={isRefreshingMedia}
          saving={savingNews}
          progress={newsProgress}
          notice={mediaRefreshNotice}
          onSearch={handleNewsSearch}
          onSave={handleSaveNews}
          onReview={handleMediaStatusChange}
          onAudit={() => setActiveDrawer('media')}
        />
      )}

      {activeTab === 'dossie' ? (
        <DossierView
          diligence={displayDiligence}
          isExportingPdf={isExportingPdf}
          onBack={onBack}
          onExportPdf={handleExportPdf}
          onOpenNetwork={() => openSection('mapa')}
          onOpenAudit={() => setActiveDrawer('audit')}
        />
      ) : null}

      {/* Ao sair do mapa, desmontamos o Cytoscape. Quando o analista
          volta, o ramo inicial é recalculado e enquadrado no espaço
          disponível, sem herdar zoom e pan do nó anterior. */}
      {activeTab === 'relatorio' ? (
        <NarrativeReportView diligence={displayDiligence} evaluation={null} />
      ) : null}

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
            onBackToDossier={() => openSection('dossie')}
          />
        </div>
      ) : null}
        </div>
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
