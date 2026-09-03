// ==========================================================
// DILIGÊNCIA 360 — Central de ajuda
// ==========================================================
// O tutorial tinha overlay, diálogo e botões próprios em
// components/help.css, com um botão flutuante que no celular ficava
// por cima do rodapé das telas. Agora usa o Modal do projeto, e o
// botão flutuante respeita a área segura do aparelho.
// ==========================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/cn';

const TOUR_STORAGE_KEY = 'diligencia360:onboarding:v1';

export const HelpCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  const steps = useMemo(
    () => [
      {
        eyebrow: 'Comece por aqui',
        title: 'Informe o CNPJ da empresa',
        description:
          'Na tela Nova diligência, digite ou cole o CNPJ. O sistema organiza as consultas e mostra o andamento de cada fonte.',
        icon: <Icons.Search size={22} aria-hidden="true" />,
      },
      {
        eyebrow: 'Leia primeiro',
        title: 'Confira a recomendação executiva',
        description:
          'O resumo destaca cadastro, bloqueios, cobertura e pontos que precisam de revisão. Comece pela decisão antes de abrir os detalhes.',
        icon: <Icons.Compass size={22} aria-hidden="true" />,
      },
      {
        eyebrow: 'Aprofunde quando necessário',
        title: 'Explore vínculos e hipóteses',
        description:
          'A rede de vínculos ajuda a entender relações societárias. Uma ligação é evidência de relacionamento, não conclusão automática de irregularidade.',
        icon: <Icons.Network size={22} aria-hidden="true" />,
      },
      {
        eyebrow: 'Feche a análise',
        title: 'Valide as evidências',
        description:
          'Use a aba Evidências para conferir fonte, data, cobertura e documentos antes de registrar a decisão ou baixar o dossiê.',
        icon: <Icons.Database size={22} aria-hidden="true" />,
      },
    ],
    [],
  );

  const remember = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    } catch {
      // O tutorial continua utilizável mesmo sem armazenamento local.
    }
  }, []);

  const close = useCallback(() => {
    remember();
    setIsOpen(false);
    setStep(0);
  }, [remember]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(TOUR_STORAGE_KEY)) setIsOpen(true);
    } catch {
      setIsOpen(false);
    }
  }, []);

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setIsOpen(true);
        }}
        aria-label="Abrir central de ajuda"
        className={cn(
          'z-toast fixed bottom-4 right-4 inline-flex items-center gap-2 rounded-chip border border-line bg-surface px-3.5 shadow-md transition-colors hover:bg-surface-hover',
          'min-h-[var(--control-height-md)] text-xs font-semibold text-ink-2',
          // Respeita a barra de gestos do aparelho.
          'mb-[env(safe-area-inset-bottom)]',
        )}
      >
        <Icons.Info size={16} aria-hidden="true" className="text-brand" />
        Ajuda
      </button>

      <Modal
        isOpen={isOpen}
        onClose={close}
        size="sm"
        title={current.title}
        subtitle={current.eyebrow}
        icon={current.icon}
        footer={
          <>
            <span className="mr-auto flex items-center gap-1.5" aria-label={`Etapa ${step + 1} de ${steps.length}`}>
              {steps.map((item, index) => (
                <span
                  key={item.title}
                  aria-hidden="true"
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    index === step ? 'w-5 bg-brand' : index < step ? 'w-1.5 bg-brand-line' : 'w-1.5 bg-line',
                  )}
                />
              ))}
            </span>

            <Button variant="ghost" onClick={() => setStep((v) => Math.max(0, v - 1))} disabled={step === 0}>
              Voltar
            </Button>
            <Button
              variant="primary"
              onClick={() => (last ? close() : setStep((v) => v + 1))}
              rightIcon={last ? undefined : <Icons.ArrowRight size={15} aria-hidden="true" />}
            >
              {last ? 'Concluir' : 'Próximo'}
            </Button>
          </>
        }
      >
        <p className="text-base leading-relaxed text-ink-2">{current.description}</p>
      </Modal>
    </>
  );
};
