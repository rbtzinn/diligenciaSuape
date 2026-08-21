// ==========================================================
// DILIGÊNCIA 360 — Sidebar de Navegação Estilo Claude.ai
// ==========================================================

import React, { useState, useEffect } from 'react';
import { ViewType } from '../../types';
import { useAuth } from '../../features/auth/context/AuthContext';
import { HistoryStorage } from '../../features/history/services/history.storage';
import { DiligenceItem } from '../../features/diligence/types';
import { Button } from '../ui/Button';
import { Icons } from '../ui/Icons';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  historyCount: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onSelectRecent?: (item: DiligenceItem) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  historyCount,
  isMobileOpen = false,
  onCloseMobile,
  onSelectRecent,
}) => {
  const { user, logout } = useAuth();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<DiligenceItem[]>([]);

  useEffect(() => {
    HistoryStorage.getAll().then((items) => {
      setRecentItems(items.slice(0, 5));
    });
  }, [historyCount, currentView]);

  const handleNav = (view: ViewType) => {
    onNavigate(view);
    if (onCloseMobile) onCloseMobile();
  };

  const getInitials = (name?: string) => {
    if (!name) return 'SU';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <>
      {isMobileOpen && (
        <div className="sidebar-backdrop active" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <nav className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/assets/IconeSUAPEAZUL-semfundo.png" alt="Ícone SUAPE" />
          </div>
          <div>
            <span className="sidebar-brand-name">Diligência 360</span>
            <div className="sidebar-brand-sub">Compliance SUAPE</div>
          </div>
        </div>

        <div className="sidebar-top-action">
          <button
            type="button"
            className="sidebar-new-btn"
            onClick={() => handleNav('chat')}
          >
            <Icons.Plus size={14} style={{ color: 'var(--brand-blue)' }} />
            <span>Nova Diligência</span>
          </button>
        </div>

        <div className="sidebar-nav">
          {recentItems.length > 0 && (
            <>
              <span className="sidebar-label">Diligências Recentes</span>
              {recentItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="sidebar-recent-item"
                  onClick={() => {
                    if (onSelectRecent) onSelectRecent(item);
                    else handleNav('history');
                  }}
                  title={item.razaoSocial}
                >
                  <span className="sidebar-recent-dot" />
                  <span className="sidebar-recent-name">{item.razaoSocial}</span>
                </button>
              ))}
            </>
          )}

          <span className="sidebar-label" style={{ marginTop: '0.5rem' }}>
            Navegação
          </span>

          <button
            className={`sidebar-nav-item ${currentView === 'history' ? 'active' : ''}`}
            onClick={() => handleNav('history')}
          >
            <Icons.History size={15} />
            <span style={{ flex: 1 }}>Histórico Geral</span>
            {historyCount > 0 && <span className="sidebar-badge">{historyCount}</span>}
          </button>

          {user?.role === 'admin' && (
            <button
              className={`sidebar-nav-item ${currentView === 'users' ? 'active' : ''}`}
              onClick={() => handleNav('users')}
            >
              <Icons.Users size={15} />
              <span>Gestão de Usuários</span>
            </button>
          )}

          <button
            className={`sidebar-nav-item ${currentView === 'sources' ? 'active' : ''}`}
            onClick={() => handleNav('sources')}
          >
            <Icons.Database size={15} />
            <span>Fontes Oficiais</span>
          </button>
        </div>

        {/* Rodapé com Perfil do Usuário e Logo */}
        <div className="sidebar-footer">
          {user && (
            <div className="sidebar-user-pill">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                <div className="sidebar-user-avatar">{getInitials(user.name)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name}
                  </span>
                  <span style={{ fontSize: '9px', color: 'var(--brand-blue)', fontWeight: 'var(--font-semibold)' }}>
                    {user.role === 'admin' ? 'Administrador' : user.role === 'analyst' ? 'Analista' : 'Revisor'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="sidebar-logout-btn"
                onClick={() => setIsLogoutModalOpen(true)}
                title="Encerrar Sessão"
              >
                <Icons.X size={13} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '0.2rem' }}>
            <img
              src="/assets/marca-compliance-v01.png"
              alt="Marca Compliance SUAPE"
              style={{ maxWidth: '110px', height: 'auto', opacity: 0.9 }}
            />
          </div>
        </div>
      </nav>

      {/* Modal de Confirmação de Logout */}
      {isLogoutModalOpen && (
        <div className="modal-backdrop animate-fade-in" style={{ zIndex: 1200 }}>
          <div className="modal-content animate-fade-in-up" style={{ maxWidth: '380px' }}>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
              Encerrar Sessão
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Deseja realmente sair do Diligência 360?
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <Button variant="ghost" size="sm" onClick={() => setIsLogoutModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  logout();
                }}
                style={{ backgroundColor: 'var(--color-critical-600)', borderColor: 'var(--color-critical-600)' }}
              >
                Sair do Sistema
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
