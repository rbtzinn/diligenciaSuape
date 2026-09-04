// ==========================================================
// DILIGÊNCIA 360 — Trilha de auditoria
// ==========================================================
// A linha do tempo vinha de `.timeline-*` em dashboard.css. Passa a
// ser uma lista com o traço vertical desenhado pelo próprio item, o
// que também resolve o ponto solto no último evento.
// ==========================================================

import React, { useState } from 'react';
import { AuditEvent } from '../types';
import { Section } from '../../../components/ui/Section';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';

interface AuditTimelineProps {
  timeline: AuditEvent[];
}

/** Cor do ponto por natureza do evento. */
const DOT: Record<string, string> = {
  info: 'bg-brand',
  warning: 'bg-warn',
  error: 'bg-high',
};

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ timeline }) => {
  const [expanded, setExpanded] = useState(false);
  const itemsToShow = expanded ? timeline : timeline.slice(0, 3);

  return (
    <Section
      mark={<Icons.Clock size={12} />}
      title="Trilha de auditoria"
      trailing={
        <Chip tone="neutral" size="sm">
          {timeline.length} registro(s)
        </Chip>
      }
      footer={
        timeline.length > 3 ? (
          <Button
            variant="ghost"
            size="sm"
            icon={expanded ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Mostrar menos' : `Ver todos os ${timeline.length} eventos`}
          </Button>
        ) : undefined
      }
    >
      <ol className="flex min-w-0 flex-col">
        {itemsToShow.map((item, index) => (
          <li key={index} className="flex min-w-0 gap-3">
            {/* Coluna do marcador: ponto e traço. O traço para no
                penúltimo item, para a trilha não ficar aberta no fim. */}
            <span aria-hidden="true" className="flex shrink-0 flex-col items-center">
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[item.tipo] || 'bg-line-strong')} />
              {index < itemsToShow.length - 1 ? <span className="w-px flex-1 bg-line" /> : null}
            </span>

            <span className={cn('min-w-0 flex-1', index < itemsToShow.length - 1 && 'pb-3')}>
              <time className="num block font-mono text-2xs text-ink-muted">{Formatters.time(item.time)}</time>
              <span className="block text-xs leading-relaxed text-ink-2">{item.txt}</span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
};
