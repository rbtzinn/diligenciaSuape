// ==========================================================
// DILIGÊNCIA 360 — AppShell
// ==========================================================
// A casca tinha dois caminhos que não se pareciam: o normal, com
// menu lateral e cabeçalho, e o imersivo, que descartava os dois e
// dava à tela o controle do layout. O imersivo é legítimo — o mapa
// de vínculos e a busca precisam da tela inteira — mas ele herdava
// `.app-content` com respiro e largura máxima, e então cada tela
// imersiva desfazia isso por conta própria.
//
// Agora os dois caminhos partilham o mesmo contêiner de rolagem e a
// diferença é só o que aparece nele.
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
  /** A tela ocupa tudo e traz o próprio cabeçalho (busca e mapa). */
  immersive?: boolean;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentView,
  onNavigate,
  historyCount,
  onSelectRecent,
  immersive = false,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (immersive) {
    return <div className="flex h-dvh min-h-0 w-full min-w-0 flex-col bg-canvas">{children}</div>;
  }

  return (
    <div className="flex h-dvh min-h-0 w-full min-w-0 bg-canvas">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        historyCount={historyCount}
        isMobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        isCollapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        onSelectRecent={onSelectRecent}
      />

      {/* `min-w-0` é o que impede uma tabela larga de esticar a coluna
          principal e empurrar a página para o lado. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader currentView={currentView} onOpenMenu={() => setMobileMenuOpen(true)} />
        <DisclaimerBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <HelpCenter />
    </div>
  );
};
