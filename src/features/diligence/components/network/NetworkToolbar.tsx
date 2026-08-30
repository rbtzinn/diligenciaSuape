// ==========================================================
// DILIGÊNCIA 360 — Barra de Ferramentas da Rede Imersiva
// 100% alinhada aos estilos de styles/network-immersive/
// ==========================================================

import React, { useState } from 'react';
import { Icons } from '../../../../components/ui/Icons';
import { SelectField, type SelectOption } from '../../../../components/ui/SelectField';
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
  const activeFilterCount = (depth !== '2' ? 1 : 0)
    + (relationFilter !== 'confirmed' ? 1 : 0)
    + (layoutMode !== 'chain' ? 1 : 0)
    + (showDocuments ? 1 : 0);

  if (mobileControls) {
    return (
      <div className="network-toolbar network-toolbar-mobile" role="toolbar" aria-label="Controles móveis do mapa">
        <button
          type="button"
          className="mobile-network-tool"
          onClick={mobileControls.onBack}
          disabled={!mobileControls.canGoBack || mobileControls.isFullNetwork}
          aria-label="Voltar um ramo"
          title="Voltar um ramo"
        >
          <Icons.ArrowLeft size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`mobile-network-mode ${mobileControls.isFullNetwork ? 'active' : ''}`}
          onClick={mobileControls.onToggleFullNetwork}
          aria-pressed={mobileControls.isFullNetwork}
        >
          <Icons.Layers size={16} aria-hidden="true" />
          <span>{mobileControls.isFullNetwork ? 'Explorar ramos' : 'Rede completa'}</span>
        </button>
        <button
          type="button"
          className="mobile-network-tool"
          onClick={onFit}
          aria-label="Centralizar mapa"
          title="Centralizar mapa"
        >
          <Icons.Maximize size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mobile-network-tool"
          onClick={mobileControls.onOpenSummary}
          aria-label="Abrir resumo da diligência"
          title="Abrir resumo"
        >
          <Icons.Info size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="network-toolbar" role="toolbar" aria-label="Controles do mapa relacional">
      <div className="network-toolbar-main">
        <label className="network-search-control">
          <Icons.Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="Encontrar uma pessoa ou empresa no mapa"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Buscar pessoa ou empresa no mapa"
          />
          {searchTerm ? (
            <button
              type="button"
              className="network-search-clear"
              onClick={() => onSearchChange('')}
              aria-label="Limpar busca"
            >
              <Icons.X size={13} />
            </button>
          ) : null}
        </label>

        <button
          type="button"
          className={`network-filter-trigger ${filtersOpen || activeFilterCount > 0 ? 'active' : ''}`}
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="network-filter-panel"
        >
          <Icons.Filter size={15} aria-hidden="true" />
          <span>Filtros</span>
          {activeFilterCount > 0 ? <small>{activeFilterCount}</small> : null}
        </button>

        <div className="network-icon-actions">
          <button
            type="button"
            onClick={onFit}
            title="Centralizar mapa"
            aria-label="Centralizar mapa"
          >
            <Icons.Maximize size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={isFullscreen ? 'active' : ''}
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Sair da tela cheia' : 'Usar tela cheia'}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Usar tela cheia'}
          >
            <Icons.Layers size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="network-filter-panel" id="network-filter-panel">
          <div className="network-layout-switch" role="radiogroup" aria-label="Organização do mapa">
            <span>Organização</span>
            <button
              type="button"
              role="radio"
              aria-checked={layoutMode === 'chain'}
              className={layoutMode === 'chain' ? 'active' : ''}
              onClick={() => onLayoutModeChange('chain')}
            >
              <Icons.Network size={14} aria-hidden="true" />
              <span>Por graus</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={layoutMode === 'radar'}
              className={layoutMode === 'radar' ? 'active' : ''}
              onClick={() => onLayoutModeChange('radar')}
            >
              <Icons.Compass size={14} aria-hidden="true" />
              <span>Radial</span>
            </button>
          </div>

          <div className="network-select-control">
            <SelectField
              label="Até onde mostrar"
              value={depth}
              options={DEPTH_OPTIONS}
              onChange={(val) => onDepthChange(val as DepthFilter)}
            />
          </div>

          <div className="network-select-control">
            <SelectField
              label="Tipo de ligação"
              value={relationFilter}
              options={relationOptions}
              onChange={onRelationFilterChange}
            />
          </div>

          <button
            type="button"
            className={`network-tool-button ${showDocuments ? 'active' : ''}`}
            onClick={onToggleDocuments}
            aria-pressed={showDocuments}
          >
            <Icons.FileText size={14} aria-hidden="true" />
            <span>{showDocuments ? 'Ocultar fontes do mapa' : 'Mostrar fontes no mapa'}</span>
            <small>{documentCount}</small>
          </button>
        </div>
      ) : null}
    </div>
  );
};
