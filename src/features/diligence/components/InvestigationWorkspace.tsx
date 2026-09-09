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
import { CNPJ } from '../../../lib/cnpj';
import { cn } from '../../../lib/cn';
import { Button } from '../../../components/ui/Button';
import { TextField } from '../../../components/ui/Field';
import { Note } from '../../../components/ui/Note';
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
// Fase 1 — Busca
// ==========================================================

/** O que a diligência apura, na ordem em que o dossiê apresenta. */
const LANDING_STEPS = [
  'Ficha cadastral completa e situação na Receita Federal',
  'Sócios, administradores e as empresas ligadas a eles',
  'Sanções em CEIS e CNEP, processos e controle externo',
  'Publicações e menções em fontes abertas e diários oficiais',
  'Mapa de vínculos navegável por ramos',
  'Índice de atenção com o que sustenta cada ponto',
] as const;

const SearchLanding: React.FC<{
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}> = ({ value, error, onChange, onSubmit }) => {
  const launchTimer = useRef<number | null>(null);
  const [launching, setLaunching] = useState(false);
  const ready = value.trim().length > 0;

  useEffect(
    () => () => {
      if (launchTimer.current !== null) window.clearTimeout(launchTimer.current);
    },
    [],
  );

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || launching) return;

    // O retorno de validação continua imediato. A transição só
    // acontece quando o CNPJ já pode iniciar a diligência.
    if (!CNPJ.validate(value) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onSubmit();
      return;
    }

    setLaunching(true);
    launchTimer.current = window.setTimeout(() => {
      launchTimer.current = null;
      onSubmit();
    }, 700);
  };

  return (
    /* Abertura da ficha. Alinhada à esquerda e sem ilustração: o que
       a tela precisa dizer é o que a diligência apura e em que fontes,
       e uma marca d'água centralizada empurrava isso para baixo da
       dobra no celular. */
    <main className="min-h-0 flex-1 overflow-y-auto px-gutter py-8 sm:py-12">
      <div
        className={cn(
          'mx-auto flex w-full max-w-sheet flex-col transition-all duration-500',
          launching ? 'scale-[0.99] opacity-0' : 'animate-rise',
        )}
      >
        <div className="border-b border-line pb-1.5">
          <span className="ficha-label text-ink-3">
            <span className="text-ink-muted">(00)</span> Abertura de dossiê
          </span>
        </div>

        <h1 className="mt-5 text-2xl font-extrabold leading-[1.15] tracking-tight text-ink sm:text-3xl">
          Diligência de integridade de uma empresa e do seu quadro societário.
        </h1>

        <p className="mt-3 max-w-[52ch] text-md leading-relaxed text-ink-2">
          Informe o CNPJ. O sistema consulta o cadastro oficial da Receita Federal, mapeia o quadro societário,
          rastreia sanções, processos e publicações de cada integrante, encontra as empresas ligadas e monta o mapa
          de vínculos com um índice de atenção para contratar.
        </p>

        <form onSubmit={submit} className="mt-6 flex w-full flex-col gap-3" aria-busy={launching}>
          <TextField
            id="investigation-cnpj"
            name="cnpj"
            label="Buscar por CNPJ"
            controlSize="lg"
            mono
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="00.000.000/0000-00"
            value={value}
            onChange={(event) => onChange(CNPJ.mask(event.target.value))}
            readOnly={launching}
            autoFocus
            leading={<Icons.Search size={17} />}
          />

          <Button type="submit" variant="primary" size="lg" block disabled={!ready || launching}>
            {launching ? 'Preparando sua diligência…' : 'Iniciar diligência'}
          </Button>
        </form>

        {error ? (
          <Note
            tone="high"
            role="alert"
            className="mt-3 w-full"
            icon={<Icons.AlertCircle size={16} aria-hidden="true" />}
          >
            {error}
          </Note>
        ) : null}

        <ul className="mt-8 border-t border-line">
          {LANDING_STEPS.map((step) => (
            <li
              key={step}
              className="flex min-w-0 items-baseline gap-2 border-b border-line-soft py-2.5 text-sm text-ink-2"
            >
              <span aria-hidden="true" className="ficha-label shrink-0 text-ink-muted">&gt;</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ul>

        <p className="ficha-label mt-6 text-center leading-relaxed text-ink-muted">
          Dados cadastrais da Receita Federal + pesquisa em fontes abertas · confirme antes de decidir
        </p>
      </div>
    </main>
  );
};

// ==========================================================
// Fase 2 — Pulso das fontes
// ==========================================================

const STEP_TONE: Record<DiligenceStepConfig['status'], string> = {
  done: 'bg-ok-bg text-ok-text',
  error: 'bg-warn-bg text-warn-text',
  loading: 'bg-brand-soft text-brand',
  pending: 'bg-surface-subtle text-ink-muted',
};

const DiligencePulse: React.FC<{ query: string; steps: DiligenceStepConfig[] }> = ({ query, steps }) => {
  const done = steps.filter((step) => step.status === 'done').length;
  const unavailable = steps.filter((step) => step.status === 'error').length;
  const active = steps.find((step) => step.status === 'loading') || steps.find((step) => step.status === 'pending');
  const progress = steps.length > 0 ? Math.round(((done + unavailable) / steps.length) * 100) : 0;

  return (
    <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-gutter py-8">
      <div className="flex w-full max-w-[560px] flex-col items-center gap-5 text-center">
        <span aria-hidden="true" className="relative grid size-16 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-soft" />
          <span className="relative grid size-14 place-items-center rounded-full border border-brand-line bg-surface text-brand shadow-sm">
            <Icons.Building size={24} />
          </span>
        </span>

        <div className="flex flex-col gap-1">
          <span className="text-2xs font-bold uppercase tracking-wider text-ink-3">Pulso de evidências</span>
          <h1 className="text-xl font-extrabold leading-tight text-ink">Construindo o mapa de vínculos</h1>
          <p className="font-mono text-sm text-ink-2">{query || 'Empresa informada'}</p>
        </div>

        <div className="w-full">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label={`${progress}% da diligência concluída`}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-active"
          >
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>

          <p className="mt-2 text-sm font-semibold text-ink" aria-live="polite">
            {active?.label || 'Organizando os resultados encontrados…'}
          </p>
          <p className="num text-xs text-ink-3">
            {done} de {steps.length} verificações concluídas
          </p>
        </div>

        <details className="w-full overflow-hidden rounded-card border border-line bg-surface text-left shadow-xs">
          <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-hover">
            <span className="min-w-0 flex-1 truncate">Ver andamento das fontes</span>
            {unavailable > 0 ? (
              <span className="shrink-0 text-2xs font-semibold text-warn-text">
                {unavailable} com cobertura parcial
              </span>
            ) : null}
            <Icons.ChevronDown size={15} aria-hidden="true" className="shrink-0 text-ink-3" />
          </summary>

          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {steps.map((step) => (
              <li key={step.id} className="flex min-w-0 items-start gap-2.5 px-4 py-2.5">
                <span
                  aria-hidden="true"
                  className={cn('mt-px grid size-5 shrink-0 place-items-center rounded-full', STEP_TONE[step.status])}
                >
                  {step.status === 'done' ? <Icons.Check size={12} /> : null}
                  {step.status === 'error' ? <Icons.Info size={12} /> : null}
                  {step.status === 'loading' ? (
                    <span className="size-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : null}
                  {step.status === 'pending' ? <span className="size-1.5 rounded-full bg-current" /> : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{step.label}</span>
                  {step.detail ? <span className="block text-2xs text-ink-3">{step.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </main>
  );
};

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
      <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-gutter py-2">
        <button
          type="button"
          onClick={startAnotherSearch}
          aria-label="Ir para uma nova diligência"
          className="flex min-w-0 items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-surface-hover"
        >
          <img src="/assets/IconeSUAPEAZUL-semfundo.png" alt="" width={30} height={30} className="shrink-0" />
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-base font-extrabold leading-tight text-ink" translate="no">
              Diligência 360
            </span>
            <span className="block truncate text-2xs font-semibold uppercase tracking-wider text-ink-3">
              Compliance SUAPE
            </span>
          </span>
        </button>

        <nav aria-label="Ações principais" className="ml-auto flex min-w-0 shrink-0 items-center gap-1">
          {phase === 'map' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={startAnotherSearch}
              icon={<Icons.Search size={15} aria-hidden="true" />}
            >
              <span className="hidden sm:inline">Nova consulta</span>
              <span className="sr-only sm:hidden">Nova consulta</span>
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenHistory}
            title="Abrir histórico"
            icon={<Icons.History size={16} aria-hidden="true" />}
            rightIcon={
              historyCount > 0 ? (
                <span className="num rounded-chip bg-surface-active px-1.5 text-2xs font-bold text-ink-2">
                  {historyCount}
                </span>
              ) : undefined
            }
          >
            <span className="hidden md:inline">Histórico</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSources}
            title="Ver fontes públicas consultadas"
            icon={<Icons.Database size={16} aria-hidden="true" />}
          >
            <span className="hidden md:inline">Fontes</span>
          </Button>

          <button
            ref={logoutButtonRef}
            type="button"
            onClick={() => setLogoutOpen(true)}
            aria-label={`Sair da conta de ${user?.name || 'usuário'}`}
            title="Encerrar sessão"
            className="ml-1 grid size-9 shrink-0 place-items-center rounded-full bg-brand text-2xs font-bold text-white transition-colors hover:bg-brand-hover"
          >
            {userInitials(user?.name)}
          </button>
        </nav>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {phase === 'search' ? (
          <SearchLanding value={query} error={error} onChange={setQuery} onSubmit={submitSearch} />
        ) : null}

        {phase === 'loading' ? <DiligencePulse query={visibleQuery} steps={steps} /> : null}

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
