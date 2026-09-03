// ==========================================================
// DILIGÊNCIA 360 — Faixa de aviso
// ==========================================================
// Aviso dispensável sobre o alcance da análise automatizada. O texto
// é longo e no celular ele empurrava o botão de fechar fora da tela;
// agora o botão fica fixo à direita e o texto encolhe.
// ==========================================================

import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';

const DISMISS_KEY = 'dil360_disclaimer_dismissed';

export const DisclaimerBar: React.FC = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === 'true') setVisible(false);
    } catch {
      // Sem armazenamento local o aviso simplesmente reaparece.
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // Fechar a faixa nesta sessão continua valendo.
    }
  };

  if (!visible) return null;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-line-soft bg-brand-soft px-gutter py-1.5">
      <Icons.Info size={14} aria-hidden="true" className="shrink-0 text-brand" />

      <p className="min-w-0 flex-1 text-xs leading-snug text-ink-2">
        <strong className="font-semibold text-ink">Diligência de integridade:</strong> análise automatizada com base em
        regras e fontes públicas oficiais. Não substitui o parecer técnico do Compliance.
      </p>

      <button
        type="button"
        onClick={dismiss}
        title="Ocultar aviso"
        aria-label="Ocultar aviso"
        className="grid size-6 shrink-0 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <Icons.X size={14} aria-hidden="true" />
      </button>
    </div>
  );
};
