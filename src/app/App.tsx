// ==========================================================
// DILIGÊNCIA 360 — Componente App Principal com Autenticação
// ==========================================================

import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';
import { DiligenceItem } from '../features/diligence/types';
import { useAuth } from '../features/auth/context/AuthContext';
import { LoginView } from '../features/auth/components/LoginView';
import { AppShell } from '../components/layout/AppShell';
import { InvestigationWorkspace } from '../features/diligence/components/InvestigationWorkspace';
import { HistoryView } from '../features/history/components/HistoryView';
import { DataSourcesView } from '../features/sources/components/DataSourcesView';
import { useDiligence } from '../features/diligence/hooks/useDiligence';
import { HistoryStorage } from '../features/history/services/history.storage';

export const App: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('chat');
  const [selectedDiligence, setSelectedDiligence] = useState<DiligenceItem | null>(null);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [prefilledCnpj, setPrefilledCnpj] = useState<string>('');

  const updateHistoryBadge = async () => {
    const total = await HistoryStorage.count();
    setHistoryCount(total);
  };

  useEffect(() => {
    if (isAuthenticated) {
      updateHistoryBadge();
    }
  }, [currentView, isAuthenticated]);

  const {
    isLoading,
    error,
    steps,
    currentDiligence,
    runDiligence,
    resetDiligence,
  } = useDiligence((newDiligence) => {
    updateHistoryBadge();
    setSelectedDiligence(newDiligence);
  });

  const handleOpenDashboard = (diligence: DiligenceItem) => {
    setSelectedDiligence(diligence);
    setCurrentView('dashboard');
  };

  const handleNewSearch = () => {
    resetDiligence();
    setSelectedDiligence(null);
    setPrefilledCnpj('');
    setCurrentView('chat');
  };

  /**
   * Atalho do mapa e do quadro societário: abre a diligência de uma empresa
   * vinculada sem obrigar a redigitar o CNPJ. O campo fica preenchido e a
   * consulta já começa, para que o analista não perca o fio da investigação.
   */
  const handleDrillCompany = (cnpj: string) => {
    resetDiligence();
    setSelectedDiligence(null);
    setPrefilledCnpj(cnpj);
    setCurrentView('chat');
    runDiligence(cnpj);
  };

  if (isAuthLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-app)', color: 'var(--text-tertiary)' }}>
        Carregando Diligência 360…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <InvestigationWorkspace
            diligence={selectedDiligence}
            onSearch={runDiligence}
            isLoading={isLoading}
            error={error}
            steps={steps}
            historyCount={historyCount}
            onNewSearch={handleNewSearch}
            onOpenHistory={() => setCurrentView('history')}
            onOpenSources={() => setCurrentView('sources')}
            onDrillCompany={handleDrillCompany}
            prefilledCnpj={prefilledCnpj}
          />
        );

      case 'history':
        return (
          <HistoryView
            onOpenDiligence={handleOpenDashboard}
            onNewDiligence={handleNewSearch}
          />
        );

      case 'sources':
        return <DataSourcesView />;

      case 'chat':
      default:
        return (
          <InvestigationWorkspace
            diligence={currentDiligence}
            onSearch={runDiligence}
            isLoading={isLoading}
            error={error}
            steps={steps}
            historyCount={historyCount}
            onNewSearch={handleNewSearch}
            onOpenHistory={() => setCurrentView('history')}
            onOpenSources={() => setCurrentView('sources')}
            onDrillCompany={handleDrillCompany}
            prefilledCnpj={prefilledCnpj}
          />
        );
    }
  };

  return (
    <AppShell
      currentView={currentView}
      onNavigate={(view) => {
        if (view === 'chat') {
          handleNewSearch();
        } else {
          setCurrentView(view);
        }
      }}
      historyCount={historyCount}
      onSelectRecent={(item) => handleOpenDashboard(item)}
      immersive={currentView === 'chat' || currentView === 'dashboard'}
    >
      {renderContent()}
    </AppShell>
  );
};
