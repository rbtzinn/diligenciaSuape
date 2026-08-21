// ==========================================================
// DILIGÊNCIA 360 — AppShell (Layout Principal)
// ==========================================================

import React, { useState } from 'react';
import { ViewType } from '../../types';
import { Sidebar } from './Sidebar';
import { DisclaimerBar } from './DisclaimerBar';
import { Icons } from '../ui/Icons';
import { Button } from '../ui/Button';

interface AppShellProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  historyCount: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  onNavigate,
  historyCount,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        historyCount={historyCount}
        isMobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
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
