// ==========================================================
// DILIGÊNCIA 360 — Seção recolhível de um eixo
// ==========================================================
// Cabeçalho com selo de situação e a tabela do eixo. A seção e a
// tabela agora vêm dos primitivos, o que resolve três coisas que
// eram próprias deste arquivo:
//
//  · a primeira coluna era sempre monoespaçada, e no eixo Cadastro
//    ela contém rótulos ("Razão social", "Natureza jurídica") — daí a
//    mistura de fontes na mesma tabela;
//  · a rolagem horizontal da tabela vazava para a página no celular;
//  · o eixo de duas colunas era desenhado como tabela, e em 360px o
//    valor longo era cortado. Agora vira lista de definição.
// ==========================================================

import React from 'react';
import type { DossierAxis } from './dossierAxes';
import type { SourceStatus } from './sourceCoverage';
import { Section } from '../../../../components/ui/Section';
import { Chip, ChipTone } from '../../../../components/ui/Chip';
import { DataTable, TableColumn, TableRow } from '../../../../components/ui/DataTable';

interface AxisSectionProps {
  axis: DossierAxis;
  defaultOpen?: boolean;
}

const STATUS_TONE: Record<SourceStatus, ChipTone> = {
  'com-achado': 'brand',
  'sem-achado': 'ok',
  falhou: 'high',
  'nao-consultada': 'muted',
};

const ROW_TONE = {
  ok: 'ok',
  warn: 'warn',
  bad: 'high',
  muted: 'muted',
} as const;

/** Texto do vazio: o que a ausência de linha significa em cada caso. */
const EMPTY_COPY: Record<SourceStatus, string> = {
  'nao-consultada': 'Esta fonte não foi consultada nesta execução.',
  falhou: 'A fonte não respondeu. A ausência de registro aqui é lacuna, não conclusão.',
  'sem-achado': 'A consulta respondeu e não retornou registro.',
  'com-achado': 'A consulta respondeu e não retornou registro.',
};

/** Colunas em que monoespaçado ajuda: documento e identificador. */
const MONO_HEADERS = /processo|cnpj|cpf|documento|número|numero|contrato|código|codigo/i;

export const AxisSection: React.FC<AxisSectionProps> = ({ axis, defaultOpen = true }) => {
  const twoColumn = axis.columns.length === 2;

  const columns: TableColumn[] = axis.columns.map((header, index) => ({
    key: `c${index}`,
    header,
    // Num eixo de duas colunas a primeira é rótulo, e rótulo não é
    // dado tabular. Nos outros, monoespaçado só onde o cabeçalho diz
    // que a coluna carrega documento ou identificador.
    mono: !twoColumn && MONO_HEADERS.test(header),
    strong: index === 0,
    align: index === axis.columns.length - 1 && !twoColumn ? 'right' : 'left',
  }));

  const hasStatus = axis.rows.some((row) => row.status);
  const hasLink = axis.rows.some((row) => row.href);

  if (hasStatus) {
    columns.push({ key: 'status', header: 'Situação', align: 'right', nowrap: true });
  }
  if (hasLink) {
    columns.push({ key: 'fonte', header: 'Fonte', align: 'right', nowrap: true });
  }

  const rows: TableRow[] = axis.rows.map((row) => {
    const cells: TableRow['cells'] = {};

    row.cells.forEach((cell, index) => {
      cells[`c${index}`] = cell;
    });

    if (hasStatus) {
      cells.status = row.status ? (
        <Chip tone={ROW_TONE[row.status.tone]} size="sm">
          {row.status.label}
        </Chip>
      ) : null;
    }

    if (hasLink) {
      cells.fonte = row.href ? (
        <a
          href={row.href}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap text-xs font-semibold text-brand hover:underline"
        >
          Abrir ↗
        </a>
      ) : null;
    }

    return { id: row.id, cells };
  });

  return (
    <Section
      id={`eixo-${axis.id}`}
      mark={axis.mark}
      title={axis.label}
      collapsible
      defaultOpen={defaultOpen}
      flush
      trailing={
        <Chip tone={STATUS_TONE[axis.status]} size="sm" solid={axis.status === 'com-achado'}>
          {axis.badge}
        </Chip>
      }
    >
      {axis.rows.length === 0 ? (
        <p className="px-4 py-3.5 text-sm leading-relaxed text-ink-3">{EMPTY_COPY[axis.status]}</p>
      ) : (
        <div className="px-4 py-3">
          <DataTable columns={columns} rows={rows} layout={twoColumn ? 'auto' : 'table'} />
        </div>
      )}

      {axis.note ? (
        <p className="border-t border-line-soft px-4 py-2.5 text-xs leading-relaxed text-ink-3">{axis.note}</p>
      ) : null}
    </Section>
  );
};
