// ==========================================================
// DILIGÊNCIA 360 — Componente Trilha de Auditoria (Compacto)
// ==========================================================

import React, { useState } from 'react';
import { AuditEvent } from '../types';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

interface AuditTimelineProps {
  timeline: AuditEvent[];
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ timeline }) => {
  const [expanded, setExpanded] = useState(false);
  const itemsToShow = expanded ? timeline : timeline.slice(0, 3);

  return (
    <Card
      title="Trilha de Auditoria"
      icon={<Icons.Clock size={16} />}
      action={
        <span className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
          {timeline.length} registro(s)
        </span>
      }
      className="dash-full-width"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="timeline-list">
          {itemsToShow.map((item, idx) => (
            <div key={idx} className="timeline-item">
              <div className={`timeline-dot ${item.tipo}`} />
              <div className="timeline-content">
                <div className="timeline-time font-mono">{Formatters.time(item.time)}</div>
                <div className="timeline-text">{item.txt}</div>
              </div>
            </div>
          ))}
        </div>

        {timeline.length > 3 && (
          <div style={{ textAlign: 'center', paddingTop: '0.25rem' }}>
            <Button
              variant="ghost"
              size="sm"
              icon={expanded ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Mostrar menos' : `Ver todos os ${timeline.length} eventos da trilha`}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};
