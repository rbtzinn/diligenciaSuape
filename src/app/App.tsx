// ==========================================================
// DILIGÊNCIA 360 — Componente App Principal com Autenticação
// ==========================================================

import React, { useState, useEffect } from 'react';
import { ViewType } from '../types';
import { DiligenceItem } from '../features/diligence/types';
import { useAuth } from '../features/auth/context/AuthContext';
import { LoginView } from '../features/auth/components/LoginView';
import { AppShell } from '../components/layout/AppShell';
import { ChatDiligenceView } from '../features/chat/components/ChatDiligenceView';
import { DiligenceDashboard, type DashboardTab } from '../features/diligence/components/DiligenceDashboard';
import { HistoryView } from '../features/history/components/HistoryView';
import { DataSourcesView } from '../features/sources/components/DataSourcesView';
import { useDiligence } from '../features/diligence/hooks/useDiligence';
import { HistoryStorage } from '../features/history/services/history.storage';

export const App: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('chat');
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTab>('overview');
  const [selectedDiligence, setSelectedDiligence] = useState<DiligenceItem | null>(null);
  const [historyCount, setHistoryCount] = useState<number>(0);

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

  const handleOpenDashboard = (diligence: DiligenceItem, defaultTab: DashboardTab = 'overview') => {
    setSelectedDiligence(diligence);
    setActiveDashboardTab(defaultTab);
    setCurrentView('dashboard');
  };

  const handleNewSearch = () => {
    resetDiligence();
    setSelectedDiligence(null);
    setActiveDashboardTab('overview');
    setCurrentView('chat');
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

  const isDarkMode = currentView === 'dashboard' && activeDashboardTab === 'network';

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        if (!selectedDiligence) {
          return (
            <ChatDiligenceView
              onSearch={runDiligence}
              isLoading={isLoading}
              error={error}
              steps={steps}
              currentDiligence={currentDiligence}
              onOpenDashboard={handleOpenDashboard}
            />
          );
        }
        return (
          <DiligenceDashboard
            diligence={selectedDiligence}
            onBack={handleNewSearch}
            activeTab={activeDashboardTab}
            onTabChange={setActiveDashboardTab}
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
          <ChatDiligenceView
            onSearch={runDiligence}
            isLoading={isLoading}
            error={error}
            steps={steps}
            currentDiligence={currentDiligence}
            onOpenDashboard={handleOpenDashboard}
          />
        );
    }
  };

  return (
    <AppShell
      currentView={currentView}
      onNavigate={(view) => {
        setCurrentView(view);
      }}
      historyCount={historyCount}
      onSelectRecent={(item) => handleOpenDashboard(item)}
      isDarkMode={isDarkMode}
    >
      {renderContent()}
    </AppShell>
  );
};
