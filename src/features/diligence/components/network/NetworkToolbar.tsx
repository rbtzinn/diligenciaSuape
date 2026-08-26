// ==========================================================
// DILIGÊNCIA 360 — Barra de Ferramentas da Rede Imersiva
// 100% alinhada aos estilos de network-immersive.css
// ==========================================================

import React from 'react';
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
  onToggleDocuments: () => void;
  onFit: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
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
  onToggleDocuments,
  onFit,
  isFullscreen,
  onToggleFullscreen,
}) => {
  return (
    <div className="network-toolbar" role="toolbar" aria-label="Controles do mapa relacional">
      <label className="network-search-control">
        <Icons.Search size={15} aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar pessoa, empresa ou órgão"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Buscar na rede"
        />
        {searchTerm && (
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#93a9c0', cursor: 'pointer', padding: 0 }}
            onClick={() => onSearchChange('')}
            aria-label="Limpar busca"
          >
            <Icons.X size={13} />
          </button>
        )}
      </label>

      <div className="network-layout-switch" role="radiogroup" aria-label="Modo de disposição">
        <button
          type="button"
          role="radio"
          aria-checked={layoutMode === 'radar'}
          className={layoutMode === 'radar' ? 'active' : ''}
          onClick={() => onLayoutModeChange('radar')}
          title="Disposição radial com anéis de proximidade"
        >
          <Icons.Compass size={14} aria-hidden="true" />
          <span>Radar</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={layoutMode === 'chain'}
          className={layoutMode === 'chain' ? 'active' : ''}
          onClick={() => onLayoutModeChange('chain')}
          title="Disposição por colunas de classes de entidades"
        >
          <Icons.Network size={14} aria-hidden="true" />
          <span>Cadeia</span>
        </button>
      </div>

      <div className="network-select-control">
        <SelectField
          label="Profundidade"
          value={depth}
          options={DEPTH_OPTIONS}
          onChange={(val) => onDepthChange(val as DepthFilter)}
        />
      </div>

      <div className="network-select-control">
        <SelectField
          label="Relação"
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
        title="Mostrar publicações e documentos associados"
      >
        <Icons.FileText size={14} aria-hidden="true" />
        <span>Documentos</span>
      </button>

      <div className="network-icon-actions">
        <button
          type="button"
          onClick={onFit}
          title="Centralizar e ajustar visão"
          aria-label="Centralizar mapa"
        >
          <Icons.Maximize size={15} aria-hidden="true" />
        </button>

        <button
          type="button"
          className={isFullscreen ? 'active' : ''}
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Sair da tela cheia' : 'Expandir para tela cheia'}
          aria-label="Alternar tela cheia"
        >
          <Icons.Layers size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
