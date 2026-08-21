// ==========================================================
// DILIGÊNCIA 360 — Componente Diligência Result Card
// ==========================================================

import React from 'react';
import { DiligenceItem } from '../types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface DiligenceResultCardProps {
  diligence: DiligenceItem;
  onOpenDashboard: (diligence: DiligenceItem) => void;
  onNewSearch: () => void;
}

export const DiligenceResultCard: React.FC<DiligenceResultCardProps> = ({
  diligence,
  onOpenDashboard,
  onNewSearch,
}) => {
  const { empresa, socios } = diligence;
  const risco = diligence.risco || {
    score: 0,
    nivel: 'Atenção Baixa',
    cor: 'low' as const,
    decisao: 'Conforme',
    decisaoDesc: 'Sem pendências',
    emoji: '🟢',
    fatores: [],
  };

  const cor = risco.cor || 'low';

  return (
    <div className="result-banner-card animate-fade-in-up">
      <div className="result-banner-top">
        <div>
          <div className="result-company-name">{diligence.razaoSocial}</div>
          <div className="result-company-meta">
            <span className="font-mono">{diligence.cnpjFmt}</span>
            <span>•</span>
            <span>{empresa?.descricao_situacao_cadastral || 'Situação Ativa'}</span>
          </div>
        </div>
        <Badge variant={cor}>
          <span>{risco.nivel || 'Atenção Baixa'}</span>
        </Badge>
      </div>

      <div className="result-banner-items">
        <div className="result-banner-item">
          <Icons.Scale size={14} />
          <span>
            Score de Risco: <strong>{risco.score ?? 0}/100</strong>
          </span>
        </div>
        <div className="result-banner-item">
          <Icons.Users size={14} />
          <span>
            Quadro Societário: <strong>{socios?.length || 0} sócio(s)</strong>
          </span>
        </div>
        <div className="result-banner-item">
          <Icons.ShieldCheck size={14} />
          <span>
            Decisão: <strong>{risco.decisao || 'Conforme'}</strong>
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button variant="secondary" size="md" onClick={onNewSearch}>
          Nova Consulta
        </Button>
        <Button
          variant="primary"
          size="md"
          icon={<Icons.ArrowRight size={16} />}
          onClick={() => onOpenDashboard(diligence)}
        >
          Ver Relatório Completo
        </Button>
      </div>
    </div>
  );
};
