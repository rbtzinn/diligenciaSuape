// ==========================================================
// DILIGÊNCIA 360 — Componente Quadro Societário (Compacto)
// ==========================================================

import React from 'react';
import { Shareholder, PepPartnerResult } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface ShareholdersSectionProps {
  socios: Shareholder[];
  pepResults: PepPartnerResult[];
  onOpenDrawer?: () => void;
}

export const ShareholdersSection: React.FC<ShareholdersSectionProps> = ({
  socios,
  pepResults,
  onOpenDrawer,
}) => {
  const topSocios = socios.slice(0, 3);
  const remaining = socios.length - topSocios.length;

  const isPep = (nome: string) => {
    return pepResults.some((p) => p.nome === nome && p.encontrado);
  };

  return (
    <Card
      title="Sócios e Administradores"
      icon={<Icons.Users size={16} />}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
            {socios.length} pessoa(s)
          </span>
          {onOpenDrawer && socios.length > 3 && (
            <Button variant="ghost" size="sm" onClick={onOpenDrawer}>
              Ver todos ➜
            </Button>
          )}
        </div>
      }
    >
      {socios.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
          Nenhum sócio ou administrador encontrado na base pública.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className="section-subtitle">
            Pessoas que fazem parte da sociedade e sua situação
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cargo / Função</th>
                  <th>Cargo Político?</th>
                </tr>
              </thead>
              <tbody>
                {topSocios.map((s, idx) => {
                  const pepMatch = isPep(s.nome_socio);
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>
                        {s.nome_socio}
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {s.qualificacao_socio || 'Sócio / Administrador'}
                      </td>
                      <td>
                        {pepMatch ? (
                          <Badge variant="medium">⚠ Possível — verificar</Badge>
                        ) : (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--status-low-text)' }}>
                            ✓ Sem apontamento
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {remaining > 0 && onOpenDrawer && (
            <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
              <Button variant="ghost" size="sm" onClick={onOpenDrawer}>
                +{remaining} outra(s) pessoa(s) • Ver lista completa ➜
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
