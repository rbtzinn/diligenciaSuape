// ==========================================================
// DILIGÊNCIA 360 — Drawer de Quadro Societário Completo
// Visualização tabular com busca interativa e status PEP
// ==========================================================

import React, { useState, useMemo } from 'react';
import { Shareholder, PepPartnerResult } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Formatters } from '../../../lib/formatters';

interface ShareholdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  socios: Shareholder[];
  pepResults: PepPartnerResult[];
}

export const ShareholdersDrawer: React.FC<ShareholdersDrawerProps> = ({
  isOpen,
  onClose,
  socios,
  pepResults,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const pepMap = useMemo(() => {
    const map = new Map<string, PepPartnerResult>();
    pepResults.forEach((p) => map.set(p.nome, p));
    return map;
  }, [pepResults]);

  const filteredSocios = useMemo(() => {
    if (!searchTerm.trim()) return socios;
    const term = searchTerm.toLowerCase();
    return socios.filter(
      (s) =>
        s.nome_socio.toLowerCase().includes(term) ||
        (s.qualificacao_socio && s.qualificacao_socio.toLowerCase().includes(term))
    );
  }, [socios, searchTerm]);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Quadro de Sócios e Administradores (QSA)"
      subtitle={`${socios.length} integrantes registrados na base da Receita Federal`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {/* Campo de Busca Rápida */}
        {socios.length > 5 && (
          <div>
            <input
              type="text"
              className="input-control"
              placeholder="Filtrar por nome do sócio ou qualificação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ fontSize: 'var(--text-xs)' }}
            />
          </div>
        )}

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome / Razão Social</th>
                <th>Qualificação</th>
                <th>Entrada</th>
                <th>Status PEP (CGU)</th>
              </tr>
            </thead>
            <tbody>
              {filteredSocios.map((s, idx) => {
                const pepData = pepMap.get(s.nome_socio);
                const isPep = !!(pepData && pepData.encontrado);

                return (
                  <tr key={idx}>
                    <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>
                      {s.nome_socio}
                      {s.cnpj_cpf_do_socio && (
                        <span className="font-mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginLeft: '0.35rem' }}>
                          ({s.cnpj_cpf_do_socio})
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      {s.qualificacao_socio || 'Não informado'}
                    </td>
                    <td className="font-mono" style={{ fontSize: 'var(--text-xs)' }}>
                      {Formatters.date(s.data_entrada_sociedade)}
                    </td>
                    <td>
                      {isPep ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                          <Badge variant="medium">Homônimo a validar</Badge>
                          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                            {pepData?.quantidade} registro(s) nominal(is)
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-low-text)' }}>
                          Sem registro
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
};
