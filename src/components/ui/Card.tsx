// ==========================================================
// DILIGÊNCIA 360 — Componente Card
// ==========================================================

import React from 'react';

interface CardProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  icon,
  action,
  children,
  className = '',
  bodyClassName = '',
}) => {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card-header">
          <div className="card-title">
            {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
            <span>{title}</span>
          </div>
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClassName}`}>{children}</div>
    </div>
  );
};
