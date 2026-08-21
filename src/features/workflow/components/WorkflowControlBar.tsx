// ==========================================================
// DILIGÊNCIA 360 — Barra de Controle de Workflow, Autoria & PDF
// ==========================================================

import React, { useState } from 'react';
import { DiligenceItem } from '../../diligence/types';
import { useAuth } from '../../auth/context/AuthContext';
import { WorkflowService } from '../services/workflow.service';
import { ReportService } from '../../report/services/report.service';
import { ReturnJustificationModal } from './ReturnJustificationModal';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface WorkflowControlBarProps {
  diligence: DiligenceItem;
  onStatusChange: (newStatus: string) => void;
}

export const WorkflowControlBar: React.FC<WorkflowControlBarProps> = ({
  diligence,
  onStatusChange,
}) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [lastGeneratedHash, setLastGeneratedHash] = useState<string | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  const status = diligence.status || 'completed';
  const role = user?.role || 'viewer';

  const statusMap: Record<string, { label: string; variant: 'info' | 'primary' | 'medium' | 'success' | 'critical' }> = {
    in_progress: { label: 'EM EXECUÇÃO', variant: 'info' },
    pending_review: { label: 'AGUARDANDO REVISÃO', variant: 'primary' },
    in_review: { label: 'EM REVISÃO', variant: 'primary' },
    returned_for_adjustments: { label: 'DEVOLVIDA P/ AJUSTES', variant: 'medium' },
    completed: { label: 'CONCLUÍDA', variant: 'success' },
    cancelled: { label: 'CANCELADA', variant: 'critical' },
  };

  const currentStatusConfig = statusMap[status] || { label: status.toUpperCase(), variant: 'info' };

  const handleAction = async (actionFn: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await actionFn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na transição de estado.';
      alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async (isPreview = false) => {
    setIsPdfLoading(true);
    try {
      const result = await ReportService.downloadReport(diligence.id, isPreview);
      setLastGeneratedHash(result.hash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao gerar o dossiê PDF.';
      alert(msg);
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleReturnSubmit = async (justification: string) => {
    await handleAction(async () => {
      const res = await WorkflowService.returnForAdjustments(diligence.id, justification);
      onStatusChange(res.status);
      setIsReturnModalOpen(false);
    });
  };

  const isAnalystOrAdmin = role === 'analyst' || role === 'admin';
  const isReviewerOrAdmin = role === 'reviewer' || role === 'admin';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.875rem 1.25rem',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Status:</span>
            <Badge variant={currentStatusConfig.variant}>{currentStatusConfig.label}</Badge>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-muted)' }}>Analista:</span>
            <span style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>
              {diligence.createdBy?.name || 'Responsável não registrado'}
            </span>
          </div>

          {diligence.reviewedBy && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Revisor:</span>
              <span style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>
                {diligence.reviewedBy.name}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {isAnalystOrAdmin && (status === 'in_progress' || status === 'returned_for_adjustments') && (
            <Button
              variant="primary"
              size="sm"
              isLoading={isLoading}
              onClick={() =>
                handleAction(async () => {
                  const res = await WorkflowService.submitForReview(diligence.id);
                  onStatusChange(res.status);
                })
              }
            >
              Enviar para Revisão ➜
            </Button>
          )}

          {isReviewerOrAdmin && status === 'pending_review' && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={isLoading}
              onClick={() =>
                handleAction(async () => {
                  const res = await WorkflowService.startReview(diligence.id);
                  onStatusChange(res.status);
                })
              }
            >
              Iniciar Revisão
            </Button>
          )}

          {isReviewerOrAdmin && (status === 'in_review' || status === 'pending_review') && (
            <>
              <Button
                variant="secondary"
                size="sm"
                isLoading={isLoading}
                onClick={() => setIsReturnModalOpen(true)}
              >
                Devolver para Ajustes
              </Button>

              <Button
                variant="primary"
                size="sm"
                isLoading={isLoading}
                onClick={() =>
                  handleAction(async () => {
                    const res = await WorkflowService.approveAndComplete(diligence.id);
                    onStatusChange(res.status);
                  })
                }
                style={{ backgroundColor: 'var(--color-success-600)', borderColor: 'var(--color-success-600)' }}
              >
                <Icons.Check size={14} style={{ marginRight: '0.35rem' }} />
                Aprovar e Concluir
              </Button>
            </>
          )}

          {status === 'completed' ? (
            <Button
              variant="secondary"
              size="sm"
              isLoading={isPdfLoading}
              onClick={() => handleDownloadPdf(false)}
            >
              <Icons.FileText size={14} style={{ marginRight: '0.35rem' }} />
              Baixar Dossiê PDF
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              isLoading={isPdfLoading}
              onClick={() => handleDownloadPdf(true)}
              title="Gera documento de prévia com marca d'água não conclusiva"
            >
              <Icons.FileText size={14} style={{ marginRight: '0.35rem' }} />
              Prévia PDF
            </Button>
          )}
        </div>
      </div>

      {lastGeneratedHash && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-surface-subtle)',
            padding: '0.35rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
          }}
          className="animate-fade-in"
        >
          <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-success-700)' }}>✓ PDF Emitido:</span>
          <span className="font-mono">SHA-256: {lastGeneratedHash}</span>
        </div>
      )}

      <ReturnJustificationModal
        isOpen={isReturnModalOpen}
        isLoading={isLoading}
        onClose={() => setIsReturnModalOpen(false)}
        onSubmit={handleReturnSubmit}
      />
    </div>
  );
};
