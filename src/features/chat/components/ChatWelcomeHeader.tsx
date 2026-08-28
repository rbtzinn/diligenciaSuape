// ==========================================================
// DILIGÊNCIA 360 — Header de Boas-Vindas Estilo AI Assistant
// ==========================================================

import React from 'react';
import { useAuth } from '../../auth/context/AuthContext';
import { Icons } from '../../../components/ui/Icons';

interface ChatWelcomeHeaderProps {
  onSearch: (cnpj: string) => void;
  onOpenContentExtractor?: () => void;
  onOpenHistory?: () => void;
  isLoading: boolean;
}

export const ChatWelcomeHeader: React.FC<ChatWelcomeHeaderProps> = ({
  onSearch,
  onOpenContentExtractor,
  isLoading,
}) => {
  const { user } = useAuth();
  const firstName = user?.name ? user.name.split(' ')[0] : 'Usuário';

  const suggestionChips = [
    {
      label: 'Analisar Documento/Texto',
      icon: <Icons.FileText size={14} />,
      action: onOpenContentExtractor,
    },
    {
      label: 'Consultar Petrobras (Exemplo)',
      icon: <Icons.Search size={14} />,
      action: () => onSearch('33.000.167/0001-01'),
    },
    {
      label: 'Consultar Ambev (Exemplo)',
      icon: <Icons.Search size={14} />,
      action: () => onSearch('07.526.557/0001-00'),
    },
  ];

  return (
    <div className="ai-welcome-container animate-fade-in">
      <div className="welcome-hero-row">
        <div className="ai-logo-container">
          <Icons.Sparkles size={28} style={{ color: 'var(--brand-blue)' }} />
        </div>
        <div className="welcome-heading-copy">
          <span className="welcome-eyebrow">Olá, {firstName} · Compliance SUAPE</span>
          <h1 className="ai-welcome-title">Transforme um CNPJ em uma decisão clara</h1>
          <p className="ai-welcome-subtitle">
            O sistema cruza fontes, organiza os sinais de atenção e preserva as evidências para sua revisão.
          </p>
        </div>
      </div>

      <div className="welcome-steps" aria-label="Como funciona a diligência">
        <article>
          <span>1</span>
          <div>
            <strong>Informe o CNPJ</strong>
            <small>Digite ou cole o número da empresa.</small>
          </div>
        </article>
        <article>
          <span>2</span>
          <div>
            <strong>Acompanhe as consultas</strong>
            <small>Veja fontes concluídas, indisponíveis e parciais.</small>
          </div>
        </article>
        <article>
          <span>3</span>
          <div>
            <strong>Revise a decisão</strong>
            <small>Comece pelo resumo e aprofunde só o necessário.</small>
          </div>
        </article>
      </div>

      <span className="welcome-quick-label">Atalhos para demonstração</span>
      <div className="ai-suggestions-container">
        {suggestionChips.map((chip) => (
          <button
            key={chip.label}
            className="ai-suggestion-chip"
            onClick={chip.action}
            disabled={isLoading}
          >
            {chip.icon}
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
