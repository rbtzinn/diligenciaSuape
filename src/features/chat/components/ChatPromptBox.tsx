// ==========================================================
// DILIGÊNCIA 360 — Caixa de Entrada de Prompt Estilo Chat
// ==========================================================

import React, { useState, useRef, useEffect } from 'react';
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

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [value]);

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
    <div className={`ai-prompt-wrapper ${isFocused ? 'focused' : ''}`}>
      <textarea
        ref={inputRef}
        className="ai-prompt-input"
        placeholder="Envie uma mensagem ou digite o CNPJ para análise..."
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={isLoading}
        rows={1}
      />

      <div className="ai-prompt-actions">
        {onOpenContentExtractor && (
          <button
            type="button"
            className="ai-action-btn"
            onClick={onOpenContentExtractor}
            title="Anexar texto ou documento"
          >
            <Icons.Paperclip size={18} />
          </button>
        )}

        <button
          type="button"
          className="ai-send-btn"
          onClick={() => {
            if (value.trim() && !isLoading) onSubmit(value.trim());
          }}
          disabled={!value.trim() || isLoading}
          title="Enviar (Enter)"
        >
          {isLoading ? (
            <span className="ai-spin-icon" />
          ) : (
            <Icons.Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
};
