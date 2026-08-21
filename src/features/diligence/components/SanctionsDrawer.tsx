// ==========================================================
// DILIGÊNCIA 360 — Drawer de Sanções Detalhadas
// ==========================================================

import React from 'react';
import { SanctionRecord } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Formatters } from '../../../lib/formatters';

interface SanctionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tipo: 'CEIS' | 'CNEP';
  registros: SanctionRecord[];
}

export const SanctionsDrawer: React.FC<SanctionsDrawerProps> = ({
  isOpen,
  onClose,
  tipo,
  registros,
}) => {
  const title =
    tipo === 'CEIS'
      ? 'CEIS — Empresas Inidôneas e Suspensas'
      : 'CNEP — Cadastro Nacional de Empresas Punidas';

  const vigentesCount = registros.filter((r) => r.vigente).length;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={`${registros.length} registro(s) no total (${vigentesCount} vigente(s), ${registros.length - vigentesCount} histórico(s))`}
    >
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Situação / Vigência</th>
              <th>Órgão Sancionador</th>
              <th>Tipo de Sanção</th>
              <th>Período</th>
              <th>Abrangência / Fundamentação</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r, idx) => (
              <tr key={idx}>
                <td>
                  <Badge variant={r.vigente ? 'critical' : 'neutral'}>
                    {r.vigente ? 'Vigente (Ativa)' : 'Histórica (Expirada)'}
                  </Badge>
                </td>
                <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', maxWidth: '180px' }}>
                  {r.orgao || 'Não informado'}
                  {r.uf && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({r.uf})</span>}
                </td>
                <td>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', fontWeight: 'var(--font-medium)' }}>
                    {r.sancao || 'Sanção cadastrada'}
                  </span>
                  {r.processo && (
                    <div className="font-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                      Proc: {r.processo}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                  {Formatters.date(r.inicio)} {r.fim ? `→ ${Formatters.date(r.fim)}` : '(Indeterminado)'}
                </td>
                <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', maxWidth: '220px' }}>
                  {r.abrangencia && (
                    <div style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
                      {r.abrangencia}
                    </div>
                  )}
                  {r.fundamentacao ? Formatters.truncate(r.fundamentacao, 90) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
};
