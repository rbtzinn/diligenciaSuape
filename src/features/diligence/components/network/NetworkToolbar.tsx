// ==========================================================
// DILIGÊNCIA 360 — Barra de ferramentas do mapa
// ==========================================================
// A barra tinha duas versões inteiras — uma de desktop e uma de
// celular — com classes próprias em network-immersive/layout.css, e
// os botões de ícone não seguiam a escala de controle do projeto: em
// 28px de lado ficavam abaixo da área mínima de toque.
//
// Agora as duas versões partilham os mesmos botões e campos do resto
// do app, e a diferença entre elas é só quais controles aparecem. Os
// filtros ficam num painel recolhível, com a contagem de filtros
// ativos visível no gatilho — antes era possível ter três filtros
// ligados sem nenhum sinal disso na tela.
// ==========================================================

import React, { useId, useState } from 'react';
import { Icons } from '../../../../components/ui/Icons';
import { Select, type SelectOption } from '../../../../components/ui/Field';
import { Button } from '../../../../components/ui/Button';
import { Toolbar } from '../../../../components/ui/Toolbar';
import { cn } from '../../../../lib/cn';
import type { DepthFilter, LayoutMode } from './types';

const DEPTH_OPTIONS: readonly SelectOption<DepthFilter>[] = [
  { value: '1', label: 'Primeiro grau' },
  { value: '2', label: 'Até segundo grau' },
  { value: 'all', label: 'Toda a rede' },
];

interface NetworkToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  depth: DepthFilter;
  onDepthChange: (depth: DepthFilter) => void;
  relationFilter: string;
  onRelationFilterChange: (relation: string) => void;
  relationOptions: readonly SelectOption[];
  showDocuments: boolean;
  documentCount: number;
  onToggleDocuments: () => void;
  onFit: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  mobileControls?: {
    canGoBack: boolean;
    isFullNetwork: boolean;
    onBack: () => void;
    onToggleFullNetwork: () => void;
    onOpenSummary: () => void;
  };
}

export const NetworkToolbar: React.FC<NetworkToolbarProps> = ({
  searchTerm,
  onSearchChange,
  layoutMode,
  onLayoutModeChange,
  depth,
  onDepthChange,
  relationFilter,
  onRelationFilterChange,
  relationOptions,
  showDocuments,
  documentCount,
  onToggleDocuments,
  onFit,
  isFullscreen,
  onToggleFullscreen,
  mobileControls,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();

  // Contagem de desvios em relação ao estado padrão do mapa.
  const activeFilterCount =
    (depth !== '2' ? 1 : 0) +
    (relationFilter !== 'confirmed' ? 1 : 0) +
    (layoutMode !== 'chain' ? 1 : 0) +
    (showDocuments ? 1 : 0);

  if (mobileControls) {
    return (
      <Toolbar
        aria-label="Controles móveis do mapa"
        bleed
        className="shrink-0 border-b border-line-soft bg-surface py-2"
      >
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          onClick={mobileControls.onBack}
          disabled={!mobileControls.canGoBack || mobileControls.isFullNetwork}
          aria-label="Voltar um ramo"
          title="Voltar um ramo"
          icon={<Icons.ArrowLeft size={16} aria-hidden="true" />}
        />

        <Button
          variant={mobileControls.isFullNetwork ? 'primary' : 'secondary'}
          size="sm"
          onClick={mobileControls.onToggleFullNetwork}
          aria-pressed={mobileControls.isFullNetwork}
          icon={<Icons.Layers size={15} aria-hidden="true" />}
        >
          {mobileControls.isFullNetwork ? 'Explorar ramos' : 'Rede completa'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          iconOnly
          onClick={onFit}
          aria-label="Centralizar mapa"
          title="Centralizar mapa"
          icon={<Icons.Maximize size={15} aria-hidden="true" />}
        />

        <Button
          variant="secondary"
          size="sm"
          iconOnly
          onClick={mobileControls.onOpenSummary}
          aria-label="Abrir resumo da diligência"
          title="Abrir resumo"
          icon={<Icons.Info size={15} aria-hidden="true" />}
        />
      </Toolbar>
    );
  }

  return (
    <div className="shrink-0 border-b border-line-soft bg-surface">
      <div className="flex min-w-0 items-center gap-2 px-gutter py-2">
        {/* Campo de busca: cresce, mas nunca empurra os botões para
            fora da barra. */}
        <label className="relative flex min-w-0 flex-1 items-center">
          <Icons.Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 text-ink-3" />
          <input
            type="search"
            placeholder="Encontrar uma pessoa ou empresa no mapa"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Buscar pessoa ou empresa no mapa"
            className={cn(
              'min-h-[var(--control-height-sm)] w-full min-w-0 rounded-[var(--control-radius-sm)] border border-line bg-surface-subtle pl-9 pr-9 text-xs text-ink',
              'transition-colors hover:border-line-strong focus:border-brand focus:bg-surface focus:outline-none focus:shadow-[var(--ring-focus)]',
              '[&::-webkit-search-cancel-button]:hidden',
            )}
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpar busca"
              className="absolute right-2 grid size-6 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <Icons.X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <Button
          variant={filtersOpen || activeFilterCount > 0 ? 'outline' : 'secondary'}
          size="sm"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls={panelId}
          icon={<Icons.Filter size={15} aria-hidden="true" />}
          rightIcon={
            activeFilterCount > 0 ? (
              <span className="num rounded-chip bg-brand px-1.5 text-2xs font-bold text-white">
                {activeFilterCount}
              </span>
            ) : undefined
          }
        >
          <span className="hidden sm:inline">Filtros</span>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          iconOnly
          onClick={onFit}
          title="Centralizar mapa"
          aria-label="Centralizar mapa"
          icon={<Icons.Maximize size={15} aria-hidden="true" />}
        />

        <Button
          variant={isFullscreen ? 'primary' : 'secondary'}
          size="sm"
          iconOnly
          onClick={onToggleFullscreen}
          aria-pressed={isFullscreen}
          title={isFullscreen ? 'Sair da tela cheia' : 'Usar tela cheia'}
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Usar tela cheia'}
          icon={<Icons.Layers size={15} aria-hidden="true" />}
        />
      </div>

      {filtersOpen ? (
        <div
          id={panelId}
          role="group"
          aria-label="Filtros do mapa"
          className="grid gap-3 border-t border-line-soft bg-surface-subtle px-gutter py-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        >
          <div role="radiogroup" aria-label="Organização do mapa" className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-2">Organização</span>
            <div className="flex min-w-0 rounded-[var(--control-radius-sm)] border border-line bg-surface p-0.5">
              {(
                [
                  { mode: 'chain' as LayoutMode, label: 'Por graus', icon: <Icons.Network size={14} aria-hidden="true" /> },
                  { mode: 'radar' as LayoutMode, label: 'Radial', icon: <Icons.Compass size={14} aria-hidden="true" /> },
                ]
              ).map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={layoutMode === option.mode}
                  onClick={() => onLayoutModeChange(option.mode)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs transition-colors',
                    layoutMode === option.mode
                      ? 'bg-brand-soft font-bold text-brand'
                      : 'font-medium text-ink-2 hover:bg-surface-hover',
                  )}
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <Select
            label="Até onde mostrar"
            value={depth}
            options={DEPTH_OPTIONS}
            onChange={(value) => onDepthChange(value as DepthFilter)}
            controlSize="sm"
          />

          <Select
            label="Tipo de ligação"
            value={relationFilter}
            options={relationOptions}
            onChange={onRelationFilterChange}
            controlSize="sm"
          />

          <Button
            variant={showDocuments ? 'outline' : 'secondary'}
            size="sm"
            onClick={onToggleDocuments}
            aria-pressed={showDocuments}
            icon={<Icons.FileText size={14} aria-hidden="true" />}
            rightIcon={
              <span className="num rounded-chip bg-surface-active px-1.5 text-2xs font-bold text-ink-2">
                {documentCount}
              </span>
            }
          >
            {showDocuments ? 'Ocultar fontes' : 'Mostrar fontes'}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
