// ==========================================================
// DILIGÊNCIA 360 — Componente Diligência Header (Compacto)
// ==========================================================

import React from 'react';
import { DiligenceItem } from '../types';
import { Formatters } from '../../../lib/formatters';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface DiligenceHeaderProps {
  diligence: DiligenceItem;
  onBack: () => void;
}

export const DiligenceHeader: React.FC<DiligenceHeaderProps> = ({
  diligence,
  onBack,
}) => {
  const { empresa } = diligence;
  const risco = diligence.risco || {
    score: 0,
    nivel: 'Atenção Baixa',
    cor: 'low' as const,
    decisao: 'Conforme',
    decisaoDesc: 'Sem pendências',
    emoji: '🟢',
    fatores: [],
  };

  const situacao = (empresa?.descricao_situacao_cadastral || 'ATIVA').toUpperCase();
  const situacaoVariant = situacao === 'ATIVA' ? 'success' : 'critical';
  const cor = risco.cor || 'low';

  const scoreTone = (risco.score ?? 0) > 45 ? 'high' : (risco.score ?? 0) > 15 ? 'medium' : 'low';

  return (
    <header className="diligence-page-header">
      <div className="diligence-page-toolbar">
        <Button variant="ghost" size="sm" icon={<Icons.ArrowLeft size={14} />} onClick={onBack}>
          Nova Consulta
        </Button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {diligence.persisted === false && (
            <Badge variant="medium">Rascunho local (Não salvo)</Badge>
          )}
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }} className="font-mono">
            Protocolo: {diligence.id}
          </span>
        </div>
      </div>

      <div className="dash-header-card animate-fade-in-down">
        <div className="dash-header-left">
          <span className="dash-header-eyebrow">Resultado da diligência</span>
          <div className="dash-header-title-row">
            <h1 className="dash-company-name">{diligence.razaoSocial}</h1>
            {empresa?.nome_fantasia && (
              <span className="dash-company-trading">({empresa.nome_fantasia})</span>
            )}
          </div>

          <div className="dash-header-meta-row">
            <div className="dash-header-meta-item">
              <span style={{ color: 'var(--text-muted)' }}>CNPJ:</span>
              <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 'var(--font-medium)' }}>
                {diligence.cnpjFmt}
              </span>
            </div>
            <div className="dash-header-meta-item">
              <Badge variant={situacaoVariant}>{situacao === 'ATIVA' ? '✓ Ativa' : situacao}</Badge>
            </div>
            <div className="dash-header-meta-item">
              <span style={{ color: 'var(--text-muted)' }}>Analisada em:</span>
              <span>{Formatters.dateTime(diligence.dataAnalise)}</span>
            </div>
          </div>
        </div>

        <div className="dash-header-right">
          <div className={`compact-score-widget compact-score-${scoreTone}`}>
            <div className="compact-score-number font-mono">
              <span className="compact-score-val">{risco.score ?? 0}</span>
              <span className="compact-score-max">/100</span>
            </div>
            <div className="compact-score-meta">
              <span className="compact-score-label">Nota de Risco</span>
              <Badge variant={cor}>{risco.nivel || 'Atenção Baixa'}</Badge>
              <span className="compact-score-help">Quanto menor, melhor</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
