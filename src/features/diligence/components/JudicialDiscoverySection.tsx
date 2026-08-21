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
import { Card } from '../../../components/ui/Card';
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

  return (
    <Card
      title="Processos Judiciais (DataJud / CNJ)"
      icon={<Icons.Scale size={16} />}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Icons.FileText size={14} />}
            onClick={() => setIsAnalyzerOpen(true)}
          >
            Analisar Conteúdo
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsManualAddOpen(true)}
          >
            + Adicionar Processo
          </Button>
        </div>
      }
      className="dash-full-width"
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
        {discoveries.length > 0 && (
          <div style={{ display: 'flex', gap: '0.35rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.35rem', overflowX: 'auto' }}>
            <button
              type="button"
              className={`btn btn-sm ${filterTab === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setFilterTab('all')}
            >
              Todos ({stats.total})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterTab === 'candidates' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setFilterTab('candidates')}
            >
              Aguardando Revisão ({stats.candidates})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterTab === 'enriched' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setFilterTab('enriched')}
            >
              Enriquecidos ({stats.enriched})
            </button>
          </div>
        )}

        {/* Lista de Processos */}
        {discoveries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            Nenhum processo judicial descoberto ou vinculado a esta diligência.
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            Nenhum processo encontrado para o filtro selecionado.
          </div>
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
    </Card>
  );
};
