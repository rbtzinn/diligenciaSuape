// ==========================================================
// DILIGÊNCIA 360 — Confirmação de saída
// ==========================================================
// Tinha 283 linhas de CSS próprio e a sua própria cópia do laço de
// foco. Agora é um Modal em papel de `alertdialog`, com o laço de
// foco vindo do Overlay — e com o Escape bloqueado enquanto a saída
// está em curso, que era um detalhe só desta tela e que valia manter.
// ==========================================================

import { useState, type RefObject } from 'react';
import { Icons } from '../ui/Icons';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Note } from '../ui/Note';

interface LogoutConfirmationDialogProps {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  /** Botão que abriu o diálogo: recebe o foco de volta ao fechar. */
  returnFocusRef: RefObject<HTMLButtonElement>;
}

export function LogoutConfirmationDialog({
  onCancel,
  onConfirm,
  returnFocusRef,
}: LogoutConfirmationDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError('Não foi possível encerrar a sessão. Tente novamente.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      role="alertdialog"
      size="sm"
      onClose={onCancel}
      // Enquanto encerra, fechar por fora ou por Escape deixaria a
      // sessão num estado indefinido.
      closeOnBackdropClick={!submitting}
      disableEscape={submitting}
      showCloseButton={false}
      returnFocusTo={returnFocusRef}
      title="Encerrar sua sessão?"
      subtitle="Sessão protegida"
      icon={<Icons.LogOut size={17} aria-hidden="true" />}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            Continuar no sistema
          </Button>
          <Button
            variant="danger"
            onClick={() => void confirm()}
            isLoading={submitting}
            loadingLabel="Encerrando…"
            icon={<Icons.LogOut size={16} aria-hidden="true" />}
          >
            Encerrar sessão
          </Button>
        </>
      }
    >
      <p className="text-base leading-relaxed text-ink-2">
        Você precisará entrar novamente para acessar as diligências e continuar suas análises.
      </p>

      <Note tone="neutral" icon={<Icons.ShieldCheck size={16} aria-hidden="true" />}>
        A sessão será encerrada somente neste dispositivo.
      </Note>

      {error ? (
        <Note tone="high" role="alert" icon={<Icons.AlertCircle size={16} aria-hidden="true" />}>
          {error}
        </Note>
      ) : null}
    </Modal>
  );
}
