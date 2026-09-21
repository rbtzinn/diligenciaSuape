// ==========================================================
// DILIGÊNCIA 360 — Workspace de investigação
// ==========================================================
// Esta tela tinha um sistema de design paralelo. Dentro de
// `.investigation-experience` o CSS declarava as suas próprias
// cores (`--ix-navy`, `--ix-water`, `--ix-mist`…), a sua própria
// família tipográfica ('Segoe UI Variable', e 'Bahnschrift
// SemiCondensed' na marca — uma fonte que o projeto não carrega) e
// corpos de 8px. Eram 1785 linhas em seis arquivos, e nada ali
// conversava com os tokens do resto do app. Como é a primeira tela
// que o analista vê, a incoerência começava na porta de entrada.
//
// A barra superior também trocava de claro para escuro ao sair da
// busca. Como o mapa de vínculos passou a ser desenhado sobre tela
// clara, a barra escura ficou brigando com o conteúdo embaixo dela.
// Agora a moldura é clara nas três fases, e o que muda entre elas é
// só o conteúdo.
// ==========================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import { LogoutConfirmationDialog } from '../../../components/layout/LogoutConfirmationDialog';
import { useAuth } from '../../auth/context/AuthContext';
import type { DiligenceItem, DiligenceStepConfig } from '../types';
import { DiligenceDashboard } from './DiligenceDashboard';
import { ExperienceLanding } from './ExperienceLanding';
import { ExperiencePulse } from './ExperiencePulse';

interface InvestigationWorkspaceProps {
  diligence: DiligenceItem | null;
  isLoading: boolean;
  error: string | null;
  steps: DiligenceStepConfig[];
  historyCount: number;
  onSearch: (cnpj: string) => void;
  onNewSearch: () => void;
  onOpenHistory: () => void;
  onOpenSources: () => void;
  onDrillCompany?: (cnpj: string, name: string) => void;
  prefilledCnpj?: string;
}

function userInitials(name?: string) {
  const parts = String(name || 'Usuário').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// ==========================================================
// Moldura
// ==========================================================

export const InvestigationWorkspace: React.FC<InvestigationWorkspaceProps> = ({
  diligence,
  isLoading,
  error,
  steps,
  historyCount,
  onSearch,
  onNewSearch,
  onOpenHistory,
  onOpenSources,
  onDrillCompany,
  prefilledCnpj,
}) => {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState(prefilledCnpj || '');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const phase = diligence ? 'map' : isLoading ? 'loading' : 'search';
  const visibleQuery = useMemo(() => query || diligence?.cnpjFmt || '', [diligence?.cnpjFmt, query]);

  // O CNPJ vindo do mapa chega depois da montagem; o campo acompanha.
  useEffect(() => {
    if (prefilledCnpj) setQuery(prefilledCnpj);
  }, [prefilledCnpj]);

  const submitSearch = () => {
    if (!query.trim() || isLoading) return;
    onSearch(query);
  };

  const startAnotherSearch = () => {
    setQuery('');
    onNewSearch();
  };

  return (
    <section className="flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-canvas">
      <header className="harbor-header">
      <div className="harbor-header-inner">
        <button
          type="button"
          onClick={startAnotherSearch}
          aria-label="Ir para uma nova diligência"
          className="harbor-brand"
        >
          <span className="harbor-brand-mark"><img src="/assets/IconeSUAPEAZUL-semfundo.png" alt="" width={28} height={28} /></span>
          <span className="harbor-brand-name" translate="no">
            <strong>Diligência <b>360</b></strong>
            <small>COMPLIANCE SUAPE</small>
          </span>
        </button>

        <nav aria-label="Ações principais" className="harbor-nav">
          {phase === 'map' ? (
            <button type="button" className="harbor-nav-link" onClick={startAnotherSearch} aria-label="Nova consulta">
              <Icons.Search size={17} /><span>Nova consulta</span>
            </button>
          ) : null}

          <button type="button" className="harbor-nav-link" onClick={onOpenHistory} aria-label={`Histórico, ${historyCount} diligências`} title="Abrir histórico">
            <Icons.History size={17} /><span>Histórico</span>{historyCount > 0 ? <em>{historyCount}</em> : null}
          </button>

          <button type="button" className="harbor-nav-link" onClick={onOpenSources} aria-label="Fontes oficiais" title="Ver fontes públicas consultadas">
            <Icons.Database size={17} /><span>Fontes</span>
          </button>

          <button
            ref={logoutButtonRef}
            type="button"
            onClick={() => setLogoutOpen(true)}
            aria-label={`Sair da conta de ${user?.name || 'usuário'}`}
            title="Encerrar sessão"
            className="harbor-profile"
          >
            {userInitials(user?.name)}
          </button>
        </nav>
      </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {phase === 'search' ? (
          <ExperienceLanding value={query} error={error} onChange={setQuery} onSubmit={submitSearch} />
        ) : null}

        {phase === 'loading' ? <ExperiencePulse query={visibleQuery} steps={steps} /> : null}

        {phase === 'map' && diligence ? (
          <DiligenceDashboard key={diligence.id} diligence={diligence} onBack={startAnotherSearch} onDrillCompany={onDrillCompany} />
        ) : null}
      </div>

      {logoutOpen ? (
        <LogoutConfirmationDialog
          onCancel={() => setLogoutOpen(false)}
          onConfirm={logout}
          returnFocusRef={logoutButtonRef}
        />
      ) : null}
    </section>
  );
};
