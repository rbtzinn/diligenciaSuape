// ==========================================================
// DILIGÊNCIA 360 — Componente de Sanções (CEIS e CNEP)
// Separação explícita entre Sanções Vigentes e Histórico Expirado
// ==========================================================

import React, { useState } from 'react';
import { SanctionsResult } from '../types';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { SanctionsDrawer } from './SanctionsDrawer';

interface SanctionsSectionProps {
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
}

export const SanctionsSection: React.FC<SanctionsSectionProps> = ({ ceis, cnep }) => {
  const [selectedDrawer, setSelectedDrawer] = useState<'CEIS' | 'CNEP' | null>(null);

  const ceisVigentes = ceis?.vigentes ?? (ceis?.encontrado ? ceis.quantidade : 0);
  const ceisTotal = ceis?.encontrado ? ceis.quantidade : 0;
  const ceisHistoricas = ceisTotal - ceisVigentes;

  const cnepVigentes = cnep?.vigentes ?? (cnep?.encontrado ? cnep.quantidade : 0);
  const cnepTotal = cnep?.encontrado ? cnep.quantidade : 0;
  const cnepHistoricas = cnepTotal - cnepVigentes;

  const renderBadge = (vigentes: number, historicas: number, res?: SanctionsResult) => {
    if (!res) return <Badge variant="neutral">Não consultado</Badge>;
    if (res.semChave) return <Badge variant="medium">Sem chave de acesso</Badge>;
    if (!res.ok) return <Badge variant="critical">Indisponível</Badge>;
    if (vigentes > 0) return <Badge variant="critical">✕ {vigentes} ativo(s)</Badge>;
    if (historicas > 0) return <Badge variant="neutral">{historicas} já expirado(s)</Badge>;
    return <Badge variant="success">✓ Tudo certo</Badge>;
  };

  return (
    <>
      <Card
        title="Lista de Empresas Impedidas (CEIS)"
        icon={<Icons.ShieldAlert size={16} />}
        action={renderBadge(ceisVigentes, ceisHistoricas, ceis)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className="section-subtitle">
            Verifica se a empresa está proibida de contratar com o governo
          </div>
          {ceisVigentes === 0 && ceisHistoricas === 0 ? (
            <div className="clean-state-block">
              <Icons.Check size={16} />
              <span>Nenhum impedimento encontrado — empresa pode contratar normalmente.</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <strong>{ceisVigentes} impedimento(s) ativo(s)</strong> • {ceisHistoricas} já expirado(s) no histórico
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDrawer('CEIS')}>
                Ver detalhes completos ➜
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card
        title="Punições por Corrupção (CNEP)"
        icon={<Icons.Scale size={16} />}
        action={renderBadge(cnepVigentes, cnepHistoricas, cnep)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className="section-subtitle">
            Verifica se a empresa foi punida pela Lei Anticorrupção
          </div>
          {cnepVigentes === 0 && cnepHistoricas === 0 ? (
            <div className="clean-state-block">
              <Icons.Check size={16} />
              <span>Nenhuma punição por corrupção registrada.</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <strong>{cnepVigentes} punição(ões) ativa(s)</strong> • {cnepHistoricas} já expirada(s) no histórico
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDrawer('CNEP')}>
                Ver detalhes completos ➜
              </Button>
            </>
          )}
        </div>
      </Card>

      {selectedDrawer && (
        <SanctionsDrawer
          isOpen={true}
          onClose={() => setSelectedDrawer(null)}
          tipo={selectedDrawer}
          registros={selectedDrawer === 'CEIS' ? ceis?.registros || [] : cnep?.registros || []}
        />
      )}
    </>
  );
};
