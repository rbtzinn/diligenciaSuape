import React from 'react';

interface DashboardSectionHeaderProps {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
}

export const DashboardSectionHeader: React.FC<DashboardSectionHeaderProps> = ({
  id,
  eyebrow,
  title,
  description,
}) => (
  <header className="dashboard-section-heading">
    <span className="dashboard-section-eyebrow">{eyebrow}</span>
    <div className="dashboard-section-heading-copy">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </div>
  </header>
);
