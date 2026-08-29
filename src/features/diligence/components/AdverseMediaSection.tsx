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
  onRefresh?: () => void;
  isRefreshing?: boolean;
  refreshNotice?: string | null;
}

export const AdverseMediaSection: React.FC<AdverseMediaSectionProps> = ({
  adverseMedia,
  onOpenDrawer,
  onStatusChange,
  onRefresh,
  isRefreshing = false,
  refreshNotice,
}) => {
  const results = adverseMedia?.results || [];
  const companyCount = adverseMedia?.companyResultsCount ?? results.filter((item) => item.subjectType !== 'person').length;
  const personCount = adverseMedia?.personResultsCount ?? results.filter((item) => item.subjectType === 'person').length;
  const peopleSearched = adverseMedia?.peopleSearched || 0;
  const riskRelevantCount = adverseMedia?.riskRelevantCount ?? results.filter((item) => item.riskRelevant !== false).length;
  const generalMentionsCount = adverseMedia?.generalMentionsCount ?? results.filter((item) => item.riskRelevant === false).length;
  const priority: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const topResults = [...results]
    .sort((a, b) => {
      const relevanceOrder = Number(b.riskRelevant !== false) - Number(a.riskRelevant !== false);
      const subjectOrder = Number(b.subjectType === 'person') - Number(a.subjectType === 'person');
      return relevanceOrder || subjectOrder || (priority[a.matchStrength] - priority[b.matchStrength]);
    })
    .slice(0, 3);

  const renderBadge = () => {
    if (!adverseMedia) return <Badge variant="neutral">Não consultado</Badge>;
    if (adverseMedia.semChave) return <Badge variant="medium">Não configurado</Badge>;
    if (!adverseMedia.ok) return <Badge variant="critical">Indisponível</Badge>;
    if (adverseMedia.consultaParcial) return <Badge variant="medium">Consulta parcial</Badge>;
    if (results.length === 0) return <Badge variant="success">Pesquisa concluída</Badge>;
    return <Badge variant="medium">{riskRelevantCount} com termos · {generalMentionsCount} gerais</Badge>;
  };

  return (
    <Card
      title="Publicações e Ocorrências: Empresa e Pessoas"
      icon={<Icons.Globe size={16} />}
      action={renderBadge()}
      className="dash-full-width"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <div className="section-subtitle">
          A busca reúne notícias gerais e conteúdos com termos de atenção. Somente estes últimos podem influenciar o risco, sempre após correlação e revisão.
        </div>
        {onRefresh ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={onRefresh} disabled={isRefreshing}>
              {isRefreshing ? 'Atualizando notícias…' : 'Atualizar notícias'}
            </Button>
            {refreshNotice ? (
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-2xs)' }} role="status">
                {refreshNotice}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Caso sem chave ou sem resultados */}
        {(!adverseMedia || adverseMedia.semChave || results.length === 0) ? (
          <div>
            {adverseMedia?.semChave ? (
              <div className="warn-state-block">
                <Icons.AlertTriangle size={16} />
                <span>A fonte de pesquisa pública não está disponível no servidor.</span>
              </div>
            ) : results.length === 0 && adverseMedia?.consultaParcial ? (
              <div className="warn-state-block">
                <Icons.AlertTriangle size={16} />
                <span>{adverseMedia.aviso || 'A consulta foi parcial. Zero resultados não significa ausência de notícias.'}</span>
              </div>
            ) : results.length === 0 ? (
              <div className="clean-state-block">
                <Icons.Check size={16} />
                <span>
                  {peopleSearched > 0
                    ? `Nenhum resultado foi localizado nas fontes consultadas para a empresa e para os nomes dos ${peopleSearched} integrante(s) pesquisado(s).`
                    : 'Nenhum resultado foi localizado nas fontes consultadas para a empresa. A busca individual de pessoas não consta nesta diligência antiga.'}
                </span>
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
                  {adverseMedia.totalFound} publicação(ões) única(s)
                </span>
                <span style={{ color: 'var(--border-strong)' }}>|</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {riskRelevantCount} com termos de atenção
                </span>
                <span style={{ color: 'var(--border-strong)' }}>|</span>
                <span style={{ color: personCount > 0 ? 'var(--status-medium-text)' : 'var(--text-tertiary)' }}>
                  {generalMentionsCount} menção(ões) geral(is) · {companyCount} empresa · {personCount} pessoa(s)
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
