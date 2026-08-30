// ==========================================================
// DILIGÊNCIA 360 — Componente Button Padronizado
// Forma e escala vivem em styles/components/button.css
// ==========================================================

import React from 'react';
import { ControlSize, resolveControlSize } from './controlSize';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = ControlSize;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  rightIcon,
  isLoading = false,
  loadingLabel = 'Aguarde...',
  children,
  className = '',
  disabled,
  ...props
}) => {
  const classes = ['btn', `btn-${variant}`, `btn-${resolveControlSize(size)}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <span className="btn-loading">
          <span className="btn-spinner" aria-hidden="true" />
          <span>{loadingLabel}</span>
        </span>
      ) : (
        <>
          {icon && <span className="btn-icon">{icon}</span>}
          {children && <span className="btn-label">{children}</span>}
          {rightIcon && <span className="btn-right-icon">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};
