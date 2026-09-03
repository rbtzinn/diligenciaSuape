// ==========================================================
// DILIGÊNCIA 360 — Seção recolhível de um eixo
// Cabeçalho com selo de situação e tabela Fonte · Situação · Detalhes.
// ==========================================================

import React, { useState } from 'react';
import type { DossierAxis } from './dossierAxes';
import type { SourceStatus } from './sourceCoverage';

interface AxisSectionProps {
  axis: DossierAxis;
  defaultOpen?: boolean;
}

const BADGE_CLASS: Record<SourceStatus, string> = {
  'com-achado': 'bg-brand text-white',
  'sem-achado': 'bg-ok-bg text-ok',
  falhou: 'bg-high-bg text-high',
  'nao-consultada': 'bg-surface-subtle text-ink-3',
};

const TONE_CLASS = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-high-bg text-high',
  muted: 'bg-surface-subtle text-ink-3',
} as const;

export const AxisSection: React.FC<AxisSectionProps> = ({ axis, defaultOpen = true }) => {
  const [aberto, setAberto] = useState(defaultOpen);
  const vazio = axis.rows.length === 0;

  return (
    <section id={`eixo-${axis.id}`} className="mt-3 overflow-hidden rounded-card border border-line bg-surface">
      <button
        type="button"
        onClick={() => setAberto((atual) => !atual)}
        aria-expanded={aberto}
        className="flex w-full cursor-pointer items-center gap-2.5 border-b border-line-soft bg-surface-subtle px-4 py-3 text-left"
      >
        <span
          aria-hidden="true"
          className="grid size-5 place-items-center rounded bg-brand-soft text-[11px] font-bold text-brand"
        >
          {axis.mark}
        </span>
        <h3 className="m-0 text-[14px] font-bold text-ink">{axis.label}</h3>
        <span className={`ml-auto rounded-chip px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_CLASS[axis.status]}`}>
          {axis.badge}
        </span>
        <span aria-hidden="true" className="text-[12px] text-ink-3">{aberto ? '▲' : '▼'}</span>
      </button>

      {aberto ? (
        <div className="px-4 pb-4 pt-1.5">
          {vazio ? (
            <p className="py-3 text-[13px] text-ink-3">
              {axis.status === 'nao-consultada'
                ? 'Esta fonte não foi consultada nesta execução.'
                : axis.status === 'falhou'
                  ? 'A fonte não respondeu. A ausência de registro aqui é lacuna, não conclusão.'
                  : 'A consulta respondeu e não retornou registro.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {axis.columns.map((coluna, index) => (
                      <th
                        key={coluna}
                        className={[
                          'border-b border-line-soft bg-surface-subtle px-2.5 py-2 text-[11px] font-semibold text-ink-3',
                          index === axis.columns.length - 1 ? 'text-right' : 'text-left',
                        ].join(' ')}
                      >
                        {coluna}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {axis.rows.map((row) => (
                    <tr key={row.id}>
                      {row.cells.map((cell, index) => (
                        <td
                          key={index}
                          className={[
                            'border-b border-line-soft px-2.5 py-2.5 text-[13px] text-ink',
                            index === 0 ? 'font-mono' : '',
                          ].join(' ')}
                        >
                          {cell}
                        </td>
                      ))}
                      {row.status ? (
                        <td className="border-b border-line-soft px-2.5 py-2.5 text-right">
                          <span className={`rounded px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASS[row.status.tone]}`}>
                            {row.status.label}
                          </span>
                        </td>
                      ) : null}
                      {row.href ? (
                        <td className="border-b border-line-soft px-2.5 py-2.5 text-right">
                          <a
                            href={row.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whitespace-nowrap text-[12px] text-brand hover:underline"
                          >
                            Abrir fonte ↗
                          </a>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {axis.note ? <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{axis.note}</p> : null}
        </div>
      ) : null}
    </section>
  );
};
