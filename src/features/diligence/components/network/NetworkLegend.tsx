// ==========================================================
// DILIGÊNCIA 360 — Legenda da Rede Imersiva
// 100% alinhada a network-immersive.css
// ==========================================================

import React from 'react';

interface NetworkLegendProps {
  visibleCount: number;
  totalCount: number;
}

export const NetworkLegend: React.FC<NetworkLegendProps> = ({
  visibleCount,
  totalCount,
}) => {
  return (
    <>
      <div className="network-legend" aria-label="Legenda do mapa">
        <span><i className="legend-company" /> Empresa analisada</span>
        <span><i className="legend-person" /> Pessoa</span>
        <b>|</b>
        <span><b /> Confirmada</span>
        <span><b className="legend-hypothesis" /> Hipótese</span>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 4,
          padding: '6px 10px',
          color: '#849db5',
          fontSize: '9px',
          background: 'rgba(5, 24, 43, 0.88)',
          border: '1px solid #234663',
          borderRadius: 9,
          backdropFilter: 'blur(12px)',
          pointerEvents: 'none',
        }}
      >
        <span>{visibleCount} de {totalCount} entidades visíveis</span>
      </div>
    </>
  );
};
