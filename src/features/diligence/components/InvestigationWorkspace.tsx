import React, { useMemo, useRef, useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import { LogoutConfirmationDialog } from '../../../components/layout/LogoutConfirmationDialog';
import { useAuth } from '../../auth/context/AuthContext';
import { CNPJ } from '../../../lib/cnpj';
import type { DiligenceItem, DiligenceStepConfig } from '../types';
import { DiligenceDashboard } from './DiligenceDashboard';

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
}

function userInitials(name?: string) {
  const parts = String(name || 'Usuário').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatSearchInput(value: string) {
  return CNPJ.mask(value);
}

const SearchLanding: React.FC<{
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}> = ({ value, error, onChange, onSubmit }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = value.trim().length > 0;

  return (
    <main className="investigation-landing">
      <div className="investigation-landing-watermark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <section className="investigation-search-stage" aria-label="Consulta de CNPJ">
        <form
          className={`investigation-search-form ${error ? 'has-error' : ''} ${ready ? 'is-ready' : ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {/* Anel condutor: gira sempre, acelera quando há CNPJ digitado. */}
          <span className="investigation-search-halo" aria-hidden="true" />

          <label className="investigation-sr-only" htmlFor="investigation-cnpj">
            CNPJ da empresa
          </label>
          <input
            ref={inputRef}
            id="investigation-cnpj"
            name="cnpj"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Digite ou cole o CNPJ"
            value={value}
            onChange={(event) => onChange(formatSearchInput(event.target.value))}
            aria-describedby={error ? 'investigation-search-error' : undefined}
            aria-invalid={Boolean(error)}
            autoFocus
          />
          <button type="submit" disabled={!ready} aria-label="Iniciar diligência">
            <Icons.ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>

        {error ? (
          <div className="investigation-search-error" id="investigation-search-error" role="alert">
            <Icons.AlertCircle size={15} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
      </section>
    </main>
  );
};

const DiligencePulse: React.FC<{
  query: string;
  steps: DiligenceStepConfig[];
}> = ({ query, steps }) => {
  const completed = steps.filter((step) => step.status === 'done').length;
  const unavailable = steps.filter((step) => step.status === 'error').length;
  const active = steps.find((step) => step.status === 'loading')
    || steps.find((step) => step.status === 'pending');
  const progress = steps.length > 0 ? Math.round(((completed + unavailable) / steps.length) * 100) : 0;

  return (
    <main className="investigation-loading-stage" aria-labelledby="investigation-loading-title">
      <div className="investigation-pulse" aria-hidden="true">
        <span className="investigation-pulse-ring ring-one" />
        <span className="investigation-pulse-ring ring-two" />
        <span className="investigation-pulse-ring ring-three" />
        <span className="investigation-pulse-ring ring-four" />
        <span className="investigation-pulse-drop">
          <span className="investigation-pulse-drop-core">
            <Icons.Building size={25} />
          </span>
        </span>
      </div>

      <div className="investigation-loading-copy" aria-live="polite">
        <span className="investigation-eyebrow">Pulso de evidências</span>
        <h1 id="investigation-loading-title">Construindo o mapa de vínculos</h1>
        <p className="investigation-loading-target">{query || 'Empresa informada'}</p>
        <strong>{active?.label || 'Organizando os resultados encontrados…'}</strong>
        <span>{completed} de {steps.length} verificações concluídas</span>
      </div>

      <div
        className="investigation-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label={`${progress}% da diligência concluída`}
      >
        <span style={{ width: `${Math.max(6, progress)}%` }} />
      </div>

      <details className="investigation-loading-details">
        <summary>
          <span>Ver andamento das fontes</span>
          {unavailable > 0 ? <small>{unavailable} fonte(s) com cobertura parcial</small> : null}
          <Icons.ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="investigation-loading-list">
          {steps.map((step) => (
            <div className={`investigation-loading-row is-${step.status}`} key={step.id}>
              <span className="investigation-loading-row-icon" aria-hidden="true">
                {step.status === 'done' ? <Icons.Check size={12} /> : null}
                {step.status === 'error' ? <Icons.Info size={12} /> : null}
                {step.status === 'loading' ? <span className="investigation-tiny-spinner" /> : null}
                {step.status === 'pending' ? <span className="investigation-tiny-dot" /> : null}
              </span>
              <span>{step.label}</span>
              {step.detail ? <small>{step.detail}</small> : null}
            </div>
          ))}
        </div>
      </details>
    </main>
  );
};

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
}) => {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const phase = diligence ? 'map' : isLoading ? 'loading' : 'search';
  const visibleQuery = useMemo(() => query || diligence?.cnpjFmt || '', [diligence?.cnpjFmt, query]);

  const submitSearch = () => {
    if (!query.trim() || isLoading) return;
    onSearch(query);
  };

  const startAnotherSearch = () => {
    setQuery('');
    onNewSearch();
  };

  return (
    <section className={`investigation-experience is-${phase}`}>
      <header className="investigation-global-bar">
        <button
          type="button"
          className="investigation-brand"
          onClick={startAnotherSearch}
          aria-label="Ir para uma nova diligência"
        >
          <img src="/assets/IconeSUAPEAZUL-semfundo.png" alt="" width={30} height={30} />
          <span>
            <strong translate="no">Diligência 360</strong>
            <small>Compliance SUAPE</small>
          </span>
        </button>

        <nav className="investigation-global-actions" aria-label="Ações principais">
          {phase === 'map' ? (
            <button type="button" onClick={startAnotherSearch} className="investigation-new-search">
              <Icons.Search size={15} aria-hidden="true" />
              <span>Nova consulta</span>
            </button>
          ) : null}
          <button type="button" onClick={onOpenHistory} title="Abrir histórico">
            <Icons.History size={16} aria-hidden="true" />
            <span>Histórico</span>
            {historyCount > 0 ? <small>{historyCount}</small> : null}
          </button>
          <button type="button" onClick={onOpenSources} title="Ver fontes públicas consultadas">
            <Icons.Database size={16} aria-hidden="true" />
            <span>Fontes</span>
          </button>
          <button
            ref={logoutButtonRef}
            type="button"
            className="investigation-user-button"
            onClick={() => setLogoutOpen(true)}
            aria-label={`Sair da conta de ${user?.name || 'usuário'}`}
            title="Encerrar sessão"
          >
            {userInitials(user?.name)}
          </button>
        </nav>
      </header>

      <div className="investigation-phase-stage">
        {phase === 'search' ? (
          <SearchLanding
            value={query}
            error={error}
            onChange={setQuery}
            onSubmit={submitSearch}
          />
        ) : null}

        {phase === 'loading' ? <DiligencePulse query={visibleQuery} steps={steps} /> : null}

        {phase === 'map' && diligence ? (
          <DiligenceDashboard diligence={diligence} onBack={startAnotherSearch} />
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
