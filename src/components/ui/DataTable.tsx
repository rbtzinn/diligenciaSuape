// ==========================================================
// DILIGÊNCIA 360 — Tabela de dados
// ==========================================================
// Duas coisas quebravam nas tabelas do dossiê no celular.
//
// A primeira: a rolagem horizontal vazava para a página, porque o
// contêiner que rolava não era o cartão. Aqui a barra fica dentro do
// cartão, sangrando até a borda com `-mx-4`. O cabeçalho da tabela
// rola junto com as linhas; quem permanece fixo é o cabeçalho do
// dossiê, evitando duas camadas cobrindo o mesmo conteúdo.
//
// A segunda: pares Campo/Valor eram desenhados como tabela de duas
// colunas. Em 360px de largura, "Fornecimento e gestão de recursos
// humanos" não cabe na segunda coluna e é cortado. Por isso a tabela
// de duas colunas assume, por padrão, a forma de lista de definição
// em tela estreita, onde o rótulo fica acima do valor.
//
// O monoespaçado é opt-in por coluna (`mono: true`) e serve a
// documento e identificador. Antes a primeira coluna era sempre
// monoespaçada, e era ela que continha rótulos como "Razão social" —
// daí a mistura de fontes na mesma tabela.
// ==========================================================

import React from 'react';
import { cn } from '../../lib/cn';

export interface TableColumn {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Documento, número de processo, código: usa monoespaçado. */
  mono?: boolean;
  /** Não deixa a célula quebrar (data, valor, selo). */
  nowrap?: boolean;
  /** Peso de destaque para a coluna que identifica a linha. */
  strong?: boolean;
  /** Esconde a coluna em tela estreita, no modo tabela. */
  hideOnMobile?: boolean;
}

export interface TableRow {
  id: string;
  cells: Record<string, React.ReactNode>;
}

interface DataTableProps {
  columns: TableColumn[];
  rows: TableRow[];
  /**
   * `auto` (padrão) usa lista de definição em tela estreita quando
   * há exatamente duas colunas, e tabela em todos os outros casos.
   * `table` e `pairs` forçam uma das duas formas.
   */
  layout?: 'auto' | 'table' | 'pairs';
  /** Texto quando não há linha nenhuma. */
  emptyLabel?: React.ReactNode;
  className?: string;
}

const alignClass = (align?: TableColumn['align']) =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

export const DataTable: React.FC<DataTableProps> = ({
  columns,
  rows,
  layout = 'auto',
  emptyLabel = 'Nenhum registro.',
  className,
}) => {
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-sm text-ink-3">{emptyLabel}</p>;
  }

  const asPairs = layout === 'pairs' || (layout === 'auto' && columns.length === 2);

  return (
    <div className={cn('min-w-0', className)}>
      {/* ---- Lista de definição: só existe em tela estreita ---- */}
      {asPairs ? (
        <dl className="divide-y divide-line-soft border-t border-line-soft sm:hidden">
          {rows.map((row) => (
            <div key={row.id} className="grid gap-0.5 px-4 py-2.5">
              <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">{row.cells[columns[0].key]}</dt>
              <dd className={cn('text-sm text-ink', columns[1].mono && 'font-mono')}>{row.cells[columns[1].key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* ---- Tabela: a barra de rolagem mora aqui dentro ---- */}
      <div className={cn('-mx-4 overflow-x-auto overscroll-x-contain px-4', asPairs && 'hidden sm:block')}>
        <table className="w-full min-w-0 caption-bottom">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    // Grudava em `top-0`, ou seja, no topo do contêiner
                    // que rola — que fica atrás do cabeçalho da
                    // página. O nome da coluna passava por cima da
                    // fita de eixos. `thead-sticky` para na altura
                    // real do cabeçalho e numa camada abaixo dele.
                    'thead-sticky whitespace-nowrap border-b border-line bg-surface-subtle px-2.5 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-3',
                    alignClass(column.align),
                    column.hideOnMobile && 'hidden md:table-cell',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-surface-hover">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'border-b border-line-soft px-2.5 py-2.5 align-top text-sm',
                      alignClass(column.align),
                      column.mono && 'font-mono',
                      column.nowrap && 'whitespace-nowrap',
                      column.strong ? 'font-semibold text-ink' : 'text-ink-2',
                      column.hideOnMobile && 'hidden md:table-cell',
                    )}
                  >
                    {row.cells[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
