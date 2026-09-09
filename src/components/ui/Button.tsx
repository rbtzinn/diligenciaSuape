// ==========================================================
// DILIGÊNCIA 360 — Botão
// ==========================================================
// A forma vinha de styles/components/button.css, onde o primário era
// um degradê de um azul (#1D4ED8) que não é o azul institucional.
// O botão discordava de qualquer cabeçalho ao lado dele. Agora é
// preenchimento sólido no azul da marca, e a escala sai dos tokens
// de controle, os mesmos do campo e do selo.
// ==========================================================

import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import { ControlSize, resolveControlSize } from './controlSize';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline' | 'deep';
export type ButtonSize = ControlSize;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  /** Ocupa a largura do contêiner — formulário e rodapé de gaveta. */
  block?: boolean;
  /** Só ícone: vira quadrado e exige `aria-label`. */
  iconOnly?: boolean;
  children?: React.ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-brand text-white shadow-xs hover:bg-brand-hover active:bg-brand-active',
  secondary:
    'border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-surface-hover active:bg-surface-active',
  outline:
    'border-brand-line bg-transparent text-brand hover:bg-brand-soft active:bg-brand-soft',
  ghost:
    'border-transparent bg-transparent text-ink-2 hover:bg-surface-hover hover:text-ink active:bg-surface-active',
  danger:
    'border-transparent bg-high text-white shadow-xs hover:bg-[color:var(--btn-danger-bg-hover)] active:bg-[color:var(--btn-danger-bg-active)]',
  // Aprovar e concluir pedia verde e tentava chegar nele com
  // `var(--color-success-600)`, um token que nunca existiu: a regra
  // era inválida e o botão continuava azul.
  success:
    'border-transparent bg-ok text-white shadow-xs hover:brightness-95 active:brightness-90',
  // Para uso sobre a superfície escura do mapa de vínculos.
  deep:
    'border-deep-line bg-deep-raised text-on-deep hover:bg-deep-hover active:bg-deep',
};

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'min-h-[var(--control-height-sm)] gap-[var(--control-gap-sm)] rounded-[var(--control-radius-sm)] px-[var(--control-pad-x-sm)] text-xs',
  md: 'min-h-[var(--control-height-md)] gap-[var(--control-gap-md)] rounded-[var(--control-radius-md)] px-[var(--control-pad-x-md)] text-base',
  lg: 'min-h-[var(--control-height-lg)] gap-[var(--control-gap-lg)] rounded-[var(--control-radius-lg)] px-[var(--control-pad-x-lg)] text-md',
};

const ICON_ONLY: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'size-[var(--control-height-sm)] rounded-[var(--control-radius-sm)] px-0',
  md: 'size-[var(--control-height-md)] rounded-[var(--control-radius-md)] px-0',
  lg: 'size-[var(--control-height-lg)] rounded-[var(--control-radius-lg)] px-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  rightIcon,
  isLoading = false,
  loadingLabel = 'Aguarde…',
  block = false,
  iconOnly = false,
  children,
  className,
  disabled,
  type = 'button',
  ...props
}, ref) {
  const resolved = resolveControlSize(size);

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap border font-semibold leading-normal transition-colors',
        'disabled:pointer-events-none disabled:opacity-[var(--btn-disabled-opacity)]',
        iconOnly ? ICON_ONLY[resolved] : SIZE[resolved],
        VARIANT[variant],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner />
          {!iconOnly ? <span className="min-w-0 truncate py-0.5 leading-normal">{loadingLabel}</span> : null}
        </>
      ) : (
        <>
          {icon ? <span className="grid shrink-0 place-items-center">{icon}</span> : null}
          {children ? <span className={cn(!iconOnly && 'min-w-0 truncate py-0.5 leading-normal')}>{children}</span> : null}
          {rightIcon ? <span className="grid shrink-0 place-items-center">{rightIcon}</span> : null}
        </>
      )}
    </button>
  );
});

const Spinner: React.FC = () => (
  <span
    aria-hidden="true"
    className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
  />
);
