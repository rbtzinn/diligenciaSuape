import React from 'react';
import type { DiligenceItem } from '../types';
import { Formatters } from '../../../lib/formatters';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface DiligenceHeaderProps {
  diligence: DiligenceItem;
  onBack: () => void;
}

export const DiligenceHeader: React.FC<DiligenceHeaderProps> = ({ diligence, onBack }) => {
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
  const situacao = (empresa?.descricao_situacao_cadastral || 'NÃO INFORMADA').toUpperCase();
  const isActive = situacao === 'ATIVA';
  const scoreTone = (risco.score ?? 0) >= 60
    ? 'critical'
    : (risco.score ?? 0) >= 35
      ? 'high'
      : (risco.score ?? 0) >= 15
        ? 'medium'
        : 'low';

  return (
    <header className="dossier-masthead">
      <div className="dossier-masthead-toolbar">
        <Button variant="ghost" size="sm" icon={<Icons.ArrowLeft size={14} aria-hidden="true" />} onClick={onBack}>
          Nova Consulta
        </Button>
        <div className="dossier-protocol">
          {diligence.persisted === false ? <Badge variant="medium">Rascunho Local</Badge> : <span className="dossier-saved-dot">Salvo</span>}
          <span className="font-mono" translate="no">{diligence.id}</span>
        </div>
      </div>

      <div className="dossier-masthead-card">
        <div className="dossier-brand-lockup" aria-label="Compliance SUAPE">
          <img
            src="/assets/Marca_Compliance_Suape_Compliance_Suape - H.png"
            alt="Compliance SUAPE"
            width={842}
            height={596}
          />
        </div>

        <div className="dossier-masthead-rule" aria-hidden="true" />

        <div className="dossier-entity-block">
          <span className="dossier-entity-eyebrow">Dossiê de Integridade</span>
          <div className="dossier-entity-title-row">
            <h1>{diligence.razaoSocial}</h1>
            {empresa?.nome_fantasia ? <span>{empresa.nome_fantasia}</span> : null}
          </div>
          <div className="dossier-entity-meta">
            <span className="font-mono" translate="no">CNPJ {diligence.cnpjFmt}</span>
            <span>•</span>
            <span>{empresa?.municipio || 'Município não informado'} / {empresa?.uf || 'UF'}</span>
            <span>•</span>
            <Badge variant={isActive ? 'success' : 'critical'}>{isActive ? 'Cadastro Ativo' : situacao}</Badge>
            <span>•</span>
            <span>{Formatters.dateTime(diligence.dataAnalise)}</span>
          </div>
        </div>

        <div className={`dossier-risk-index dossier-risk-index-${scoreTone}`}>
          <span>Índice de Atenção</span>
          <div><strong>{risco.score ?? 0}</strong><small>/100</small></div>
          <p>{risco.nivel || 'Atenção Baixa'}</p>
        </div>
      </div>
    </header>
  );
};
