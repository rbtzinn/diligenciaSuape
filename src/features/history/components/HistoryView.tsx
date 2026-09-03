// ==========================================================
// DILIGÊNCIA 360 — Histórico e filas de diligências
// ==========================================================
// A tela dependia de `.history-page`, `.section-page-heading`,
// `.history-tabs`, `.history-filters` e `.history-list`, sem nenhuma
// relação com o cabeçalho das outras telas: título em corpo
// diferente, calha diferente, e as abas quebravam em duas fileiras
// no celular. Agora usa a casca de página e a fita de abas do
// projeto, como o dossiê.
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
import { Note } from '../../../components/ui/Note';
import { Page, PageBody, PageHeader } from '../../../components/layout/Page';
import { TabStrip } from '../../../components/ui/TabStrip';
import { TextField, Select } from '../../../components/ui/Field';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'in_progress', label: 'Em execução' },
  { value: 'pending_review', label: 'Aguardando revisão' },
  { value: 'in_review', label: 'Em revisão' },
  { value: 'returned_for_adjustments', label: 'Devolvida para ajustes' },
  { value: 'completed', label: 'Concluída' },
] as const;

interface HistoryViewProps {
  onOpenDiligence: (item: DiligenceItem) => void;
  onNewDiligence: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ onOpenDiligence, onNewDiligence }) => {
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
    onOpenDiligence(full || summaryItem);
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

  const tabs = [
    { id: 'all' as HistoryTab, label: 'Todas as diligências', count: queueCounts.total },
    { id: 'mine' as HistoryTab, label: 'Minhas diligências', count: queueCounts.mine },
    { id: 'review' as HistoryTab, label: 'Aguardando revisão', count: queueCounts.pendingReview },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Gestão das análises"
        title="Dossiês e fila de diligências"
        subtitle="Encontre uma empresa, acompanhe a revisão e retome dossiês sem perder o contexto."
        actions={
          <Button variant="primary" size="sm" icon={<Icons.Search size={15} aria-hidden="true" />} onClick={onNewDiligence}>
            Nova diligência
          </Button>
        }
        tabs={
          <TabStrip
            items={tabs}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as HistoryTab)}
            label="Filas de diligências"
          />
        }
      />

      <PageBody gap="sm">
        {/* Rótulo visível em vez de `aria-label`: atributo com hífen
            não é checado pelo TypeScript em componente, então um
            `aria-label` passado a um componente que não o repassa
            desaparece sem erro — e o campo fica sem nome acessível. */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <TextField
            label="Buscar empresa"
            controlSize="sm"
            type="search"
            placeholder="Razão social ou CNPJ…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            leading={<Icons.Search size={15} />}
          />

          <Select
            label="Status"
            controlSize="sm"
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={setStatusFilter}
          />
        </div>

        {isLoading ? (
          <Note tone="neutral" icon={<Icons.Loader size={15} aria-hidden="true" />}>
            Carregando histórico…
          </Note>
        ) : totalCount === 0 ? (
          <HistoryEmptyState onNewDiligence={onNewDiligence} />
        ) : items.length === 0 ? (
          <Note tone="neutral" icon={<Icons.Filter size={15} aria-hidden="true" />}>
            Nenhuma diligência encontrada para os filtros selecionados.
          </Note>
        ) : (
          <div className="flex animate-fade-in flex-col gap-2">
            {items.map((item) => (
              <HistoryCard key={item.id} item={item} onOpen={handleOpenItem} onDelete={() => setItemToDelete(item)} />
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
        role="alertdialog"
        title="Remover dossiê da visualização"
        icon={<Icons.Trash size={17} />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setItemToDelete(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} isLoading={isDeleting} loadingLabel="Removendo…">
              Remover dossiê
            </Button>
          </>
        }
      >
        {itemToDelete ? (
          <>
            <p className="text-base leading-relaxed text-ink-2">
              Tem certeza que deseja remover o dossiê da empresa <strong className="text-ink">{itemToDelete.razaoSocial}</strong>{' '}
              (<span className="font-mono">{itemToDelete.cnpjFmt || itemToDelete.cnpj || 'CNPJ não informado'}</span>) da
              lista ativa?
            </p>

            <Note tone="info" icon={<Icons.ShieldCheck size={15} aria-hidden="true" />}>
              O conteúdo, as versões, os relatórios e a auditoria continuarão preservados na planilha.
            </Note>
          </>
        ) : null}
      </Modal>
    </Page>
  );
};
