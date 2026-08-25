import React, { useState } from 'react';
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
import { ConclusionPanel } from './ConclusionPanel';
import { EvidenceSection } from './EvidenceSection';
import { AuditTimeline } from './AuditTimeline';
import { EgosIntelligencePanel } from './EgosIntelligencePanel';

type EvidenceSectionId = 'people' | 'integrity' | 'legal' | 'audit';

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
}

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
}) => {
  const [activeSection, setActiveSection] = useState<EvidenceSectionId>('people');
  const { empresa, socios, ceis, cnep, pepResults, risco, timeline } = diligence;
  const safeShareholders = Array.isArray(socios) ? socios : [];
  const safePepResults = Array.isArray(pepResults) ? pepResults : [];
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const enrichedProcesses = discoveries.filter((item) => item.dataJud).map((item) => item.dataJud!);
  const pepReviewCount = safePepResults.filter((item) => item.encontrado).length;
  const sanctionCount = (ceis?.quantidade || 0) + (cnep?.quantidade || 0);
  const legalCount = discoveries.length;

  const sections: Array<{
    id: EvidenceSectionId;
    label: string;
    helper: string;
    count?: number;
    icon: React.ReactNode;
  }> = [
    {
      id: 'people',
      label: 'Cadastro & Pessoas',
      helper: 'Empresa, sócios e identidade',
      count: safeShareholders.length,
      icon: <Icons.Users size={17} aria-hidden="true" />,
    },
    {
      id: 'integrity',
      label: 'Integridade & Reputação',
      helper: 'Sanções e mídia pública',
      count: sanctionCount,
      icon: <Icons.ShieldCheck size={17} aria-hidden="true" />,
    },
    {
      id: 'legal',
      label: 'Jurídico & Publicações',
      helper: 'Processos e descoberta documental',
      count: legalCount,
      icon: <Icons.Scale size={17} aria-hidden="true" />,
    },
    {
      id: 'audit',
      label: 'Fontes & Auditoria',
      helper: 'Cobertura, proveniência e trilha',
      count: safeTimeline.length,
      icon: <Icons.Database size={17} aria-hidden="true" />,
    },
  ];

  return (
    <section className="evidence-workspace" aria-labelledby="evidence-title">
      <header className="evidence-workspace-header">
        <div>
          <span className="evidence-eyebrow">Dossiê verificável</span>
          <h2 id="evidence-title">Uma pergunta por vez</h2>
          <p>Escolha o assunto. O sistema mostra somente as informações necessárias para responder a essa etapa.</p>
        </div>
        <div className="evidence-provenance-seal">
          <Icons.ShieldCheck size={18} aria-hidden="true" />
          <span><strong>EGOS</strong> Evidência rastreável</span>
        </div>
      </header>

      <div className="evidence-workspace-grid">
        <nav className="evidence-rail" aria-label="Assuntos do dossiê">
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              className={`evidence-rail-item ${activeSection === section.id ? 'active' : ''}`}
              aria-current={activeSection === section.id ? 'page' : undefined}
              onClick={() => setActiveSection(section.id)}
            >
              <span className="evidence-rail-icon">{section.icon}</span>
              <span className="evidence-rail-copy">
                <strong>{section.label}</strong>
                <small>{section.helper}</small>
              </span>
              {typeof section.count === 'number' ? <span className="evidence-rail-count">{section.count}</span> : null}
            </button>
          ))}
        </nav>

        <div className="evidence-stage" aria-live="polite">
          {activeSection === 'people' ? (
            <div className="evidence-stage-pane animate-fade-in" key="people">
              <div className="evidence-stage-intro">
                <span>Quem é a empresa?</span>
                <h3>Cadastro, controle e pessoas relacionadas</h3>
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
            </div>
          ) : null}

          {activeSection === 'integrity' ? (
            <div className="evidence-stage-pane animate-fade-in" key="integrity">
              <div className="evidence-stage-intro">
                <span>Existe impedimento?</span>
                <h3>Sanções oficiais e ocorrências públicas</h3>
                <p>Listas oficiais aparecem primeiro. Menções de mídia permanecem separadas e sempre exigem conferência humana.</p>
              </div>
              <SanctionsSection ceis={ceis} cnep={cnep} />
              <AdverseMediaSection
                adverseMedia={adverseMedia}
                onOpenDrawer={onOpenMedia}
                onStatusChange={onMediaStatusChange}
              />
            </div>
          ) : null}

          {activeSection === 'legal' ? (
            <div className="evidence-stage-pane animate-fade-in" key="legal">
              <div className="evidence-stage-intro">
                <span>Há contexto jurídico?</span>
                <h3>Processos e menções documentais</h3>
                <p>Números processuais descobertos são candidatos até a validação. O DataJud enriquece somente números CNJ já identificados.</p>
              </div>
              <JudicialDiscoverySection
                discoveries={discoveries}
                onUpdateDiscoveries={onUpdateDiscoveries}
                onOpenDrawer={onOpenDiscovery}
                onEnrich={onEnrichDiscovery}
                enrichingId={enrichingId}
              />
            </div>
          ) : null}

          {activeSection === 'audit' ? (
            <div className="evidence-stage-pane animate-fade-in" key="audit">
              <div className="evidence-stage-intro">
                <span>Como comprovamos?</span>
                <h3>Conclusão, fontes e trilha de auditoria</h3>
                <p>Revise a cobertura da análise e o caminho percorrido antes de finalizar o parecer.</p>
              </div>
              <EgosIntelligencePanel egos={diligence.egos} diligenceId={diligence.id} showGraph={false} />
              <ConclusionPanel risco={risco} />
              <EvidenceSection
                ceis={ceis}
                cnep={cnep}
                pepResults={safePepResults}
                processosJudiciais={enrichedProcesses}
                adverseMedia={adverseMedia}
                consultadoEm={diligence.dataAnalise}
              />
              <AuditTimeline timeline={safeTimeline} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};
