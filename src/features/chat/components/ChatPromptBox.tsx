// ==========================================================
// DILIGÊNCIA 360 — Caixa de Entrada de Prompt Estilo Claude.ai
// ==========================================================

import React, { useState, useRef } from 'react';
import { CNPJ } from '../../../lib/cnpj';
import { Icons } from '../../../components/ui/Icons';

interface ChatPromptBoxProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (val: string) => void;
  isLoading: boolean;
  onOpenContentExtractor?: () => void;
}

export const ChatPromptBox: React.FC<ChatPromptBoxProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading,
  onOpenContentExtractor,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit(value.trim());
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length === 14 && raw.length <= 18) {
      onChange(CNPJ.format(digitsOnly));
    } else {
      onChange(raw);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '20px',
        border: `1.5px solid ${isFocused ? 'var(--brand-blue)' : 'var(--border-default)'}`,
        boxShadow: isFocused
          ? '0 8px 28px -4px rgba(30, 64, 175, 0.14)'
          : '0 4px 20px -2px rgba(15, 41, 66, 0.07)',
        padding: '0.85rem 1.15rem 0.75rem',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
      }}
    >
      <textarea
        ref={inputRef}
        placeholder="Como posso ajudar na diligência de hoje? Digite o CNPJ da empresa..."
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={isLoading}
        rows={2}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          backgroundColor: 'transparent',
          lineHeight: 1.5,
          fontFamily: 'inherit',
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '0.55rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {onOpenContentExtractor && (
            <button
              type="button"
              className="claude-chip"
              onClick={onOpenContentExtractor}
              title="Analisar texto, despacho judicial ou certidão"
            >
              <Icons.Plus size={13} style={{ color: 'var(--brand-blue)' }} />
              <span>Analisar Texto</span>
            </button>
          )}

          <button
            type="button"
            className="claude-chip"
            onClick={() => {
              if (value.trim() && !isLoading) onSubmit(value.trim());
            }}
            title="Executar due diligence completa 360"
          >
            <Icons.Search size={13} />
            <span>Diligência 360</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (value.trim() && !isLoading) onSubmit(value.trim());
          }}
          disabled={!value.trim() || isLoading}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            backgroundColor: value.trim() && !isLoading ? 'var(--brand-blue)' : 'var(--bg-surface-subtle)',
            color: value.trim() && !isLoading ? '#ffffff' : 'var(--text-muted)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: value.trim() && !isLoading ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            boxShadow: value.trim() && !isLoading ? '0 2px 8px rgba(30, 64, 175, 0.25)' : 'none',
          }}
          title="Iniciar Análise (Enter)"
        >
          {isLoading ? (
            <span
              style={{
                width: '14px',
                height: '14px',
                border: '2px solid #ffffff',
                borderRightColor: 'transparent',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.75s linear infinite',
              }}
            />
          ) : (
            <Icons.ArrowRight size={15} />
          )}
        </button>
      </div>
    </div>
  );
};
