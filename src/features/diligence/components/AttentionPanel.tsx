// ==========================================================
// DILIGÊNCIA 360 — Painel Executivo de Pontos de Atenção
// Lista de ações e pendências objetivas com direcionamento claro
// ==========================================================

import React from 'react';
import { AutomatedAnalysis } from '../types';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface AttentionPanelProps {
  analise?: AutomatedAnalysis;
  onOpenCeis?: () => void;
  onOpenCnep?: () => void;
  onOpenSocios?: () => void;
  onOpenMedia?: () => void;
}

export const AttentionPanel: React.FC<AttentionPanelProps> = ({
  analise,
  onOpenCeis,
  onOpenCnep,
  onOpenSocios,
  onOpenMedia,
}) => {
  const alertas = analise?.alertas || [];
  const hasAlerts = alertas.length > 0;

  return (
    <Card
      title="O que precisa de atenção"
      icon={<Icons.AlertTriangle size={16} />}
      action={
        hasAlerts ? (
          <span className="badge badge-high">⚠ {alertas.length} {alertas.length === 1 ? 'item' : 'itens'}</span>
        ) : (
          <span className="badge badge-success">✓ Tudo certo</span>
        )
      }
      className="dash-full-width"
    >
      {!hasAlerts ? (
        <div className="clean-state-block">
          <Icons.CheckCircle size={20} />
          <div>
            <div style={{ fontWeight: 'var(--font-bold)' }}>Nenhum problema encontrado</div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '0.15rem', opacity: 0.85 }}>
              A empresa não possui impedimentos ativos ou irregularidades nas bases consultadas.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {alertas.map((alerta, idx) => {
            const isCeis = alerta.titulo.toLowerCase().includes('ceis');
            const isCnep = alerta.titulo.toLowerCase().includes('cnep');
            const isPep = alerta.titulo.toLowerCase().includes('pep');
            const isMedia = alerta.titulo.toLowerCase().includes('mídia') || alerta.titulo.toLowerCase().includes('web');

            const isCritical = alerta.tipo === 'critical';

            return (
              <div
                key={idx}
                className={isCritical ? 'danger-state-block' : 'warn-state-block'}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flex: 1, minWidth: '240px' }}>
                  <div style={{ marginTop: '0.1rem', flexShrink: 0 }}>
                    {isCritical ? <Icons.AlertCircle size={18} /> : <Icons.AlertTriangle size={18} />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>
                      {alerta.titulo}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', marginTop: '0.15rem', opacity: 0.9 }}>
                      {alerta.texto}
                    </div>
                  </div>
                </div>

                <div style={{ flexShrink: 0 }}>
                  {isCeis && onOpenCeis && (
                    <Button variant="secondary" size="sm" onClick={onOpenCeis}>
                      Ver detalhes ➜
                    </Button>
                  )}
                  {isCnep && onOpenCnep && (
                    <Button variant="secondary" size="sm" onClick={onOpenCnep}>
                      Ver detalhes ➜
                    </Button>
                  )}
                  {isPep && onOpenSocios && (
                    <Button variant="secondary" size="sm" onClick={onOpenSocios}>
                      Verificar sócios ➜
                    </Button>
                  )}
                  {isMedia && onOpenMedia && (
                    <Button variant="secondary" size="sm" onClick={onOpenMedia}>
                      Ver notícias ➜
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
