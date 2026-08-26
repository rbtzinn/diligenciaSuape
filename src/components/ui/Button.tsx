// ==========================================================
// DILIGÊNCIA 360 — Componente Button Padronizado
// Alinhamento flexível com espaçamento garantido entre texto e ícones
// ==========================================================

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'small' | 'medium' | 'large';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  rightIcon,
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClass = size === 'sm' || size === 'small'
    ? 'btn-sm'
    : size === 'lg' || size === 'large'
      ? 'btn-lg'
      : 'btn-md';
  const variantClass = `btn-${variant}`;

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            className="spinner-border spinner-border-sm"
            style={{
              width: '13px',
              height: '13px',
              border: '2px solid currentColor',
              borderRightColor: 'transparent',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.75s linear infinite',
            }}
          />
          <span>Aguarde...</span>
        </span>
      ) : (
        <>
          {icon && (
            <span
              className="btn-icon"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              {icon}
            </span>
          )}
          {children && (
            <span
              className="btn-label"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
            >
              {children}
            </span>
          )}
          {rightIcon && (
            <span
              className="btn-right-icon"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              {rightIcon}
            </span>
          )}
        </>
      )}
    </button>
  );
};
