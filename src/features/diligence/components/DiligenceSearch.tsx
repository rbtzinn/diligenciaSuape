// ==========================================================
// DILIGÊNCIA 360 — Componente Diligência Search
// ==========================================================

import React, { useState } from 'react';
import { CNPJ } from '../../../lib/cnpj';
import { Icons } from '../../../components/ui/Icons';

interface DiligenceSearchProps {
  onSearch: (cnpj: string) => void;
  isLoading: boolean;
  error?: string | null;
}

export const DiligenceSearch: React.FC<DiligenceSearchProps> = ({
  onSearch,
  isLoading,
  error,
}) => {
  const [value, setValue] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(CNPJ.mask(e.target.value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value || isLoading) return;
    onSearch(value);
  };

  return (
    <div className="consultation-shell">
      <div className="consultation-intro animate-fade-in-down">
        <div className="consultation-badge-top">
          <Icons.ShieldCheck size={14} />
          <span>Diligência Automatizada em Fontes Públicas</span>
        </div>
        <h1 className="consultation-title">Nova Diligência de Integridade</h1>
        <p className="consultation-subtitle">
          Informe o CNPJ da empresa para consultar cadastro, sócios, sanções administrativas (CEIS/CNEP) e PEPs em tempo real.
        </p>
      </div>

      <div className="query-box-card animate-fade-in-up">
        <form onSubmit={handleSubmit}>
          <div className="query-input-group">
            <input
              type="text"
              className="query-input font-mono"
              placeholder="00.000.000/0000-00"
              value={value}
              onChange={handleChange}
              disabled={isLoading}
              maxLength={18}
              autoFocus
            />
            <button
              type="submit"
              className="query-btn"
              disabled={isLoading || !value}
            >
              {isLoading ? (
                <>
                  <Icons.Loader size={16} />
                  <span>Consultando...</span>
                </>
              ) : (
                <>
                  <Icons.Search size={16} />
                  <span>Analisar CNPJ</span>
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div
            style={{
              padding: '0.625rem 0.875rem',
              backgroundColor: 'var(--status-high-bg)',
              border: '1px solid var(--status-high-border)',
              color: 'var(--status-high-text)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Icons.AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
