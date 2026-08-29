import React from 'react';
import { Icons } from '../../../components/ui/Icons';
import type {
  AdverseMediaStatus,
  AdverseMediaSummary,
  DiligenceItem,
  ProcessDiscovery,
} from '../types';
import { CompanyProfile } from './CompanyProfile';
import { ShareholdersSection } from './ShareholdersSection';
import { PepSection } from './PepSection';
import { SanctionsSection } from './SanctionsSection';
import { AdverseMediaSection } from './AdverseMediaSection';
import { JudicialDiscoverySection } from './JudicialDiscoverySection';
import { EvidenceSection } from './EvidenceSection';
import { AuditTimeline } from './AuditTimeline';
import { EgosIntelligencePanel } from './EgosIntelligencePanel';

interface EvidenceWorkspaceProps {
  diligence: DiligenceItem;
  discoveries: ProcessDiscovery[];
  adverseMedia?: AdverseMediaSummary;
  onOpenShareholders: () => void;
  onOpenMedia: () => void;
  onUpdateDiscoveries: (items: ProcessDiscovery[]) => void;
  onOpenDiscovery: (item: ProcessDiscovery) => void;
  onEnrichDiscovery: (item: ProcessDiscovery) => void;
  enrichingId: string | null;
  onMediaStatusChange: (id: string, status: AdverseMediaStatus) => void;
  onRefreshMedia: () => void;
  isRefreshingMedia: boolean;
  mediaRefreshNotice?: string | null;
}

type AxisTab = 'people' | 'integrity' | 'legal' | 'audit';

export const EvidenceWorkspace: React.FC<EvidenceWorkspaceProps> = ({
  diligence,
  discoveries,
  adverseMedia,
  onOpenShareholders,
  onOpenMedia,
  onUpdateDiscoveries,
  onOpenDiscovery,
  onEnrichDiscovery,
  enrichingId,
  onMediaStatusChange,
  onRefreshMedia,
  isRefreshingMedia,
  mediaRefreshNotice,
}) => {
  const [activeAxisTab, setActiveAxisTab] = React.useState<AxisTab>('people');
  const { empresa, socios, ceis, cnep, pepResults, timeline } = diligence;
  const safeShareholders = Array.isArray(socios) ? socios : [];
  const safePepResults = Array.isArray(pepResults) ? pepResults : [];
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const enrichedProcesses = discoveries.filter((item) => item.dataJud).map((item) => item.dataJud!);
  const pepReviewCount = safePepResults.filter((item) => item.encontrado).length;
  const sanctionCount = (ceis?.quantidade || 0) + (cnep?.quantidade || 0);
  const mediaResultCount = adverseMedia?.results?.length || 0;
  const sanctionsCleared = Boolean(ceis?.ok && cnep?.ok && sanctionCount === 0);
  const mediaCleared = Boolean(adverseMedia?.ok && !adverseMedia.consultaParcial && mediaResultCount === 0);
  const clearedChecks = [
    sanctionsCleared ? 'sanções oficiais' : null,
    mediaCleared ? 'ocorrências públicas' : null,
    safePepResults.length > 0 && pepReviewCount === 0 ? 'cargos políticos dos sócios' : null,
  ].filter((label): label is string => Boolean(label));

  const sections: Array<{
    id: AxisTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'people',
      label: 'Cadastro & Pessoas',
      icon: <Icons.Users size={16} aria-hidden="true" />,
      badge: safeShareholders.length > 0 ? safeShareholders.length : undefined,
    },
    {
      id: 'integrity',
      label: 'Integridade & Reputação',
      icon: <Icons.ShieldCheck size={16} aria-hidden="true" />,
      badge: sanctionCount + mediaResultCount > 0 ? sanctionCount + mediaResultCount : undefined,
    },
    {
      id: 'legal',
      label: 'Jurídico & Publicações',
      icon: <Icons.Scale size={16} aria-hidden="true" />,
      badge: discoveries.length > 0 ? discoveries.length : undefined,
    },
    {
      id: 'audit',
      label: 'Fontes & Auditoria',
      icon: <Icons.Database size={16} aria-hidden="true" />,
    },
  ];

  return (
    <section className="evidence-workspace" aria-labelledby="evidence-title">
      <header className="evidence-workspace-header">
        <div>
          <span className="evidence-eyebrow">Dossiê verificável</span>
          <h2 id="evidence-title">Eixos de Evidência e Auditoria</h2>
          <p>Navegue pelas abas temáticas para inspecionar cadastros, sanções, processos e fontes com trilha rastreável.</p>
        </div>
        <div className="evidence-provenance-seal">
          <Icons.ShieldCheck size={18} aria-hidden="true" />
          <span><strong>EGOS</strong> Evidência rastreável</span>
        </div>
      </header>

      <nav className="evidence-tab-nav" role="tablist" aria-label="Eixos das evidências">
        {sections.map((section) => {
          const isActive = activeAxisTab === section.id;
          return (
            <button
              type="button"
              role="tab"
              id={`tab-${section.id}`}
              aria-controls={`panel-${section.id}`}
              aria-selected={isActive}
              className={`evidence-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveAxisTab(section.id)}
              key={section.id}
            >
              <span className="evidence-tab-icon" aria-hidden="true">{section.icon}</span>
              <span className="evidence-tab-label">{section.label}</span>
              {section.badge !== undefined ? (
                <span className="evidence-tab-badge">{section.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {clearedChecks.length > 0 ? (
        <div className="evidence-zero-summary" role="status">
          <Icons.CheckCircle size={19} aria-hidden="true" />
          <p><strong>Verificações sem achados:</strong> {clearedChecks.join(', ')}.</p>
        </div>
      ) : null}

      <div className="evidence-stage">
        {activeAxisTab === 'people' && (
          <section className="evidence-axis-section animate-fade-in-up" id="panel-people" role="tabpanel" aria-labelledby="tab-people">
            <div className="evidence-stage-intro">
              <span>Quem é a empresa?</span>
              <h3 id="evidence-people-title">Cadastro, controle e pessoas relacionadas</h3>
              <p>Confirme a existência da empresa, sua atividade e quem pode representá-la antes de avaliar riscos adicionais.</p>
            </div>
            <div className="evidence-component-grid">
              <CompanyProfile empresa={empresa} cnpjFmt={diligence.cnpjFmt} />
              <ShareholdersSection
                socios={safeShareholders}
                pepResults={safePepResults}
                governanceHistory={diligence.governanceHistory}
                onOpenDrawer={onOpenShareholders}
              />
            </div>
            {pepReviewCount > 0 ? (
              <PepSection pepResults={safePepResults} onOpenDrawer={onOpenShareholders} />
            ) : null}
          </section>
        )}

        {activeAxisTab === 'integrity' && (
          <section className="evidence-axis-section animate-fade-in-up" id="panel-integrity" role="tabpanel" aria-labelledby="tab-integrity">
            <div className="evidence-stage-intro">
              <span>Existe impedimento?</span>
              <h3 id="evidence-integrity-title">Sanções oficiais e ocorrências públicas</h3>
              <p>Listas oficiais aparecem primeiro. Menções de mídia permanecem separadas e sempre exigem conferência humana.</p>
            </div>
            {!sanctionsCleared ? <SanctionsSection ceis={ceis} cnep={cnep} /> : null}
            {!mediaCleared ? (
              <AdverseMediaSection
                adverseMedia={adverseMedia}
                onOpenDrawer={onOpenMedia}
                onStatusChange={onMediaStatusChange}
                onRefresh={onRefreshMedia}
                isRefreshing={isRefreshingMedia}
                refreshNotice={mediaRefreshNotice}
              />
            ) : null}
            {sanctionsCleared && mediaCleared ? (
              <div className="evidence-zero-summary" role="status">
                <Icons.CheckCircle size={19} aria-hidden="true" />
                <p><strong>Nenhum impedimento:</strong> Sanções oficiais (CEIS/CNEP) e ocorrências públicas sem apontamentos.</p>
              </div>
            ) : null}
          </section>
        )}

        {activeAxisTab === 'legal' && (
          <section className="evidence-axis-section animate-fade-in-up" id="panel-legal" role="tabpanel" aria-labelledby="tab-legal">
            <div className="evidence-stage-intro">
              <span>Há contexto jurídico?</span>
              <h3 id="evidence-legal-title">Processos e menções documentais</h3>
              <p>Números processuais descobertos são candidatos até a validação. O DataJud enriquece somente números CNJ já identificados.</p>
            </div>
            <JudicialDiscoverySection
              discoveries={discoveries}
              onUpdateDiscoveries={onUpdateDiscoveries}
              onOpenDrawer={onOpenDiscovery}
              onEnrich={onEnrichDiscovery}
              enrichingId={enrichingId}
            />
          </section>
        )}

        {activeAxisTab === 'audit' && (
          <section className="evidence-axis-section animate-fade-in-up" id="panel-audit" role="tabpanel" aria-labelledby="tab-audit">
            <div className="evidence-stage-intro">
              <span>Como comprovamos?</span>
              <h3 id="evidence-audit-title">Fontes, proveniência e trilha de auditoria</h3>
              <p>Revise a cobertura da análise e o caminho percorrido antes de finalizar o parecer.</p>
            </div>
            <EgosIntelligencePanel egos={diligence.egos} diligenceId={diligence.id} showGraph={false} />
            <EvidenceSection
              ceis={ceis}
              cnep={cnep}
              pepResults={safePepResults}
              processosJudiciais={enrichedProcesses}
              adverseMedia={adverseMedia}
              consultadoEm={diligence.dataAnalise}
            />
            <AuditTimeline timeline={safeTimeline} />
          </section>
        )}
      </div>
    </section>
  );
};
