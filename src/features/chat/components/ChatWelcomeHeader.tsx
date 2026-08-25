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
      <div className="ai-logo-container">
        <Icons.Sparkles size={32} style={{ color: 'var(--brand-blue)' }} />
      </div>

      <h1 className="ai-welcome-title">
        Olá, {firstName}
      </h1>

      <p className="ai-welcome-subtitle">
        Como posso ajudar na sua diligência de hoje?
      </p>

      <div className="ai-suggestions-container">
        {suggestionChips.map((chip, idx) => (
          <button
            key={idx}
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
