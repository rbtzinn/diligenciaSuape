// ==========================================================
// DILIGÊNCIA 360 — Card de Resposta Executiva Integrado ao Chat
// Design Moderno, Corporativo e Refinado
// ==========================================================

import React, { useState } from 'react';
import { DiligenceItem } from '../../diligence/types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { ReportService } from '../../report/services/report.service';

interface ChatDiligenceResultCardProps {
  diligence: DiligenceItem;
  onOpenDashboard: (item: DiligenceItem) => void;
  onOpenDrawer: (type: 'qsa' | 'sanctions' | 'media' | 'judicial') => void;
}

export const ChatDiligenceResultCard: React.FC<ChatDiligenceResultCardProps> = ({
  diligence,
  onOpenDashboard,
  onOpenDrawer,
}) => {
  const { risco, empresa, socios, ceis, cnep, adverseMedia, processosDescobertos } = diligence;
  const [isDownloading, setIsDownloading] = useState(false);

  const safeScore = risco?.score ?? 0;
  const safeLevel = risco?.nivel || 'Atenção Baixa';
  const safeCor = risco?.cor || 'low';

  const mediaCount = adverseMedia?.results?.length ?? (adverseMedia?.totalFound ?? 0);
  const sanctionsCount = (ceis?.registros?.length || 0) + (cnep?.registros?.length || 0);
  const sociosCount = socios?.length || 0;
  const judicialCount = processosDescobertos?.length || 0;

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      const isPreview = diligence.status !== 'completed';
      await ReportService.downloadReport(diligence.id, isPreview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao baixar relatório.';
      alert(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  const isAtiva = (empresa?.descricao_situacao_cadastral || 'ATIVA').toUpperCase().includes('ATIVA');

  return (
    <div className="diligence-result-card animate-fade-in-up">
      {/* Topo do Card: Nome da Empresa, CNPJ e Scores */}
      <div className="diligence-card-header">
        <div className="diligence-company-info">
          <h2 className="diligence-company-title">
            {diligence.razaoSocial}
          </h2>

          <div className="diligence-meta-row">
            <span className="diligence-cnpj-badge font-mono">{diligence.cnpjFmt}</span>
            <span className="diligence-meta-dot">•</span>
            <span className={`diligence-status-pill ${isAtiva ? 'active' : 'inactive'}`}>
              <span className="diligence-status-dot" />
              {empresa?.descricao_situacao_cadastral || 'ATIVA'}
            </span>
            <span className="diligence-meta-dot">•</span>
            <span className="diligence-location">
              {empresa?.municipio || 'Recife'}/{empresa?.uf || 'PE'}
            </span>
          </div>
        </div>

        {/* Badges de Score e Nível de Risco */}
        <div className="diligence-score-box">
          <div className="diligence-score-pill">
            <span className="diligence-score-label">Score:</span>
            <span className="diligence-score-val font-mono">{safeScore}/100</span>
          </div>
          <Badge variant={safeCor} className="diligence-level-badge">{safeLevel}</Badge>
        </div>
      </div>

      {/* Parecer / Recomendação de Integridade */}
      <div className="diligence-recommendation-box">
        <div className="diligence-recommendation-icon">
          {safeScore > 50 ? (
            <Icons.AlertTriangle size={16} />
          ) : (
            <Icons.ShieldCheck size={16} />
          )}
        </div>
        <div className="diligence-recommendation-text">
          <strong>Recomendação de Integridade:</strong>{' '}
          <span>{risco?.decisao || 'Prosseguir para as Demais Etapas'} — {risco?.decisaoDesc || 'Nenhum impedimento identificado nas fontes consultadas até o momento. Prosseguir para as demais etapas da diligência.'}</span>
        </div>
      </div>

      {/* Chips de Acesso Rápido às Gavetas de Evidências */}
      <div className="diligence-chips-grid">
        <button
          type="button"
          className="claude-chip chip-qsa"
          onClick={() => onOpenDrawer('qsa')}
          title="Ver Quadro Societário e Sócios"
        >
          <div className="chip-icon-box">
            <Icons.Users size={14} />
          </div>
          <span className="chip-title">QSA & Sócios</span>
          <span className="chip-counter">{sociosCount}</span>
        </button>

        <button
          type="button"
          className="claude-chip chip-sanctions"
          onClick={() => onOpenDrawer('sanctions')}
          title="Ver Sanções Administrativas CEIS/CNEP"
        >
          <div className="chip-icon-box">
            <Icons.ShieldAlert size={14} />
          </div>
          <span className="chip-title">CEIS/CNEP</span>
          <span className="chip-counter">{sanctionsCount}</span>
        </button>

        <button
          type="button"
          className="claude-chip chip-media"
          onClick={() => onOpenDrawer('media')}
          title="Ver ocorrências públicas da empresa e das pessoas"
        >
          <div className="chip-icon-box">
            <Icons.Search size={14} />
          </div>
          <span className="chip-title">Ocorrências Públicas</span>
          <span className="chip-counter">{mediaCount}</span>
        </button>

        <button
          type="button"
          className="claude-chip chip-judicial"
          onClick={() => onOpenDrawer('judicial')}
          title="Ver Processos Judiciais no DataJud"
        >
          <div className="chip-icon-box">
            <Icons.Scale size={14} />
          </div>
          <span className="chip-title">Processos DataJud</span>
          <span className="chip-counter">{judicialCount}</span>
        </button>
      </div>

      {/* Barra de Ações Inferior */}
      <div className="diligence-card-footer">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownloadPdf}
          isLoading={isDownloading}
          icon={<Icons.FileText size={14} />}
          className="diligence-btn-secondary"
        >
          {diligence.status === 'completed' ? 'Baixar Dossiê PDF' : 'Prévia em PDF'}
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={() => onOpenDashboard(diligence)}
          icon={<Icons.ArrowRight size={14} />}
          className="diligence-btn-primary"
        >
          Abrir Ficha Completa
        </Button>
      </div>
    </div>
  );
};
