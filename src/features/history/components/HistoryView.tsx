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
import { Modal } from '../../../components/ui/Modal';

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
    <div className="history-page">
      <div className="section-page-heading">
        <div>
          <span className="section-page-eyebrow">Gestão das análises</span>
          <h1>
            Dossiês & Fila de Diligências
          </h1>
          <p>
            Encontre uma empresa, acompanhe a revisão e retome dossiês sem perder o contexto.
          </p>
        </div>

        <Button variant="primary" size="sm" icon={<Icons.Search size={14} />} onClick={onNewDiligence}>
          Nova Diligência
        </Button>
      </div>

      {/* Abas de Fila */}
      <div className="history-tabs" role="tablist" aria-label="Filas de diligências">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={activeTab === t.id ? 'active' : ''}
            role="tab"
            aria-selected={activeTab === t.id}
          >
            <span>{t.label}</span>
            <strong>{t.count}</strong>
          </button>
        ))}
      </div>

      {/* Barra de Filtros */}
      <div className="history-filters">
        <input
          type="text"
          className="input-control"
          placeholder="Filtrar por razão social ou CNPJ..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filtrar por razão social ou CNPJ"
        />

        <select
          className="input-control"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por status"
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
        <div className="history-list animate-fade-in">
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
      <Modal
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
        title="Remover Dossiê da Visualização"
        icon={<Icons.Trash size={18} />}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="md"
              onClick={() => setItemToDelete(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleConfirmDelete}
              isLoading={isDeleting}
            >
              Remover Dossiê
            </Button>
          </>
        }
      >
        {itemToDelete && (
          <>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Tem certeza que deseja remover o dossiê da empresa <strong>{itemToDelete.razaoSocial}</strong> (CNPJ: {itemToDelete.cnpjFmt || itemToDelete.cnpj || 'Não informado'}) da lista ativa?
            </p>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--status-critical-text)', margin: 0 }}>
              O conteúdo, as versões, os relatórios e a auditoria continuarão preservados na planilha.
            </p>
          </>
        )}
      </Modal>
    </div>
  );
};
