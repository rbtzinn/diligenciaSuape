// ==========================================================
// DILIGÊNCIA 360 — Hook useHistory com Filas e Filtros de Workflow
// ==========================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { removeInSeries } from '../services/bulkDelete';
import { HistoryStorage, DiligenceSummary } from '../services/history.storage';
import { useAuth } from '../../auth/context/AuthContext';

export type HistoryTab = 'all' | 'mine' | 'review';

export function useHistory() {
  const { user } = useAuth();
  // A listagem sempre foi de resumos: o backend nunca devolveu o dossiê
  // completo aqui. O tipo agora diz isso, em vez de prometer campos que
  // chegavam indefinidos.
  const [items, setItems] = useState<DiligenceSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<HistoryTab>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await HistoryStorage.getAll();
      setItems(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const queueCounts = useMemo(() => {
    const total = items.length;
    const mine = items.filter((it) => it.createdBy?.id === user?.id).length;
    const pendingReview = items.filter(
      (it) => it.status === 'pending_review' || it.status === 'in_review'
    ).length;
    return { total, mine, pendingReview };
  }, [items, user?.id]);

  const filteredItems = useMemo(() => {
    let list = items;

    // Filtro por aba de fila
    if (activeTab === 'mine' && user?.id) {
      list = list.filter((it) => it.createdBy?.id === user.id);
    } else if (activeTab === 'review') {
      list = list.filter(
        (it) => it.status === 'pending_review' || it.status === 'in_review'
      );
    }

    // Filtro por status
    if (statusFilter !== 'all') {
      list = list.filter((it) => it.status === statusFilter);
    }

    // Filtro de busca textual
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (item) =>
          (item.razaoSocial && item.razaoSocial.toLowerCase().includes(q)) ||
          (item.cnpj && item.cnpj.includes(q)) ||
          (item.cnpjFmt && item.cnpjFmt.includes(q))
      );
    }

    return list;
  }, [items, activeTab, statusFilter, searchQuery, user?.id]);

  /**
   * Remove um ou vários dossiês e devolve o que aconteceu com cada um.
   *
   * Em série, e não em paralelo: a API tem limite por origem, e disparar
   * vinte exclusões de uma vez transformaria uma remoção em lote numa
   * rajada recusada pela metade — com o analista sem saber quais saíram.
   *
   * Uma falha no meio não interrompe as demais: o que dá para remover é
   * removido, e o que falhou volta nomeado, para que a tela possa dizer
   * exatamente quais dossiês continuam na lista.
   *
   * A lista só é relida uma vez, no fim.
   */
  const deleteDiligences = useCallback(
    async (ids: string[]) => {
      const resultado = await removeInSeries(ids, (id) => HistoryStorage.delete(id));
      await refresh();
      return resultado;
    },
    [refresh]
  );

  return {
    items: filteredItems,
    totalCount: items.length,
    queueCounts,
    activeTab,
    setActiveTab,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    refresh,
    deleteDiligences,
  };
}
