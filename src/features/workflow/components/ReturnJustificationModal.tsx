// ==========================================================
// DILIGÊNCIA 360 — Modal de Justificativa de Devolução
// ==========================================================

import React, { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface ReturnJustificationModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (justification: string) => Promise<void>;
}

export const ReturnJustificationModal: React.FC<ReturnJustificationModalProps> = ({
  isOpen,
  isLoading,
  onClose,
  onSubmit,
}) => {
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onCloseRef = useRef(onClose);
  const isLoadingRef = useRef(isLoading);

  useEffect(() => {
    onCloseRef.current = onClose;
    isLoadingRef.current = isLoading;
  }, [isLoading, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    setJustification('');
    setError('');
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoadingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const reason = justification.trim();
    if (!reason) {
      setError('Descreva pelo menos uma pendência antes de devolver a diligência.');
      textareaRef.current?.focus();
      return;
    }
    setError('');
    await onSubmit(reason);
  };

  return createPortal(
    <div
      className="return-review-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="return-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isLoading}
      >
        <header className="return-review-header">
          <div className="return-review-emblem" aria-hidden="true">
            <Icons.ArrowLeft size={23} />
          </div>
          <div className="return-review-heading">
            <span>Revisão de Compliance</span>
            <h2 id={titleId}>Devolver para ajustes</h2>
            <p id={descriptionId}>Registre orientações objetivas para o analista corrigir a diligência antes da decisão final.</p>
          </div>
          <button
            type="button"
            className="return-review-close"
            aria-label="Fechar devolução para ajustes"
            onClick={onClose}
            disabled={isLoading}
          >
            <Icons.X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="return-review-form" onSubmit={handleSubmit}>
          <div className="return-review-flow" aria-label="Próxima etapa do fluxo">
            <div aria-hidden="true"><Icons.Info size={18} /></div>
            <p><strong>Próxima etapa</strong><span>A diligência volta ao analista com suas orientações e permanece registrada no histórico.</span></p>
            <div className="return-review-flow-chip" aria-hidden="true">
              <span>Revisão</span><Icons.ArrowRight size={14} /><strong>Analista</strong>
            </div>
          </div>

          <label className="return-review-field" htmlFor="return-review-justification">
            <span>Orientações para o analista</span>
            <small>Informe a pendência, onde ela aparece e qual correção você espera.</small>
            <textarea
              ref={textareaRef}
              id="return-review-justification"
              rows={5}
              placeholder="Ex.: revisar a documentação societária, anexar a fonte oficial e atualizar a conclusão do item..."
              value={justification}
              onChange={(event) => {
                setJustification(event.target.value);
                if (error) setError('');
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : descriptionId}
              disabled={isLoading}
            />
          </label>

          {error ? (
            <p id={errorId} className="return-review-error" role="alert">
              <Icons.AlertCircle size={16} aria-hidden="true" /> {error}
            </p>
          ) : null}

          <footer className="return-review-footer">
            <p><Icons.History size={15} aria-hidden="true" /> Esta ação ficará registrada na trilha da diligência.</p>
            <div>
              <Button
                type="button"
                variant="ghost"
                className="return-review-action return-review-action--cancel"
                onClick={onClose}
                disabled={isLoading}
              >
                Manter em revisão
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="return-review-action return-review-action--confirm"
                icon={<Icons.ArrowLeft size={16} aria-hidden="true" />}
                isLoading={isLoading}
              >
                Devolver para ajustes
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
};
