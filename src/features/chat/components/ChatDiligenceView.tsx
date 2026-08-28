// ==========================================================
// DILIGÊNCIA 360 — Visão Conversacional Estilo Claude.ai
// ==========================================================

import React, { useState } from 'react';
import { DiligenceItem, DiligenceStepConfig, SanctionRecord } from '../../diligence/types';
import { ChatWelcomeHeader } from './ChatWelcomeHeader';
import { ChatPromptBox } from './ChatPromptBox';
import { ChatProgressStream } from './ChatProgressStream';
import { ChatDiligenceResultCard } from './ChatDiligenceResultCard';
import { ShareholdersDrawer } from '../../diligence/components/ShareholdersDrawer';
import { SanctionsDrawer } from '../../diligence/components/SanctionsDrawer';
import { AdverseMediaDrawer } from '../../diligence/components/AdverseMediaDrawer';
import { ContentAnalyzerModal } from '../../diligence/components/ContentAnalyzerModal';

interface ChatDiligenceViewProps {
  onSearch: (cnpj: string) => void;
  isLoading: boolean;
  error: string | null;
  steps: DiligenceStepConfig[];
  currentDiligence: DiligenceItem | null;
  onOpenDashboard: (item: DiligenceItem) => void;
}

export const ChatDiligenceView: React.FC<ChatDiligenceViewProps> = ({
  onSearch,
  isLoading,
  error,
  steps,
  currentDiligence,
  onOpenDashboard,
}) => {
  const [promptValue, setPromptValue] = useState('');
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<'qsa' | 'sanctions' | 'media' | 'judicial' | null>(null);

  const handleSubmit = (query: string) => {
    setLastQuery(query);
    setPromptValue('');
    onSearch(query);
  };

  const handleDrawerOpen = (type: 'qsa' | 'sanctions' | 'media' | 'judicial') => {
    if (type === 'judicial') {
      if (currentDiligence) onOpenDashboard(currentDiligence);
      return;
    }
    setActiveDrawer(type);
  };

  const hasConversation = Boolean(lastQuery || isLoading || currentDiligence);

  const allSanctions: SanctionRecord[] = [
    ...(currentDiligence?.ceis?.registros || []),
    ...(currentDiligence?.cnep?.registros || []),
  ];

  return (
    <div className={`chat-workspace ${hasConversation ? 'has-conversation' : ''}`}>
      {!hasConversation && (
        <ChatWelcomeHeader
          onSearch={handleSubmit}
          onOpenContentExtractor={() => setIsAnalyzerOpen(true)}
          isLoading={isLoading}
        />
      )}

      {hasConversation && (
        <div className="chat-conversation-stream animate-fade-in">
          {/* Mensagem do Usuário */}
          {lastQuery && (
            <div className="chat-user-row">
              <div className="chat-user-bubble">
                <span>Auditar integridade e conformidade de <strong>{lastQuery}</strong></span>
              </div>
            </div>
          )}

          {/* Mensagem do Assistente */}
          <div className="chat-assistant-row">
            <div className="chat-assistant-avatar">
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>✳</span>
            </div>
            <div className="chat-assistant-content">
              {(isLoading || (steps && steps.length > 0)) && (
                <ChatProgressStream steps={steps} />
              )}

              {error && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--status-critical-bg)',
                    color: 'var(--status-critical-text)',
                    fontSize: 'var(--text-xs)',
                    border: '1px solid var(--status-critical-border)',
                  }}
                >
                  {error}
                </div>
              )}

              {!isLoading && currentDiligence && (
                <ChatDiligenceResultCard
                  diligence={currentDiligence}
                  onOpenDashboard={onOpenDashboard}
                  onOpenDrawer={handleDrawerOpen}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Caixa de Prompt Fixada na Base */}
      <div className="chat-prompt-dock">
        <ChatPromptBox
          value={promptValue}
          onChange={setPromptValue}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onOpenContentExtractor={() => setIsAnalyzerOpen(true)}
        />
      </div>

      {/* Gavetas e Modais */}
      {currentDiligence && (
        <>
          <ShareholdersDrawer
            isOpen={activeDrawer === 'qsa'}
            onClose={() => setActiveDrawer(null)}
            socios={currentDiligence.socios || []}
            pepResults={currentDiligence.pepResults || []}
            sourceName={currentDiligence.companySource}
            consultedAt={currentDiligence.companyConsultedAt || currentDiligence.dataAnalise}
            legalNature={currentDiligence.empresa.natureza_juridica}
            governanceHistory={currentDiligence.governanceHistory}
          />
          <SanctionsDrawer
            isOpen={activeDrawer === 'sanctions'}
            onClose={() => setActiveDrawer(null)}
            tipo="CEIS"
            registros={allSanctions}
          />
          <AdverseMediaDrawer
            isOpen={activeDrawer === 'media'}
            onClose={() => setActiveDrawer(null)}
            adverseMedia={currentDiligence.adverseMedia}
          />
        </>
      )}

      {isAnalyzerOpen && (
        <ContentAnalyzerModal
          isOpen={isAnalyzerOpen}
          onClose={() => setIsAnalyzerOpen(false)}
          onExtractAndSave={() => {
            setIsAnalyzerOpen(false);
          }}
        />
      )}
    </div>
  );
};
