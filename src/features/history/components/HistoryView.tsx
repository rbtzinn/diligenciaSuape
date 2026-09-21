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

import React, { useMemo, useState } from 'react';
import { useHistory, HistoryTab } from '../hooks/useHistory';
import { HistoryStorage } from '../services/history.storage';
import { DiligenceItem } from '../../diligence/types';
import type { DiligenceSummary } from '../services/history.storage';
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
    deleteDiligences,
  } = useHistory();

  // Um único caminho de exclusão serve o botão da linha e o lote: são a
  // mesma operação com uma lista de tamanho diferente, e mantê-las
  // separadas dobraria o tratamento de erro.
  const [pendingDeletion, setPendingDeletion] = useState<DiligenceSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const selecionados = useMemo(() => new Set(selectedIds), [selectedIds]);

  // A seleção acompanha o filtro: some da tela, sai da conta. Remover
  // algo que o analista não está vendo é o tipo de surpresa que não se
  // desfaz.
  const selecionadosVisiveis = useMemo(
    () => items.filter((item) => selecionados.has(item.id)),
    [items, selecionados],
  );

  const toggleSelecionado = (id: string) => {
    setDeleteNotice(null);
    setSelectedIds((atual) => (
      atual.includes(id) ? atual.filter((outro) => outro !== id) : [...atual, id]
    ));
  };

  const todosVisiveisSelecionados = items.length > 0 && selecionadosVisiveis.length === items.length;

  const alternarTodos = () => {
    setDeleteNotice(null);
    setSelectedIds(todosVisiveisSelecionados ? [] : items.map((item) => item.id));
  };

  // O cartão traz o resumo; o dossiê completo vem do Google Sheets ao abrir.
  const handleOpenItem = async (summaryItem: DiligenceSummary) => {
    setLoadError(null);
    let full: DiligenceItem | null;
    try {
      full = await HistoryStorage.getById(summaryItem.id);
    } catch (error) {
      // Mesma armadilha do remover: sem `catch`, a fonte fora do ar
      // virava rejeição não tratada e a tela não reagia ao clique.
      setLoadError(
        error instanceof Error
          ? `Não foi possível abrir este dossiê: ${error.message}`
          : 'Não foi possível abrir este dossiê agora.'
      );
      return;
    }
    // Sem o dossiê completo não há o que abrir. Antes o resumo era passado
    // adiante como se fosse o dossiê, e a tela renderizava um dossiê sem
    // empresa, sem sócios e sem evidência — parecendo vazio em vez de
    // indisponível.
    if (!full) {
      setLoadError('Não foi possível recuperar este dossiê do histórico permanente. '
        + 'Tente novamente quando a fonte responder.');
      return;
    }
    onOpenDiligence(full);
  };

  // `try/finally` sem `catch` deixava a falha subir como rejeição não
  // tratada: o diálogo ficava aberto sem dizer nada, o analista clicava
  // de novo, e a única pista era um "Uncaught (in promise)" no console —
  // que ninguém vê no celular. A falha agora é dita onde o clique
  // aconteceu, dentro do próprio diálogo.
  const handleConfirmDelete = async () => {
    if (pendingDeletion.length === 0) return;
    setIsDeleting(true);
    setDeleteError(null);
    setDeleteNotice(null);

    const alvos = pendingDeletion.map((item) => item.id);

    try {
      const { removidos, falhas } = await deleteDiligences(alvos);

      // O que falhou continua selecionado: é o que o analista precisa
      // tentar de novo, e limpar tudo apagaria essa informação.
      const idsComFalha = new Set(falhas.map((falha) => falha.id));
      setSelectedIds((atual) => atual.filter((id) => idsComFalha.has(id) || !alvos.includes(id)));

      if (falhas.length === 0) {
        setPendingDeletion([]);
        setDeleteNotice(
          removidos === 1
            ? 'Dossiê removido da lista ativa.'
            : `${removidos} dossiês removidos da lista ativa.`
        );
        return;
      }

      const nomes = falhas
        .map((falha) => pendingDeletion.find((item) => item.id === falha.id)?.razaoSocial || falha.id)
        .slice(0, 3)
        .join(', ');

      setDeleteError(
        `${removidos > 0 ? `${removidos} removido(s). ` : ''}`
        + `${falhas.length} não pôde(ram) ser removido(s) e continua(m) na lista: ${nomes}`
        + `${falhas.length > 3 ? ' e outros' : ''}. Motivo: ${falhas[0].motivo}`
      );
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? `Não foi possível remover agora: ${error.message}`
          : 'Não foi possível remover os dossiês agora.'
      );
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
        className="harbor-page-header"
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
        {loadError ? (
          <Note tone="warn" role="alert">{loadError}</Note>
        ) : null}

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
          <>
            {/* Barra de seleção. Ocupa espaço sempre, e não só quando há
                algo marcado: a caixa de "selecionar todas" precisa estar
                em algum lugar antes da primeira marcação. */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[var(--control-radius-md)] border border-line bg-surface-subtle px-3 py-2">
              <label className="flex min-w-0 cursor-pointer items-center gap-2 text-xs font-semibold text-ink-2">
                <input
                  type="checkbox"
                  checked={todosVisiveisSelecionados}
                  // Marcado em parte: o traço diz que a seleção existe
                  // mas não cobre a lista toda.
                  ref={(node) => {
                    if (node) {
                      node.indeterminate = selecionadosVisiveis.length > 0 && !todosVisiveisSelecionados;
                    }
                  }}
                  onChange={alternarTodos}
                  className="size-4 cursor-pointer accent-[color:var(--color-brand)]"
                />
                {selecionadosVisiveis.length > 0
                  ? `${selecionadosVisiveis.length} de ${items.length} selecionada(s)`
                  : `Selecionar as ${items.length} desta lista`}
              </label>

              {selecionadosVisiveis.length > 0 ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedIds([]); setDeleteNotice(null); }}
                    disabled={isDeleting}
                  >
                    Limpar seleção
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Icons.Trash size={15} aria-hidden="true" />}
                    onClick={() => { setDeleteError(null); setPendingDeletion(selecionadosVisiveis); }}
                  >
                    Remover {selecionadosVisiveis.length}
                  </Button>
                </div>
              ) : null}
            </div>

            {deleteNotice ? (
              <Note tone="ok" role="status">{deleteNotice}</Note>
            ) : null}

            {/* Fora do diálogo também: uma remoção em lote parcial
                precisa ser lida depois que o diálogo fecha. */}
            {deleteError && pendingDeletion.length === 0 ? (
              <Note tone="high" role="alert">{deleteError}</Note>
            ) : null}

            <div className="flex animate-fade-in flex-col gap-2.5">
              {items.map((item) => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  onOpen={handleOpenItem}
                  onDelete={() => { setDeleteError(null); setPendingDeletion([item]); }}
                  selected={selecionados.has(item.id)}
                  onToggleSelect={toggleSelecionado}
                />
              ))}
            </div>
          </>
        )}
      </PageBody>

      <Modal
        isOpen={pendingDeletion.length > 0}
        onClose={() => { setPendingDeletion([]); setDeleteError(null); }}
        role="alertdialog"
        title={pendingDeletion.length > 1 ? 'Remover dossiês da visualização' : 'Remover dossiê da visualização'}
        icon={<Icons.Trash size={17} />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPendingDeletion([]); setDeleteError(null); }} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} isLoading={isDeleting} loadingLabel="Removendo…">
              {pendingDeletion.length > 1 ? `Remover ${pendingDeletion.length} dossiês` : 'Remover dossiê'}
            </Button>
          </>
        }
      >
        {pendingDeletion.length > 0 ? (
          <>
            {pendingDeletion.length === 1 ? (
              <p className="text-base leading-relaxed text-ink-2">
                Tem certeza que deseja remover o dossiê da empresa{' '}
                <strong className="text-ink">{pendingDeletion[0].razaoSocial}</strong>{' '}
                (<span className="font-mono">{pendingDeletion[0].cnpjFmt || pendingDeletion[0].cnpj || 'CNPJ não informado'}</span>)
                da lista ativa?
              </p>
            ) : (
              <>
                <p className="text-base leading-relaxed text-ink-2">
                  Tem certeza que deseja remover{' '}
                  <strong className="text-ink">{pendingDeletion.length} dossiês</strong> da lista ativa?
                </p>
                {/* A lista inteira, e não só a contagem: confirmar uma
                    remoção em lote sem ver o que vai sair é como assinar
                    sem ler. */}
                <ul className="max-h-48 overflow-y-auto rounded-[var(--control-radius-md)] border border-line bg-surface-subtle p-2 text-sm">
                  {pendingDeletion.map((item) => (
                    <li key={item.id} className="min-w-0 truncate py-0.5 text-ink-2">
                      {item.razaoSocial}{' '}
                      <span className="font-mono text-xs text-ink-3">{item.cnpjFmt || item.cnpj}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Note tone="info" icon={<Icons.ShieldCheck size={15} aria-hidden="true" />}>
              O conteúdo, as versões, os relatórios e a auditoria continuarão preservados na planilha.
            </Note>

            {deleteError ? (
              <Note tone="high" role="alert">
                {deleteError} O dossiê continua na lista.
              </Note>
            ) : null}
          </>
        ) : null}
      </Modal>
    </Page>
  );
};
