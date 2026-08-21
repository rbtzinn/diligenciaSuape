// ==========================================================
// DILIGÊNCIA 360 — Seção de Mídia e Ocorrências Públicas (Dashboard)
// Resumo compacto, baixa poluição visual e visualização em drawer
// ==========================================================

import React from 'react';
import { AdverseMediaSummary, AdverseMediaStatus } from '../types';
import { AdverseMediaCard } from './AdverseMediaCard';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface AdverseMediaSectionProps {
  adverseMedia?: AdverseMediaSummary;
  onOpenDrawer: () => void;
  onStatusChange?: (id: string, newStatus: AdverseMediaStatus) => void;
}

export const AdverseMediaSection: React.FC<AdverseMediaSectionProps> = ({
  adverseMedia,
  onOpenDrawer,
  onStatusChange,
}) => {
  const results = adverseMedia?.results || [];
  const topResults = results.slice(0, 3);

  const renderBadge = () => {
    if (!adverseMedia) return <Badge variant="neutral">Não consultado</Badge>;
    if (adverseMedia.semChave) return <Badge variant="medium">Não configurado</Badge>;
    if (!adverseMedia.ok) return <Badge variant="critical">Indisponível</Badge>;
    if (results.length === 0) return <Badge variant="success">✓ Nenhuma encontrada</Badge>;
    if (adverseMedia.strongMatches > 0) return <Badge variant="critical">✕ {adverseMedia.strongMatches} grave(s)</Badge>;
    return <Badge variant="neutral">{results.length} resultado(s)</Badge>;
  };

  return (
    <Card
      title="Notícias Negativas na Internet"
      icon={<Icons.Globe size={16} />}
      action={renderBadge()}
      className="dash-full-width"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <div className="section-subtitle">
          Busca por notícias de corrupção, fraudes ou problemas envolvendo a empresa na web
        </div>

        {/* Caso sem chave ou sem resultados */}
        {(!adverseMedia || adverseMedia.semChave || results.length === 0) ? (
          <div>
            {adverseMedia?.semChave ? (
              <div className="warn-state-block">
                <Icons.AlertTriangle size={16} />
                <span>A busca de notícias não está configurada no servidor. Defina a chave BRAVE_SEARCH_API_KEY para ativar.</span>
              </div>
            ) : results.length === 0 ? (
              <div className="clean-state-block">
                <Icons.Check size={16} />
                <span>Nenhuma notícia negativa encontrada sobre esta empresa.</span>
              </div>
            ) : (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Consulta de busca não executada.</span>
            )}
          </div>
        ) : (
          <>
            {/* Faixa Resumo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
                  {adverseMedia.totalFound} resultado(s) analisado(s)
                </span>
                <span style={{ color: 'var(--border-strong)' }}>|</span>
                <span style={{ color: adverseMedia.strongMatches > 0 ? 'var(--status-high-text)' : 'var(--text-secondary)' }}>
                  {adverseMedia.strongMatches} diretamente ligada(s) à empresa
                </span>
                <span style={{ color: 'var(--border-strong)' }}>|</span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {adverseMedia.weakMatches} para verificar
                </span>
              </div>

              <Button variant="secondary" size="sm" onClick={onOpenDrawer}>
                Ver todas ({results.length}) ➜
              </Button>
            </div>

            {/* Lista com as principais ocorrências (Top 3) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {topResults.map((item) => (
                <AdverseMediaCard
                  key={item.id}
                  item={item}
                  onStatusChange={onStatusChange}
                />
              ))}
            </div>

            {results.length > 3 && (
              <div style={{ textAlign: 'center' }}>
                <Button variant="ghost" size="sm" onClick={onOpenDrawer}>
                  Ver todos os {results.length} resultados encontrados ➜
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};
