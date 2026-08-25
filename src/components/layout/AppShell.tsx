// ==========================================================
// DILIGÊNCIA 360 — AppShell (Layout Principal com Suporte a Dark Mode)
// ==========================================================

import React, { useState } from 'react';
import { ViewType } from '../../types';
import { Sidebar } from './Sidebar';
import { DisclaimerBar } from './DisclaimerBar';
import { Icons } from '../ui/Icons';
import { Button } from '../ui/Button';
import { DiligenceItem } from '../../features/diligence/types';

interface AppShellProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  historyCount: number;
  onSelectRecent?: (item: DiligenceItem) => void;
  isDarkMode?: boolean;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  onNavigate,
  historyCount,
  onSelectRecent,
  isDarkMode = false,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
        {/* Header mobile */}
        <header className="mobile-header">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Abrir Menu"
          >
            <Icons.Search size={20} />
          </Button>
          <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>
            Diligência 360
          </span>
          <div style={{ width: 28 }} />
        </header>

        <DisclaimerBar />

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
};
