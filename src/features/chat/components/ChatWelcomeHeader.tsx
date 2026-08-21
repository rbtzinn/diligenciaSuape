// ==========================================================
// DILIGÊNCIA 360 — Cabeçalho de Boas-Vindas Estilo Claude.ai
// ==========================================================

import React from 'react';
import { useAuth } from '../../auth/context/AuthContext';

interface ChatWelcomeHeaderProps {
  onSelectSample: (cnpj: string) => void;
}

export const ChatWelcomeHeader: React.FC<ChatWelcomeHeaderProps> = ({ onSelectSample }) => {
  const { user } = useAuth();
  const firstName = user?.name ? user.name.split(' ')[0] : 'Roberto';

  return (
    <section className="claude-welcome-section animate-fade-in-down">
      <div className="claude-welcome-header">
        <span className="claude-welcome-star" aria-hidden="true">✳</span>
        <h1 className="claude-welcome-title">
          De volta à ação, {firstName}
        </h1>
      </div>
      <p className="claude-welcome-subtitle">
        Assistente de Inteligência, Due Diligence e Governança Corporativa de Suape.
        Pesquise por CNPJ ou selecione uma consulta rápida abaixo:
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1.25rem' }}>
        <button
          type="button"
          className="claude-chip"
          onClick={() => onSelectSample('33.000.167/0001-01')}
          title="Consultar Petrobras"
        >
          <span>🏢 Petrobras</span>
          <span style={{ color: 'var(--text-muted)' }}>33.000.167/0001-01</span>
        </button>

        <button
          type="button"
          className="claude-chip"
          onClick={() => onSelectSample('07.526.557/0001-00')}
          title="Consultar Ambev"
        >
          <span>🏭 Ambev</span>
          <span style={{ color: 'var(--text-muted)' }}>07.526.557/0001-00</span>
        </button>

        <button
          type="button"
          className="claude-chip"
          onClick={() => onSelectSample('04.288.756/0001-30')}
          title="Consultar Fornecedor Regional"
        >
          <span>🌴 Fornecedor PE</span>
          <span style={{ color: 'var(--text-muted)' }}>04.288.756/0001-30</span>
        </button>
      </div>
    </section>
  );
};
