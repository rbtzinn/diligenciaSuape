// ==========================================================
// DILIGÊNCIA 360 — Sidebar Institucional SUAPE (Fiel às Imagens 0, 1 e 2)
// Suporte a Modo Claro e Modo Escuro Investigativo Integrado
// ==========================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ViewType } from '../../types';
import { useAuth } from '../../features/auth/context/AuthContext';
import { HistoryStorage } from '../../features/history/services/history.storage';
import { DiligenceItem } from '../../features/diligence/types';
import { Icons } from '../ui/Icons';
import { LogoutConfirmationDialog } from './LogoutConfirmationDialog';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  historyCount: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSelectRecent?: (item: DiligenceItem) => void;
  isDarkMode?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  historyCount,
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
  onSelectRecent,
  isDarkMode = false,
}) => {
  const { user, logout } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);
  const [recentItems, setRecentItems] = useState<DiligenceItem[]>([]);
  const [openingRecentId, setOpeningRecentId] = useState<string | null>(null);

  useEffect(() => {
    HistoryStorage.getAll().then((items) => {
      setRecentItems(items.slice(0, 3));
    });
  }, [historyCount, currentView]);

  const handleNav = (view: ViewType) => {
    onNavigate(view);
    if (onCloseMobile) onCloseMobile();
  };

  const getInitials = (name?: string) => {
    if (!name) return 'US';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleLogoToggle = () => {
    if (isMobileOpen && onCloseMobile) {
      onCloseMobile();
      return;
    }
    onToggleCollapse?.();
  };

  const handleCloseLogoutModal = useCallback(() => {
    setIsLogoutModalOpen(false);
  }, []);

  const handleOpenRecent = async (item: DiligenceItem) => {
    if (!onSelectRecent) {
      handleNav('history');
      return;
    }

    setOpeningRecentId(item.id);
    try {
      const fullDiligence = await HistoryStorage.getById(item.id);
      onSelectRecent(fullDiligence || item);
    } finally {
      setOpeningRecentId(null);
    }
  };

  return (
    <>
      {isMobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop active"
          onClick={onCloseMobile}
          aria-label="Fechar menu lateral"
        />
      ) : null}
      <nav
        id="app-sidebar-navigation"
        className={`sidebar ${isDarkMode ? 'dark-mode' : ''} ${isMobileOpen ? 'mobile-open' : ''} ${isCollapsed ? 'collapsed' : ''}`}
        aria-label="Navegação principal"
      >
        {/* O ícone institucional é o único controle de recolher/expandir. */}
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-logo"
            onClick={handleLogoToggle}
            aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-expanded={!isCollapsed}
            aria-controls="app-sidebar-navigation"
            title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <img
              src="/assets/IconeSUAPEAZUL-semfundo.png"
              alt=""
              width={28}
              height={28}
              draggable={false}
            />
          </button>
          <div className="sidebar-brand-info" style={{ flex: 1, minWidth: 0 }}>
            <span className="sidebar-brand-name" translate="no">Diligência 360</span>
            <div className="sidebar-brand-sub">Compliance SUAPE</div>
          </div>
        </div>

        {/* Botão + Nova Diligência */}
        <div className="sidebar-top-action">
          <button
            type="button"
            className="sidebar-new-btn"
            onClick={() => handleNav('chat')}
            title="Nova Diligência"
            aria-label="Nova Diligência"
          >
            <div className="sidebar-new-icon-box">
              <Icons.Plus size={14} aria-hidden="true" />
            </div>
            <span className="sidebar-new-text">Nova Diligência</span>
          </button>
        </div>

        {/* Corpo da Navegação */}
        <div className="sidebar-nav">
          <>
              {/* Diligências Recentes (Fiel à Imagem 1) */}
              {recentItems.length > 0 && (
                <>
                  <span className="sidebar-label">Diligências Recentes</span>
                  {recentItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="sidebar-recent-item"
                      onClick={() => void handleOpenRecent(item)}
                      disabled={openingRecentId === item.id}
                      aria-busy={openingRecentId === item.id}
                      title={item.razaoSocial}
                      aria-label={`Abrir diligência ${item.razaoSocial}`}
                    >
                      <Icons.FileText size={14} className="sidebar-recent-icon" aria-hidden="true" />
                      <span className="sidebar-recent-name">{item.razaoSocial}</span>
                    </button>
                  ))}
                </>
              )}

              <span className="sidebar-label" style={{ marginTop: '0.5rem' }}>
                Navegação
              </span>

              <button
                type="button"
                className={`sidebar-nav-item ${currentView === 'history' ? 'active' : ''}`}
                onClick={() => handleNav('history')}
                aria-current={currentView === 'history' ? 'page' : undefined}
                aria-label="Histórico Geral"
              >
                <Icons.History size={15} aria-hidden="true" />
                <span style={{ flex: 1 }}>Histórico Geral</span>
                {historyCount > 0 && <span className="sidebar-badge">{historyCount}</span>}
              </button>

              <button
                type="button"
                className={`sidebar-nav-item ${currentView === 'sources' ? 'active' : ''}`}
                onClick={() => handleNav('sources')}
                aria-current={currentView === 'sources' ? 'page' : undefined}
                aria-label="Fontes Oficiais"
              >
                <Icons.Database size={15} aria-hidden="true" />
                <span>Fontes Oficiais</span>
              </button>
          </>
        </div>

        {/* Rodapé com Perfil do Usuário e Marca SUAPE */}
        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user-pill">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <div className="sidebar-user-avatar">{getInitials(user.name)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="sidebar-user-name">
                    {user.name || 'Usuário'}
                  </span>
                  <span className="sidebar-user-role">
                    Acesso completo
                  </span>
                </div>
              </div>

              <button
                ref={logoutTriggerRef}
                type="button"
                className="sidebar-logout-btn"
                onClick={() => setIsLogoutModalOpen(true)}
                title="Encerrar Sessão"
                aria-label="Abrir confirmação para encerrar sessão"
              >
                <Icons.X size={14} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="sidebar-brand-logos">
            <img
              src={isDarkMode
                ? '/assets/Marca_Compliance_Suape_Compliance_Suape - H03.png'
                : '/assets/Marca_Compliance_Suape_Compliance_Suape - H.png'}
              alt="Compliance SUAPE"
              className="sidebar-compliance-logo"
              width={842}
              height={596}
              loading="lazy"
              draggable={false}
            />
          </div>
        </div>
      </nav>

      {isLogoutModalOpen ? (
        <LogoutConfirmationDialog
          onCancel={handleCloseLogoutModal}
          onConfirm={logout}
          returnFocusRef={logoutTriggerRef}
        />
      ) : null}
    </>
  );
};
