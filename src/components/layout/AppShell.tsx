// ==========================================================
// DILIGÊNCIA 360 — AppShell (Layout Principal com Suporte a Dark Mode)
// ==========================================================

import React, { useState } from 'react';
import { ViewType } from '../../types';
import { Sidebar } from './Sidebar';
import { DisclaimerBar } from './DisclaimerBar';
import { DiligenceItem } from '../../features/diligence/types';
import { WorkspaceHeader } from './WorkspaceHeader';
import { HelpCenter } from '../help/HelpCenter';

interface AppShellProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  historyCount: number;
  onSelectRecent?: (item: DiligenceItem) => void;
  isDarkMode?: boolean;
  immersive?: boolean;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  onNavigate,
  historyCount,
  onSelectRecent,
  isDarkMode = false,
  immersive = false,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  if (immersive) {
    return (
      <div className="app-shell app-shell-immersive">
        <div className="app-main">
          <main className="app-content">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${isDarkMode ? 'app-dark-mode' : ''}`}>
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        historyCount={historyCount}
        isMobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        onSelectRecent={onSelectRecent}
        isDarkMode={isDarkMode}
      />

      <div className="app-main">
        <WorkspaceHeader
          currentView={currentView}
          onOpenMenu={() => setMobileMenuOpen(true)}
        />
        <DisclaimerBar />

        <main className="app-content">{children}</main>
      </div>

      <HelpCenter />
    </div>
  );
};
