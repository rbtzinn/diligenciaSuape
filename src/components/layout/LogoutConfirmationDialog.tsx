import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../ui/Icons';

interface LogoutConfirmationDialogProps {
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  returnFocusRef: RefObject<HTMLButtonElement>;
}

const FOCUSABLE_ELEMENTS = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function LogoutConfirmationDialog({
  onCancel,
  onConfirm,
  returnFocusRef,
}: LogoutConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = 'hidden';
    stayButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingRef.current) {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS) ?? [],
      );

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusElement?.focus();
    };
  }, [onCancel, returnFocusRef]);

  const handleConfirm = async () => {
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onConfirm();
    } catch {
      isSubmittingRef.current = false;
      setErrorMessage('Não foi possível encerrar a sessão. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="logout-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="logout-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-dialog-title"
        aria-describedby="logout-dialog-description"
      >
        <div className="logout-dialog-accent" aria-hidden="true" />

        <button
          type="button"
          className="logout-dialog-close"
          onClick={onCancel}
          aria-label="Continuar no sistema"
          disabled={isSubmitting}
        >
          <Icons.X size={18} aria-hidden="true" />
        </button>

        <div className="logout-dialog-icon" aria-hidden="true">
          <Icons.LogOut size={26} />
        </div>

        <div className="logout-dialog-copy">
          <span className="logout-dialog-eyebrow">Sessão protegida</span>
          <h2 id="logout-dialog-title">Encerrar sua sessão?</h2>
          <p id="logout-dialog-description">
            Você precisará entrar novamente para acessar as diligências e continuar suas análises.
          </p>
        </div>

        <div className="logout-dialog-note">
          <Icons.ShieldCheck size={18} aria-hidden="true" />
          <span>A sessão será encerrada somente neste dispositivo.</span>
        </div>

        {errorMessage ? (
          <p className="logout-dialog-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="logout-dialog-actions">
          <button
            ref={stayButtonRef}
            type="button"
            className="logout-dialog-action logout-dialog-action--stay"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Continuar no sistema
          </button>
          <button
            type="button"
            className="logout-dialog-action logout-dialog-action--exit"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Icons.Loader size={17} aria-hidden="true" />
                Encerrando...
              </>
            ) : (
              <>
                <Icons.LogOut size={17} aria-hidden="true" />
                Encerrar sessão
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
