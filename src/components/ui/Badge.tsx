// ==========================================================
// DILIGÊNCIA 360 — Componente Badge
// ==========================================================

import React from 'react';
import { StatusVariant } from '../../types';
import { ControlSize, resolveControlSize } from './controlSize';

interface BadgeProps {
  variant?: StatusVariant;
  size?: ControlSize;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  icon,
  children,
  className = '',
  style,
}) => {
  const classes = ['badge', `badge-${variant}`, `badge-size-${resolveControlSize(size)}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} style={style}>
      {icon && <span className="badge-icon">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
