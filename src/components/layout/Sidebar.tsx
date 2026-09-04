// ==========================================================
// DILIGÊNCIA 360 — Menu lateral
// ==========================================================
// Três arquivos de CSS (navigation, user-and-recents, logout-dialog)
// somavam 940 linhas para desenhar este menu, e ainda assim o estado
// recolhido e o estado de gaveta no celular se sobrepunham: em
// 800px de largura o menu ficava recolhido e aberto ao mesmo tempo,
// com os rótulos cortados no meio.
//
// Aqui os dois estados são explícitos e não se misturam. Recolher só
// existe a partir de `lg`, onde há espaço para o menu fixo; abaixo
// disso o menu é uma gaveta, sempre com os rótulos por extenso.
//
// O `isDarkMode` saiu: nada no app o ligava, e ele carregava um
// segundo conjunto de logos que nunca era exibido.
// ==========================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ViewType } from '../../types';
import { useAuth } from '../../features/auth/context/AuthContext';
import { HistoryStorage } from '../../features/history/services/history.storage';
import { DiligenceItem } from '../../features/diligence/types';
import { Icons } from '../ui/Icons';
import { LogoutConfirmationDialog } from './LogoutConfirmationDialog';
import { cn } from '../../lib/cn';

interface SidebarProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  historyCount: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSelectRecent?: (item: DiligenceItem) => void;
}

function initials(name?: string) {
  const parts = String(name || 'Usuário').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
}) => {
  const { user, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);
  const [recents, setRecents] = useState<DiligenceItem[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    HistoryStorage.getAll().then((items) => setRecents(items.slice(0, 3)));
  }, [historyCount, currentView]);

  const go = (view: ViewType) => {
    onNavigate(view);
    onCloseMobile?.();
  };

  const closeLogout = useCallback(() => setLogoutOpen(false), []);

  const openRecent = async (item: DiligenceItem) => {
    if (!onSelectRecent) {
      go('history');
      return;
    }
    setOpeningId(item.id);
    try {
      const full = await HistoryStorage.getById(item.id);
      onSelectRecent(full || item);
      onCloseMobile?.();
    } finally {
      setOpeningId(null);
    }
  };

  // Recolhido é um estado de tela larga. No celular o menu é gaveta e
  // os rótulos aparecem sempre — daí `lg:` em tudo que some.
  const tight = isCollapsed;

  return (
    <>
      {isMobileOpen ? (
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Fechar menu lateral"
          className="z-backdrop fixed inset-0 bg-[rgb(10_31_53/0.5)] backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <nav
        id="app-sidebar-navigation"
        aria-label="Navegação principal"
        className={cn(
          'z-sidebar fixed inset-y-0 left-0 flex w-[var(--sidebar-w)] min-h-0 shrink-0 flex-col',
          'border-r border-line bg-surface transition-transform duration-200',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
          // A partir de lg o menu deixa de ser gaveta e passa a ocupar
          // a coluna, colapsável.
          'lg:static lg:translate-x-0 lg:transition-[width]',
          tight && 'lg:w-[var(--sidebar-w-collapsed)]',
        )}
      >
        {/* ---- Marca e recolher ---- */}
        <div className="flex min-w-0 items-center gap-2.5 border-b border-line-soft px-3 py-3">
          <button
            type="button"
            onClick={() => (isMobileOpen ? onCloseMobile?.() : onToggleCollapse?.())}
            aria-label={tight ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-expanded={!tight}
            aria-controls="app-sidebar-navigation"
            title={tight ? 'Expandir menu' : 'Recolher menu'}
            className="grid size-10 shrink-0 place-items-center rounded-md transition-colors hover:bg-surface-hover"
          >
            <img src="/assets/IconeSUAPEAZUL-semfundo.png" alt="" width={26} height={26} draggable={false} />
          </button>

          <span className={cn('min-w-0 flex-1', tight && 'lg:hidden')}>
            <span className="block truncate text-base font-extrabold leading-tight text-ink" translate="no">
              Diligência 360
            </span>
            <span className="block truncate text-2xs text-ink-3">Compliance SUAPE</span>
          </span>
        </div>

        {/* ---- Nova diligência ---- */}
        <div className="p-3">
          <button
            type="button"
            onClick={() => go('chat')}
            title="Nova Diligência"
            className={cn(
              'flex w-full min-w-0 items-center gap-2.5 rounded-md border border-transparent bg-brand px-3 text-white transition-colors hover:bg-brand-hover',
              'min-h-[var(--control-height-md)]',
              tight && 'lg:justify-center lg:px-0',
            )}
          >
            <Icons.Plus size={16} aria-hidden="true" />
            <span className={cn('truncate text-base font-semibold', tight && 'lg:hidden')}>Nova Diligência</span>
          </button>
        </div>

        {/* ---- Corpo ---- */}
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {recents.length > 0 ? (
            <>
              <SidebarLabel hidden={tight}>Diligências recentes</SidebarLabel>
              {recents.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openRecent(item)}
                  disabled={openingId === item.id}
                  aria-busy={openingId === item.id}
                  title={item.razaoSocial}
                  aria-label={`Abrir diligência ${item.razaoSocial}`}
                  className={cn(
                    'flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink-2 transition-colors',
                    'hover:bg-surface-hover hover:text-ink disabled:opacity-60',
                    tight && 'lg:justify-center lg:px-0',
                  )}
                >
                  <Icons.FileText size={14} aria-hidden="true" className="shrink-0 text-ink-muted" />
                  <span className={cn('truncate', tight && 'lg:hidden')}>{item.razaoSocial}</span>
                </button>
              ))}
            </>
          ) : null}

          <SidebarLabel hidden={tight} className="mt-2">
            Navegação
          </SidebarLabel>

          <SidebarItem
            icon={<Icons.History size={16} aria-hidden="true" />}
            label="Histórico geral"
            badge={historyCount > 0 ? historyCount : undefined}
            active={currentView === 'history'}
            tight={tight}
            onClick={() => go('history')}
          />
          <SidebarItem
            icon={<Icons.Database size={16} aria-hidden="true" />}
            label="Fontes oficiais"
            active={currentView === 'sources'}
            tight={tight}
            onClick={() => go('sources')}
          />
        </div>

        {/* ---- Rodapé ---- */}
        <div className="border-t border-line-soft p-3">
          {user ? (
            <div
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md border border-line-soft bg-surface-subtle p-2',
                tight && 'lg:justify-center lg:border-transparent lg:bg-transparent lg:p-0',
              )}
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-2xs font-bold text-white"
              >
                {initials(user.name)}
              </span>

              <span className={cn('min-w-0 flex-1', tight && 'lg:hidden')}>
                <span className="block truncate text-xs font-semibold text-ink">{user.name || 'Usuário'}</span>
                <span className="block truncate text-2xs text-ink-3">Acesso completo</span>
              </span>

              <button
                ref={logoutTriggerRef}
                type="button"
                onClick={() => setLogoutOpen(true)}
                title="Encerrar sessão"
                aria-label="Abrir confirmação para encerrar sessão"
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-high-bg hover:text-high-text',
                  tight && 'lg:hidden',
                )}
              >
                <Icons.LogOut size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <img
            src="/assets/Marca_Compliance_Suape_Compliance_Suape - H.png"
            alt="Compliance SUAPE"
            width={842}
            height={596}
            loading="lazy"
            draggable={false}
            className={cn('mx-auto mt-3 h-auto w-[140px] opacity-70', tight && 'lg:hidden')}
          />
        </div>
      </nav>

      {logoutOpen ? (
        <LogoutConfirmationDialog onCancel={closeLogout} onConfirm={logout} returnFocusRef={logoutTriggerRef} />
      ) : null}
    </>
  );
};

const SidebarLabel: React.FC<{ hidden?: boolean; className?: string; children: React.ReactNode }> = ({
  hidden,
  className,
  children,
}) => (
  <span
    className={cn(
      'px-2.5 pb-1 pt-2 text-2xs font-bold uppercase tracking-wider text-ink-muted',
      hidden && 'lg:hidden',
      className,
    )}
  >
    {children}
  </span>
);

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
  tight: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, badge, active, tight, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    title={label}
    className={cn(
      'flex min-w-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-base transition-colors',
      active ? 'bg-brand-soft font-semibold text-brand' : 'font-medium text-ink-2 hover:bg-surface-hover hover:text-ink',
      tight && 'lg:justify-center lg:px-0',
    )}
  >
    <span className="grid shrink-0 place-items-center">{icon}</span>
    <span className={cn('min-w-0 flex-1 truncate', tight && 'lg:hidden')}>{label}</span>
    {badge !== undefined ? (
      <span
        className={cn(
          'num shrink-0 rounded-chip bg-surface-active px-1.5 text-2xs font-bold text-ink-2',
          tight && 'lg:hidden',
        )}
      >
        {badge}
      </span>
    ) : null}
  </button>
);
