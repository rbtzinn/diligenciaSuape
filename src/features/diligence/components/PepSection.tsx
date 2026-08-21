// ==========================================================
// DILIGÊNCIA 360 — Componente PEP (Compacto)
// ==========================================================

import React from 'react';
import { PepPartnerResult } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface PepSectionProps {
  pepResults: PepPartnerResult[];
  onOpenDrawer?: () => void;
}

export const PepSection: React.FC<PepSectionProps> = ({ pepResults, onOpenDrawer }) => {
  const pepsEncontrados = pepResults.filter((p) => p.encontrado);
  const hasPep = pepsEncontrados.length > 0;

  return (
    <Card
      title="Verificação de Cargos Políticos"
      icon={<Icons.Landmark size={16} />}
      action={
        hasPep ? (
          <Badge variant="medium">⚠ {pepsEncontrados.length} a verificar</Badge>
        ) : (
          <Badge variant="success">✓ Sem registros</Badge>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div className="section-subtitle">
          Verifica se algum sócio ocupa ou ocupou cargo público ou político
        </div>

        {!hasPep ? (
          <div className="clean-state-block">
            <Icons.Check size={16} />
            <span>Nenhum sócio foi encontrado em cargos políticos ou públicos.</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Foram encontrados <strong>{pepsEncontrados.length} sócio(s)</strong> com nome parecido ao de pessoas em cargos públicos. É necessário confirmar se são a mesma pessoa.
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {pepsEncontrados.map((p, idx) => (
                <span key={idx} className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
                  {p.nome} ({p.quantidade} registro{p.quantidade > 1 ? 's' : ''})
                </span>
              ))}
            </div>

            {onOpenDrawer && (
              <div style={{ marginTop: '0.25rem' }}>
                <Button variant="ghost" size="sm" onClick={onOpenDrawer}>
                  Ver detalhes dos {pepsEncontrados.length} caso(s) ➜
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};
