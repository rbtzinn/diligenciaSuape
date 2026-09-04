// ==========================================================
// DILIGÊNCIA 360 — Fita de ações
// ==========================================================
// Uma linha de botões numa tela de 360px tem duas saídas ruins:
// quebrar em três fileiras, ou encolher cada botão até o rótulo ser
// cortado. As duas apareciam no app — o cabeçalho do dossiê fazia a
// primeira, a barra do mapa fazia a segunda.
//
// A saída usada aqui é a terceira: a fita rola. Nenhum botão muda de
// tamanho, nenhum rótulo é cortado, e a altura da barra é sempre a
// mesma. É o mesmo comportamento das abas.
// ==========================================================

import React from 'react';
import { cn } from '../../lib/cn';

interface ToolbarProps {
  /** Alinhamento do conteúdo quando sobra espaço. */
  align?: 'start' | 'between' | 'end';
  /** Sangra até a borda do contêiner, para a fita encostar na calha. */
  bleed?: boolean;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  align = 'start',
  bleed = false,
  className,
  'aria-label': ariaLabel,
  children,
}) => (
  <div
    role={ariaLabel ? 'group' : undefined}
    aria-label={ariaLabel}
    className={cn('scroll-fita min-w-0', bleed && '-mx-gutter px-gutter', className)}
  >
    <div
      className={cn(
        'flex items-center gap-2',
        align === 'start' ? 'w-max' : 'w-full min-w-max',
        align === 'between' && 'justify-between',
        align === 'end' && 'justify-end',
      )}
    >
      {children}
    </div>
  </div>
);

/** Traço vertical entre grupos de ação dentro da fita. */
export const ToolbarDivider: React.FC<{ tone?: 'default' | 'deep' }> = ({ tone = 'default' }) => (
  <span
    aria-hidden="true"
    className={cn('h-5 w-px shrink-0', tone === 'deep' ? 'bg-deep-line' : 'bg-line')}
  />
);

/** Empurra o que vem depois para a direita. */
export const ToolbarSpacer: React.FC = () => <span aria-hidden="true" className="flex-1" />;
