// ==========================================================
// DILIGÊNCIA 360 — Gaveta de sanções detalhadas
// ==========================================================
// A tabela usava `.table-container` + `.data-table` do index.css e
// estilo em linha célula por célula, com cinco colunas que no celular
// só existiam atrás de uma barra de rolagem sem fim. Agora usa a
// DataTable do projeto, que rola dentro do cartão e esconde as
// colunas secundárias em tela estreita.
// ==========================================================

import React from 'react';
import { SanctionRecord } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Chip } from '../../../components/ui/Chip';
import { DataTable, TableColumn } from '../../../components/ui/DataTable';
import { Formatters } from '../../../lib/formatters';

interface SanctionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'CEIS' | 'CNEP';
  registros: SanctionRecord[];
}

const COLUMNS: TableColumn[] = [
  { key: 'situacao', header: 'Situação', nowrap: true },
  { key: 'orgao', header: 'Órgão sancionador', strong: true },
  { key: 'sancao', header: 'Tipo de sanção' },
  { key: 'periodo', header: 'Período', nowrap: true, hideOnMobile: true },
  { key: 'abrangencia', header: 'Abrangência e fundamentação', hideOnMobile: true },
];

export const SanctionsDrawer: React.FC<SanctionsDrawerProps> = ({ isOpen, onClose, tipo, registros }) => {
  const title =
    tipo === 'CEIS'
      ? 'CEIS — Empresas inidôneas e suspensas'
      : 'CNEP — Cadastro Nacional de Empresas Punidas';

  const vigentes = registros.filter((record) => record.vigente).length;

  const rows = registros.map((record, index) => ({
    id: `${record.processo || record.orgao || 'sancao'}-${index}`,
    cells: {
      situacao: (
        <Chip tone={record.vigente ? 'critical' : 'neutral'} size="sm" dot>
          {record.vigente ? 'Vigente' : 'Histórica'}
        </Chip>
      ),
      orgao: (
        <>
          {record.orgao || 'Não informado'}
          {record.uf ? <span className="ml-1 text-2xs font-normal text-ink-muted">({record.uf})</span> : null}
        </>
      ),
      sancao: (
        <>
          <span className="block font-medium text-ink">{record.sancao || 'Sanção cadastrada'}</span>
          {record.processo ? (
            <span className="block font-mono text-2xs text-ink-3">Proc: {record.processo}</span>
          ) : null}
        </>
      ),
      periodo: (
        <>
          {Formatters.date(record.inicio)} {record.fim ? `→ ${Formatters.date(record.fim)}` : '(indeterminado)'}
        </>
      ),
      abrangencia: (
        <>
          {record.abrangencia ? (
            <span className="block font-medium text-ink">{record.abrangencia}</span>
          ) : null}
          {record.fundamentacao ? Formatters.truncate(record.fundamentacao, 90) : '—'}
        </>
      ),
    },
  }));

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={`${registros.length} registro(s) no total · ${vigentes} vigente(s) · ${registros.length - vigentes} histórico(s)`}
    >
      <div className="rounded-card border border-line bg-surface p-4 shadow-xs">
        <DataTable
          columns={COLUMNS}
          rows={rows}
          layout="table"
          emptyLabel="Nenhum registro de sanção nesta base."
        />
      </div>
    </Drawer>
  );
};
