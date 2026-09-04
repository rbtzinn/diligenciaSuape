// ==========================================================
// DILIGÊNCIA 360 — Devolução para ajustes
// ==========================================================
// Era a quinta cópia do mesmo laço de foco do projeto, mais 320
// linhas de CSS próprio em dossier-v3/return-review.css. Agora é um
// Modal, com o Escape bloqueado enquanto a devolução está em curso —
// detalhe que esta tela tinha e que vale manter, porque devolver é
// uma ação que muda o estado da diligência.
// ==========================================================

import React, { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Modal } from '../../../components/ui/Modal';
import { Note } from '../../../components/ui/Note';
import { TextArea } from '../../../components/ui/Field';

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
  const formId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cada abertura começa com o campo limpo: reaproveitar o texto de
  // uma devolução anterior seria pior do que pedir para redigitar.
  useEffect(() => {
    if (!isOpen) return;
    setJustification('');
    setError('');
  }, [isOpen]);

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={!isLoading}
      disableEscape={isLoading}
      title="Devolver para ajustes"
      subtitle="Revisão de Compliance"
      icon={<Icons.ArrowLeft size={17} aria-hidden="true" />}
      footer={
        <>
          <p className="mr-auto flex min-w-0 items-center gap-1.5 text-2xs text-ink-3">
            <Icons.History size={14} aria-hidden="true" className="shrink-0" />
            Esta ação ficará registrada na trilha da diligência.
          </p>

          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            Manter em revisão
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            icon={<Icons.ArrowLeft size={16} aria-hidden="true" />}
            isLoading={isLoading}
            loadingLabel="Devolvendo…"
          >
            Devolver para ajustes
          </Button>
        </>
      }
    >
      <p className="text-base leading-relaxed text-ink-2">
        Registre orientações objetivas para o analista corrigir a diligência antes da decisão final.
      </p>

      <Note tone="info" icon={<Icons.Info size={16} aria-hidden="true" />} title="Próxima etapa">
        <span className="block">
          A diligência volta ao analista com suas orientações e permanece registrada no histórico.
        </span>

        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-chip bg-surface px-2 py-0.5 text-2xs font-semibold">
          Revisão
          <Icons.ArrowRight size={12} aria-hidden="true" />
          <strong className="font-bold">Analista</strong>
        </span>
      </Note>

      <form id={formId} onSubmit={handleSubmit}>
        <TextArea
          ref={textareaRef}
          id="return-review-justification"
          label="Orientações para o analista"
          hint="Informe a pendência, onde ela aparece e qual correção você espera."
          rows={5}
          placeholder="Ex.: revisar a documentação societária, anexar a fonte oficial e atualizar a conclusão do item…"
          value={justification}
          onChange={(event) => {
            setJustification(event.target.value);
            if (error) setError('');
          }}
          error={error || undefined}
          disabled={isLoading}
        />
      </form>
    </Modal>
  );
};
