// ==========================================================
// DILIGÊNCIA 360 — Tela de Histórico e Filas de Diligências
// ==========================================================

import React, { useState } from 'react';
import { useHistory, HistoryTab } from '../hooks/useHistory';
import { HistoryStorage } from '../services/history.storage';
import { DiligenceItem } from '../../diligence/types';
import { HistoryCard } from './HistoryCard';
import { HistoryEmptyState } from './HistoryEmptyState';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface HistoryViewProps {
  onOpenDiligence: (item: DiligenceItem) => void;
  onNewDiligence: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onOpenDiligence,
  onNewDiligence,
}) => {
  const {
    items,
    totalCount,
    queueCounts,
    activeTab,
    setActiveTab,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    deleteDiligence,
  } = useHistory();

  const [itemToDelete, setItemToDelete] = useState<DiligenceItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenItem = async (summaryItem: DiligenceItem) => {
    if (summaryItem.empresa && summaryItem.risco?.detalhes) {
      onOpenDiligence(summaryItem);
      return;
    }

    const full = await HistoryStorage.getById(summaryItem.id);
    if (full) {
      onOpenDiligence(full);
    } else {
      onOpenDiligence(summaryItem);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDiligence(itemToDelete.id);
      setItemToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs: { id: HistoryTab; label: string; count: number }[] = [
    { id: 'all', label: 'Todas as Diligências', count: queueCounts.total },
    { id: 'mine', label: 'Minhas Diligências', count: queueCounts.mine },
    { id: 'review', label: 'Aguardando Revisão', count: queueCounts.pendingReview },
  ];

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
            Dossiês & Fila de Diligências
          </h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
            {totalCount} dossiê(s) com autoria e workflow registrados no PostgreSQL
          </p>
        </div>

        <Button variant="primary" size="sm" icon={<Icons.Search size={14} />} onClick={onNewDiligence}>
          Nova Diligência
        </Button>
      </div>

      {/* Abas de Fila */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-default)', paddingBottom: '0.5rem' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: activeTab === t.id ? 'var(--color-primary-50)' : 'transparent',
              color: activeTab === t.id ? 'var(--color-primary-700)' : 'var(--text-secondary)',
              fontWeight: activeTab === t.id ? 'var(--font-bold)' : 'var(--font-normal)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>{t.label}</span>
            <span
              style={{
                fontSize: 'var(--text-2xs)',
                padding: '0.1rem 0.4rem',
                borderRadius: '999px',
                backgroundColor: activeTab === t.id ? 'var(--color-primary-600)' : 'var(--bg-surface-subtle)',
                color: activeTab === t.id ? '#fff' : 'var(--text-tertiary)',
              }}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Barra de Filtros */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          className="input-control"
          placeholder="Filtrar por razão social ou CNPJ..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: '220px' }}
        />

        <select
          className="input-control"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: 'auto', minWidth: '180px' }}
        >
          <option value="all">Todos os Status</option>
          <option value="in_progress">Em Execução</option>
          <option value="pending_review">Aguardando Revisão</option>
          <option value="in_review">Em Revisão</option>
          <option value="returned_for_adjustments">Devolvida p/ Ajustes</option>
          <option value="completed">Concluída</option>
        </select>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
          Carregando histórico...
        </div>
      ) : totalCount === 0 ? (
        <HistoryEmptyState onNewDiligence={onNewDiligence} />
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)' }}>
          Nenhuma diligência encontrada para os filtros selecionados.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="animate-fade-in">
          {items.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              onOpen={handleOpenItem}
              onDelete={() => setItemToDelete(item)}
            />
          ))}
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Dossiê */}
      {itemToDelete && (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 1200 }}>
          <div
            className="modal-content animate-fade-in-up"
            style={{
              maxWidth: '460px',
              backgroundColor: '#ffffff',
              background: '#ffffff',
              borderRadius: 'var(--radius-xl)',
              padding: '1.5rem',
              boxShadow: '0 20px 40px -10px rgba(15, 41, 66, 0.35)',
              border: '1px solid var(--border-default)',
            }}
          >
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
              Excluir Dossiê do Histórico
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.5 }}>
              Tem certeza que deseja excluir o dossiê da empresa <strong>{itemToDelete.razaoSocial}</strong> (CNPJ: {itemToDelete.cnpjFmt || itemToDelete.cnpj || 'Não informado'})?
            </p>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--status-critical-text)', marginTop: '0.35rem' }}>
              Esta ação removerá permanentemente o histórico e relatórios associados.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmDelete}
                isLoading={isDeleting}
                style={{ backgroundColor: 'var(--color-critical-600)', borderColor: 'var(--color-critical-600)' }}
              >
                Excluir Dossiê
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
