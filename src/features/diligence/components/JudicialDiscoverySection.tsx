// ==========================================================
// DILIGÊNCIA 360 — Seção do Motor de Descoberta Processual
// Painel de consolidação, proveniência e enriquecimento (Compacto)
// ==========================================================

import React, { useState, useMemo } from 'react';
import { ProcessDiscovery, DiscoverySource } from '../types';
import { ExtractedCNJ } from '../../../lib/cnj';
import { DiscoveryEngine } from '../utils/discoveryEngine';
import { JudicialDiscoveryCard } from './JudicialDiscoveryCard';
import { ContentAnalyzerModal } from './ContentAnalyzerModal';
import { JudicialManualAddModal } from './JudicialManualAddModal';
import { Section } from '../../../components/ui/Section';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Note } from '../../../components/ui/Note';
import { TabStrip } from '../../../components/ui/TabStrip';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface JudicialDiscoverySectionProps {
  discoveries: ProcessDiscovery[];
  onUpdateDiscoveries: (updated: ProcessDiscovery[]) => void;
  onOpenDrawer: (discovery: ProcessDiscovery) => void;
  onEnrich: (discovery: ProcessDiscovery) => void;
  enrichingId?: string | null;
}

export const JudicialDiscoverySection: React.FC<JudicialDiscoverySectionProps> = ({
  discoveries,
  onUpdateDiscoveries,
  onOpenDrawer,
  onEnrich,
  enrichingId,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'candidates' | 'validated' | 'enriched' | 'discarded'>('all');
  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => DiscoveryEngine.getStats(discoveries), [discoveries]);

  const filteredList = useMemo(() => {
    switch (filterTab) {
      case 'candidates':
        return discoveries.filter((d) => d.status === 'candidate');
      case 'validated':
        return discoveries.filter((d) => d.status === 'validated');
      case 'enriched':
        return discoveries.filter((d) => d.status === 'enriched');
      case 'discarded':
        return discoveries.filter((d) => d.status === 'discarded');
      default:
        return discoveries;
    }
  }, [discoveries, filterTab]);

  const displayList = showAll ? filteredList : filteredList.slice(0, 3);

  const handleMergeExtracted = (extracted: ExtractedCNJ[], source: DiscoverySource, autoValidate = false) => {
    const { updatedList } = DiscoveryEngine.mergeDiscoveredProcesses(discoveries, extracted, source, autoValidate);
    onUpdateDiscoveries(updatedList);
  };

  if (discoveries.length === 0) {
    return (
      <>
        <Section mark={<Icons.Scale size={12} />} title="Processos judiciais (DataJud / CNJ)">
          <EmptyState
            icon={<Icons.Scale size={20} />}
            title="Nenhum processo vinculado"
            description="Analise um documento ou informe um número CNJ para iniciar esta verificação."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAnalyzerOpen(true)}
                  icon={<Icons.FileText size={14} aria-hidden="true" />}
                >
                  Analisar conteúdo
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsManualAddOpen(true)}
                  icon={<Icons.Plus size={14} aria-hidden="true" />}
                >
                  Adicionar processo
                </Button>
              </div>
            }
          />
        </Section>

        <ContentAnalyzerModal
          isOpen={isAnalyzerOpen}
          onClose={() => setIsAnalyzerOpen(false)}
          onExtractAndSave={handleMergeExtracted}
        />
        <JudicialManualAddModal
          isOpen={isManualAddOpen}
          onClose={() => setIsManualAddOpen(false)}
          onAdd={handleMergeExtracted}
        />
      </>
    );
  }

  return (
    <Section
      mark={<Icons.Scale size={12} />}
      title="Processos judiciais (DataJud / CNJ)"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAnalyzerOpen(true)}
            icon={<Icons.FileText size={14} aria-hidden="true" />}
          >
            Analisar conteúdo
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsManualAddOpen(true)}
            icon={<Icons.Plus size={14} aria-hidden="true" />}
          >
            Adicionar processo
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {/* Faixa Resumo das Descobertas */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.625rem 0.875rem',
            backgroundColor: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
              {stats.total} processo(s) vinculado(s)
            </span>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            <span style={{ color: 'var(--status-low-text)' }}>
              {stats.enriched} enriquecido(s) no DataJud
            </span>
            <span style={{ color: 'var(--border-strong)' }}>|</span>
            <span style={{ color: 'var(--status-medium-text)' }}>
              {stats.candidates} aguardando revisão
            </span>
          </div>
        </div>

        {/* Abas de Filtro */}
        {discoveries.length > 0 ? (
          <div className="border-b border-line-soft bg-surface">
            <TabStrip
              items={[
                { id: 'all', label: 'Todos', count: stats.total },
                { id: 'candidates', label: 'Aguardando revisão', count: stats.candidates },
                { id: 'enriched', label: 'Enriquecidos', count: stats.enriched },
              ]}
              activeId={filterTab}
              onSelect={(id) => setFilterTab(id as typeof filterTab)}
              label="Filtros de processos"
            />
          </div>
        ) : null}

        {/* Lista de Processos */}
        {discoveries.length === 0 ? (
          <Note tone="neutral" icon={<Icons.Info size={15} aria-hidden="true" />}>
            Nenhum processo judicial descoberto ou vinculado a esta diligência.
          </Note>
        ) : filteredList.length === 0 ? (
          <Note tone="neutral" icon={<Icons.Filter size={15} aria-hidden="true" />}>
            Nenhum processo encontrado para o filtro selecionado.
          </Note>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {displayList.map((disc) => (
              <JudicialDiscoveryCard
                key={disc.processNumber}
                discovery={disc}
                onOpenDetails={onOpenDrawer}
                onEnrich={onEnrich}
                isEnriching={enrichingId === disc.processNumber}
              />
            ))}

            {filteredList.length > 3 && (
              <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
                <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Recolher lista' : `Exibir todos os ${filteredList.length} processos ➜`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modais */}
      <ContentAnalyzerModal
        isOpen={isAnalyzerOpen}
        onClose={() => setIsAnalyzerOpen(false)}
        onExtractAndSave={handleMergeExtracted}
      />

      <JudicialManualAddModal
        isOpen={isManualAddOpen}
        onClose={() => setIsManualAddOpen(false)}
        onAdd={handleMergeExtracted}
      />
    </Section>
  );
};
