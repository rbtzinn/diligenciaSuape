// ==========================================================
// DILIGÊNCIA 360 — Barra de workflow, autoria e PDF
// ==========================================================
// Era estilo em linha de ponta a ponta, e dois pontos apontavam para
// tokens que não existem no projeto: o botão "Aprovar e concluir"
// pedia `var(--color-success-600)` e continuava azul, e o aviso de
// hash pedia `var(--color-success-700)` e saía sem cor. O verde
// agora vem da variante `success` do botão, sobre o token de
// situação do sistema.
//
// A fita de ações rola em vez de quebrar, e a linha de autoria
// encolhe: em tela estreita a barra tinha cinco fileiras.
// ==========================================================

import React, { useState } from 'react';
import { DiligenceItem } from '../../diligence/types';
import type { StatusVariant } from '../../../types';
import { WorkflowService } from '../services/workflow.service';
import { ReportService } from '../../report/services/report.service';
import { ReturnJustificationModal } from './ReturnJustificationModal';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Toolbar } from '../../../components/ui/Toolbar';

interface WorkflowControlBarProps {
  diligence: DiligenceItem;
  onStatusChange: (newStatus: string) => void;
  showPdf?: boolean;
}

const STATUS: Record<string, { label: string; variant: StatusVariant }> = {
  in_progress: { label: 'Em execução', variant: 'info' },
  pending_review: { label: 'Aguardando revisão', variant: 'primary' },
  in_review: { label: 'Em revisão', variant: 'primary' },
  returned_for_adjustments: { label: 'Devolvida para ajustes', variant: 'medium' },
  completed: { label: 'Concluída', variant: 'success' },
  cancelled: { label: 'Cancelada', variant: 'critical' },
};

/** Par rótulo/valor da linha de autoria. */
const Who: React.FC<{ label: string; name: string }> = ({ label, name }) => (
  <span className="flex min-w-0 items-baseline gap-1.5 text-xs">
    <span className="shrink-0 text-ink-muted">{label}:</span>
    <span className="min-w-0 truncate font-medium text-ink">{name}</span>
  </span>
);

export const WorkflowControlBar: React.FC<WorkflowControlBarProps> = ({
  diligence,
  onStatusChange,
  showPdf = true,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [lastGeneratedHash, setLastGeneratedHash] = useState<string | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  const status = diligence.status || 'completed';
  const statusConfig = STATUS[status] || { label: status, variant: 'info' as StatusVariant };

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
    if (isPdfLoading) return;
    setIsPdfLoading(true);
    try {
      const result = await ReportService.downloadReport(diligence.id, isPreview, diligence);
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

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-3 shadow-xs">
      {/* ---- Situação e autoria ---- */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-ink-muted">Status:</span>
          <Badge variant={statusConfig.variant} size="sm">
            {statusConfig.label}
          </Badge>
        </span>

        <Who label="Analista" name={diligence.createdBy?.name || 'Responsável não registrado'} />
        {diligence.reviewedBy ? <Who label="Revisor" name={diligence.reviewedBy.name} /> : null}
      </div>

      {/* ---- Ações ---- */}
      <Toolbar aria-label="Ações do fluxo de revisão">
        {status === 'in_progress' || status === 'returned_for_adjustments' ? (
          <Button
            variant="primary"
            size="sm"
            isLoading={isLoading}
            rightIcon={<Icons.ArrowRight size={14} aria-hidden="true" />}
            onClick={() =>
              handleAction(async () => {
                const res = await WorkflowService.submitForReview(diligence.id);
                onStatusChange(res.status);
              })
            }
          >
            Enviar para revisão
          </Button>
        ) : null}

        {status === 'pending_review' ? (
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
            Iniciar revisão
          </Button>
        ) : null}

        {status === 'in_review' || status === 'pending_review' ? (
          <>
            <Button variant="secondary" size="sm" isLoading={isLoading} onClick={() => setIsReturnModalOpen(true)}>
              Devolver para ajustes
            </Button>

            <Button
              variant="success"
              size="sm"
              isLoading={isLoading}
              icon={<Icons.Check size={14} aria-hidden="true" />}
              onClick={() =>
                handleAction(async () => {
                  const res = await WorkflowService.approveAndComplete(diligence.id);
                  onStatusChange(res.status);
                })
              }
            >
              Aprovar e concluir
            </Button>
          </>
        ) : null}

        {showPdf && status === 'completed' ? (
          <Button
            variant="secondary"
            size="sm"
            isLoading={isPdfLoading}
            icon={<Icons.FileText size={14} aria-hidden="true" />}
            onClick={() => handleDownloadPdf(false)}
          >
            Baixar dossiê PDF
          </Button>
        ) : showPdf ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={isPdfLoading}
            icon={<Icons.FileText size={14} aria-hidden="true" />}
            onClick={() => handleDownloadPdf(true)}
            title="Gera documento de prévia com marca d'água não conclusiva"
          >
            Prévia PDF
          </Button>
        ) : null}
      </Toolbar>

      {/* ---- Comprovante de emissão ---- */}
      {lastGeneratedHash ? (
        <p className="flex min-w-0 animate-fade-in flex-wrap items-baseline gap-x-1.5 rounded-sm bg-ok-bg px-2.5 py-1.5 text-2xs text-ink-2">
          <strong className="font-bold text-ok-text">PDF emitido</strong>
          <span className="min-w-0 font-mono [overflow-wrap:anywhere]">SHA-256: {lastGeneratedHash}</span>
        </p>
      ) : null}

      <ReturnJustificationModal
        isOpen={isReturnModalOpen}
        isLoading={isLoading}
        onClose={() => setIsReturnModalOpen(false)}
        onSubmit={handleReturnSubmit}
      />
    </div>
  );
};
