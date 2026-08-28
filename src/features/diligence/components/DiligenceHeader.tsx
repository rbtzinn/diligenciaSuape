import React from 'react';
import type { DiligenceItem } from '../types';
import { Formatters } from '../../../lib/formatters';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface DiligenceHeaderProps {
  diligence: DiligenceItem;
  onBack?: () => void;
  onExportPdf: () => void;
  onEditRisk: () => void;
  isExportingPdf: boolean;
}

export const DiligenceHeader: React.FC<DiligenceHeaderProps> = ({
  diligence,
  onBack,
  onExportPdf,
  onEditRisk,
  isExportingPdf,
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
  const situacao = (empresa?.descricao_situacao_cadastral || 'NÃO INFORMADA').toUpperCase();
  const isActive = situacao === 'ATIVA';
  const scoreTone = (risco.score ?? 0) >= 60
    ? 'critical'
    : (risco.score ?? 0) >= 35
      ? 'high'
      : (risco.score ?? 0) >= 15
        ? 'medium'
        : 'low';
  const safeScore = Math.max(0, Math.min(100, risco.score ?? 0));
  const automaticScore = risco.manualOverride?.automaticScore ?? risco.automaticScore ?? safeScore;
  const riskStyle = {
    '--risk-angle': `${safeScore * 3.6}deg`,
  } as React.CSSProperties;

  return (
    <header className="dossier-masthead">
      <div className="dossier-masthead-card">
        {onBack ? (
          <button type="button" className="dossier-back-button" onClick={onBack} aria-label="Voltar para nova diligência">
            <Icons.ArrowLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <div className="dossier-entity-block">
          <span className="dossier-entity-eyebrow">Dossiê de integridade · visão consolidada</span>
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
            <span className="dossier-protocol">
              {diligence.persisted === false ? <Badge variant="medium">Rascunho local</Badge> : <span className="dossier-saved-dot">Salvo</span>}
              <span className="font-mono" translate="no" title={diligence.id}>Protocolo {diligence.id}</span>
            </span>
            <span>•</span>
            <span>{Formatters.dateTime(diligence.dataAnalise)}</span>
          </div>
        </div>

        <div className="dossier-masthead-actions-group">
          <details className={`dossier-risk-index dossier-risk-index-${scoreTone}`}>
            <summary aria-label={`Índice de atenção: ${safeScore} de 100, ${risco.nivel || 'Atenção Baixa'}`}>
              <div className="dossier-risk-gauge" style={riskStyle} aria-hidden="true">
                <strong>{safeScore}</strong>
                <small>/100</small>
              </div>
              <div className="dossier-risk-copy">
                <span>Índice de atenção</span>
                <p>{risco.nivel || 'Atenção Baixa'}</p>
                <small>Como calculamos</small>
              </div>
              <Icons.ChevronDown className="dossier-risk-chevron" size={15} aria-hidden="true" />
            </summary>
            <div className="dossier-risk-popover">
              <span className="dossier-risk-popover-kicker">Como calculamos</span>
              <strong>Índice de atenção</strong>
              <p>{risco.decisaoDesc || 'Quanto maior o índice, maior a necessidade de análise humana.'}</p>
              {risco.manualOverride ? (
                <div className="dossier-risk-comparison">
                  <span>Automático <strong>{automaticScore}/100</strong></span>
                  <Icons.ArrowRight size={13} aria-hidden="true" />
                  <span>Após análise <strong>{safeScore}/100</strong></span>
                </div>
              ) : null}
              {risco.manualOverride?.reason ? (
                <small><strong>Ajuste humano:</strong> {risco.manualOverride.reason}</small>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                onClick={onEditRisk}
                disabled={diligence.persisted === false}
                title={diligence.persisted === false ? 'A diligência precisa estar sincronizada com o Google Sheets.' : undefined}
              >
                Ajustar índice
              </Button>
            </div>
          </details>

          <div className="dossier-header-actions">
            <Button
              variant="secondary"
              size="md"
              icon={isExportingPdf ? <Icons.Loader size={15} aria-hidden="true" /> : <Icons.Download size={15} aria-hidden="true" />}
              onClick={onExportPdf}
              disabled={isExportingPdf}
            >
              {isExportingPdf ? 'Gerando…' : diligence.status === 'completed' ? 'Baixar Dossiê PDF' : 'Baixar Prévia PDF'}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
