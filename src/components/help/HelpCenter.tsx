import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../ui/Icons';

const TOUR_STORAGE_KEY = 'diligencia360:onboarding:v1';

export const HelpCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  const steps = useMemo(() => [
    {
      eyebrow: 'Comece por aqui',
      title: 'Informe o CNPJ da empresa',
      description: 'Na tela Nova diligência, digite ou cole o CNPJ. O sistema organiza as consultas e mostra o andamento de cada fonte.',
      icon: <Icons.Search size={24} aria-hidden="true" />,
    },
    {
      eyebrow: 'Leia primeiro',
      title: 'Confira a recomendação executiva',
      description: 'O resumo destaca cadastro, bloqueios, cobertura e pontos que precisam de revisão. Comece pela decisão antes de abrir os detalhes.',
      icon: <Icons.Compass size={24} aria-hidden="true" />,
    },
    {
      eyebrow: 'Aprofunde quando necessário',
      title: 'Explore vínculos e hipóteses',
      description: 'A Rede de vínculos ajuda a entender relações societárias. Uma ligação é evidência de relacionamento, não conclusão automática de irregularidade.',
      icon: <Icons.Network size={24} aria-hidden="true" />,
    },
    {
      eyebrow: 'Feche a análise',
      title: 'Valide as evidências',
      description: 'Use a aba Evidências para conferir fonte, data, cobertura e documentos antes de registrar a decisão ou baixar o dossiê.',
      icon: <Icons.Database size={24} aria-hidden="true" />,
    },
  ], []);

  const rememberTour = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'seen');
    } catch {
      // O tutorial continua utilizável mesmo sem armazenamento local.
    }
  }, []);

  const closeTour = useCallback(() => {
    rememberTour();
    setIsOpen(false);
    setStep(0);
  }, [rememberTour]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(TOUR_STORAGE_KEY)) setIsOpen(true);
    } catch {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTour();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeTour, isOpen]);

  const openTour = () => {
    setStep(0);
    setIsOpen(true);
  };

  const currentStep = steps[step];

  return (
    <>
      <button type="button" className="help-fab" onClick={openTour} aria-label="Abrir central de ajuda">
        <Icons.Info size={19} aria-hidden="true" />
        <span>Ajuda</span>
      </button>

      {isOpen ? (
        <div className="help-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeTour();
        }}>
          <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <button type="button" className="help-close" onClick={closeTour} aria-label="Fechar tutorial">
              <Icons.X size={18} aria-hidden="true" />
            </button>

            <div className="help-step-visual">{currentStep.icon}</div>
            <span className="help-eyebrow">{currentStep.eyebrow}</span>
            <h2 id="help-title">{currentStep.title}</h2>
            <p>{currentStep.description}</p>

            <div className="help-progress" aria-label={`Etapa ${step + 1} de ${steps.length}`}>
              {steps.map((item, index) => (
                <span key={item.title} className={index <= step ? 'active' : ''} />
              ))}
            </div>

            <div className="help-actions">
              <button type="button" className="help-button-secondary" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
                Voltar
              </button>
              <button
                type="button"
                className="help-button-primary"
                onClick={() => step === steps.length - 1 ? closeTour() : setStep((value) => value + 1)}
              >
                {step === steps.length - 1 ? 'Concluir' : 'Próximo'}
                {step < steps.length - 1 ? <Icons.ArrowRight size={15} aria-hidden="true" /> : null}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
