// ==========================================================
// DILIGÊNCIA 360 — Componente Card
// ==========================================================

import React from 'react';
import { ControlSize, resolveControlSize } from './controlSize';

interface CardProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  size?: ControlSize;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  icon,
  action,
  size = 'md',
  children,
  className = '',
  bodyClassName = '',
}) => {
  const classes = ['card', `card-size-${resolveControlSize(size)}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {(title || action) && (
        <div className="card-header">
          <div className="card-title">
            {icon && <span className="card-title-icon">{icon}</span>}
            <span>{title}</span>
          </div>
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClassName}`}>{children}</div>
    </div>
  );
};
