// ==========================================================
// DILIGÊNCIA 360 — Legenda do mapa
// ==========================================================
// A legenda e o contador ficaram com a pele do mapa escuro: o
// contador era um bloco `rgba(5, 24, 43, 0.88)` escrito em estilo em
// linha, e depois da conversão do grafo para tela clara ele passou a
// ser uma caixa preta sobre fundo claro. Os dois agora usam a mesma
// superfície do resto do app.
//
// As cores de borda repetem as do `CYTOSCAPE_STYLESHEET`, que é quem
// pinta os nós de verdade — legenda que não bate com o grafo é pior
// do que legenda nenhuma.
// ==========================================================

import React from 'react';

interface NetworkLegendProps {
  visibleCount: number;
  totalCount: number;
}

const NODE_KINDS = [
  { label: 'Empresa', color: 'var(--brand-blue)' },
  { label: 'Pessoa', color: '#7C4DBE' },
  { label: 'Órgão público', color: '#0E7490' },
  { label: 'Ocorrência', color: 'var(--status-high)' },
] as const;

export const NetworkLegend: React.FC<NetworkLegendProps> = ({ visibleCount, totalCount }) => (
  <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
    <div
      aria-label="Legenda do mapa"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm"
    >
      {NODE_KINDS.map((kind) => (
        <span key={kind.label} className="flex items-center gap-1.5 text-2xs font-medium text-ink-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm border-2 bg-surface"
            style={{ borderColor: kind.color }}
          />
          {kind.label}
        </span>
      ))}

      <span aria-hidden="true" className="h-3 w-px bg-line" />

      <span className="flex items-center gap-1.5 text-2xs font-medium text-ink-2">
        <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-brand" />
        Confirmada
      </span>
      <span className="flex items-center gap-1.5 text-2xs font-medium text-ink-2">
        <span
          aria-hidden="true"
          className="h-0 w-4 border-t-2 border-dashed border-[color:var(--brand-gold)]"
        />
        Hipótese
      </span>
    </div>

    <span className="num rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-2xs text-ink-3 shadow-sm backdrop-blur-sm">
      {visibleCount} de {totalCount} entidades visíveis
    </span>
  </div>
);
