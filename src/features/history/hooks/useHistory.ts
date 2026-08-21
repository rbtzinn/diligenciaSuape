// ==========================================================
// DILIGÊNCIA 360 — Hook useHistory com Filas e Filtros de Workflow
// ==========================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { HistoryStorage } from '../services/history.storage';
import { DiligenceItem } from '../../diligence/types';
import { useAuth } from '../../auth/context/AuthContext';

export type HistoryTab = 'all' | 'mine' | 'review';

export function useHistory() {
  const { user } = useAuth();
  const [items, setItems] = useState<DiligenceItem[]>([]);
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

  const deleteDiligence = useCallback(
    async (id: string) => {
      await HistoryStorage.delete(id);
      await refresh();
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
    deleteDiligence,
  };
}
