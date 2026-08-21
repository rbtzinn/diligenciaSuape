// ==========================================================
// DILIGÊNCIA 360 — Card de Resposta Executiva Integrado ao Chat
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

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-xl)',
        padding: '1.25rem',
        boxShadow: '0 4px 16px -2px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
      className="animate-fade-in-up"
    >
      {/* Topo da Resposta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
            {diligence.razaoSocial}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            <span className="font-mono">{diligence.cnpjFmt}</span>
            <span>•</span>
            <span>{empresa?.descricao_situacao_cadastral || 'Ativa'}</span>
            <span>•</span>
            <span>{empresa?.municipio || 'Recife'}/{empresa?.uf || 'PE'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
            }}
          >
            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>Score:</span>
            <span className="font-mono" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)' }}>
              {safeScore}/100
            </span>
          </div>
          <Badge variant={safeCor}>{safeLevel}</Badge>
        </div>
      </div>

      {/* Parecer Preliminar */}
      <div
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--bg-surface-subtle)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          lineHeight: 1.45,
          border: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontWeight: 'var(--font-semibold)', color: 'var(--text-primary)' }}>
          Recomendação de Integridade:{' '}
        </span>
        <span>{risco?.decisao || 'Conforme'} — {risco?.decisaoDesc || 'Nenhum impedimento preliminar vigente.'}</span>
      </div>

      {/* Botões de Gavetas Rápidas */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button type="button" className="claude-chip" onClick={() => onOpenDrawer('qsa')}>
          <Icons.Users size={13} />
          <span>QSA & Sócios ({socios?.length || 0})</span>
        </button>

        <button type="button" className="claude-chip" onClick={() => onOpenDrawer('sanctions')}>
          <Icons.Shield size={13} />
          <span>CEIS/CNEP ({sanctionsCount})</span>
        </button>

        <button type="button" className="claude-chip" onClick={() => onOpenDrawer('media')}>
          <Icons.Search size={13} />
          <span>Mídia Adversa ({mediaCount})</span>
        </button>

        <button type="button" className="claude-chip" onClick={() => onOpenDrawer('judicial')}>
          <Icons.Scale size={13} />
          <span>Processos DataJud ({processosDescobertos?.length || 0})</span>
        </button>
      </div>

      {/* Barra de Ações */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDownloadPdf}
          isLoading={isDownloading}
          icon={<Icons.FileText size={14} />}
        >
          {diligence.status === 'completed' ? 'Baixar Dossiê PDF' : 'Prévia em PDF'}
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={() => onOpenDashboard(diligence)}
          icon={<Icons.ArrowRight size={14} />}
        >
          Abrir Ficha Completa
        </Button>
      </div>
    </div>
  );
};
