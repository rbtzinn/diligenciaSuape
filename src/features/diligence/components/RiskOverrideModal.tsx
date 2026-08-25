import React, { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import type { RiskAssessment } from '../types';

interface RiskOverrideModalProps {
  isOpen: boolean;
  risk: RiskAssessment;
  isSaving?: boolean;
  onClose: () => void;
  onSubmit: (payload: { score: number; level: string; justification: string }) => Promise<void>;
}

const LEVELS = [
  {
    level: 'Atenção Baixa',
    short: 'Baixa',
    min: 0,
    max: 14,
    tone: 'low',
    copy: 'Monitoramento ordinário e registro das limitações conhecidas.',
  },
  {
    level: 'Atenção Moderada',
    short: 'Moderada',
    min: 15,
    max: 34,
    tone: 'moderate',
    copy: 'Há sinais ou lacunas que pedem análise complementar documentada.',
  },
  {
    level: 'Atenção Elevada',
    short: 'Elevada',
    min: 35,
    max: 59,
    tone: 'elevated',
    copy: 'A exposição é relevante e exige aprofundamento antes de avançar.',
  },
  {
    level: 'Atenção Crítica',
    short: 'Crítica',
    min: 60,
    max: 100,
    tone: 'critical',
    copy: 'A exposição acumulada pede mitigação e decisão formal do comitê.',
  },
] as const;

function getLevel(level?: string, score?: number) {
  const byName = LEVELS.find((item) => item.level === level);
  if (byName) return byName;
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  return LEVELS.find((item) => safeScore >= item.min && safeScore <= item.max) || LEVELS[0];
}

function clampToLevel(score: number, level: (typeof LEVELS)[number]) {
  return Math.max(level.min, Math.min(level.max, Math.round(score)));
}

export const RiskOverrideModal: React.FC<RiskOverrideModalProps> = ({
  isOpen,
  risk,
  isSaving = false,
  onClose,
  onSubmit,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const isSavingRef = useRef(isSaving);
  const initialLevel = getLevel(risk.nivel, risk.score);
  const [level, setLevel] = useState<string>(initialLevel.level);
  const [score, setScore] = useState(clampToLevel(risk.score, initialLevel));
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');

  const selectedLevel = useMemo(() => getLevel(level, score), [level, score]);
  const automaticScore = risk.manualOverride?.automaticScore ?? risk.automaticScore ?? risk.score ?? 0;
  const automaticLevel = risk.manualOverride?.automaticLevel
    || getLevel(undefined, automaticScore).level;
  const adjustment = score - automaticScore;

  useEffect(() => {
    onCloseRef.current = onClose;
    isSavingRef.current = isSaving;
  }, [isSaving, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const nextLevel = getLevel(risk.nivel, risk.score);
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    setLevel(nextLevel.level);
    setScore(clampToLevel(risk.score, nextLevel));
    setJustification('');
    setError('');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSavingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus();
    };
  }, [isOpen, risk.nivel, risk.score]);

  if (!isOpen) return null;

  const selectLevel = (nextLevel: (typeof LEVELS)[number]) => {
    setLevel(nextLevel.level);
    setScore((current) => clampToLevel(current, nextLevel));
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const reason = justification.trim();
    if (reason.length < 10) {
      setError('Explique em pelo menos 10 caracteres quais sinais, hipóteses ou lacunas sustentam a decisão.');
      return;
    }
    setError('');
    try {
      await onSubmit({ score, level: selectedLevel.level, justification: reason });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível registrar a classificação.');
    }
  };

  return createPortal(
    <div
      className="risk-override-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="risk-override-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="risk-override-header">
          <div className="risk-override-emblem" aria-hidden="true"><Icons.ShieldAlert size={24} /></div>
          <div>
            <span>Decisão humana • Compliance SUAPE</span>
            <h2 id={titleId}>Definir classificação final de risco</h2>
            <p id={descriptionId}>O cálculo automático permanece preservado. Seu ajuste será registrado com autor, data e justificativa.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="risk-override-close"
            aria-label="Fechar ajuste de risco"
            onClick={onClose}
            disabled={isSaving}
          >
            <Icons.X size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <section className="risk-override-comparison" aria-label="Comparação entre cálculo e decisão">
            <div>
              <span>Radar automático</span>
              <strong>{automaticScore}<small>/100</small></strong>
              <p>{automaticLevel}</p>
            </div>
            <Icons.ArrowRight size={19} aria-hidden="true" />
            <div className={`risk-final-preview risk-tone-${selectedLevel.tone}`}>
              <span>Classificação final</span>
              <strong>{score}<small>/100</small></strong>
              <p>{selectedLevel.level}</p>
            </div>
            <div className={`risk-adjustment-chip ${adjustment >= 0 ? 'increase' : 'decrease'}`}>
              {adjustment > 0 ? '+' : ''}{adjustment} pontos
            </div>
          </section>

          <fieldset className="risk-level-fieldset">
            <legend>Nível de atenção definido pelo Compliance</legend>
            <div className="risk-level-options">
              {LEVELS.map((item) => (
                <button
                  key={item.level}
                  type="button"
                  className={`risk-level-option risk-tone-${item.tone} ${selectedLevel.level === item.level ? 'active' : ''}`}
                  aria-pressed={selectedLevel.level === item.level}
                  onClick={() => selectLevel(item)}
                >
                  <span>{item.short}</span>
                  <strong>{item.min}–{item.max}</strong>
                  <small>{item.copy}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <section className="risk-score-control">
            <div className="risk-score-label">
              <label htmlFor="risk-final-score">Pontuação dentro da faixa {selectedLevel.short.toLowerCase()}</label>
              <output htmlFor="risk-final-score">{score}/100</output>
            </div>
            <input
              id="risk-final-score"
              type="range"
              min={selectedLevel.min}
              max={selectedLevel.max}
              value={score}
              onChange={(event) => setScore(Number(event.target.value))}
              style={{ '--risk-progress': `${((score - selectedLevel.min) / Math.max(1, selectedLevel.max - selectedLevel.min)) * 100}%` } as React.CSSProperties}
            />
            <div className="risk-score-bounds"><span>{selectedLevel.min}</span><span>{selectedLevel.max}</span></div>
          </section>

          <section className="risk-justification-field">
            <div>
              <label htmlFor="risk-justification">Fundamentação obrigatória</label>
              <span>{justification.trim().length}/10 mínimo</span>
            </div>
            <textarea
              id="risk-justification"
              value={justification}
              onChange={(event) => {
                setJustification(event.target.value);
                if (error) setError('');
              }}
              rows={4}
              maxLength={1000}
              placeholder="Ex.: estrutura societária em camadas, coincidência de endereço e representação jurídica, notícia adversa ainda não confirmada e lacuna de beneficiário final."
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'risk-override-error' : undefined}
            />
            <p>Descreva a exposição observada. Evite afirmar irregularidade quando a evidência ainda for apenas indício ou hipótese.</p>
          </section>

          {error ? (
            <div id="risk-override-error" className="risk-override-error" role="alert">
              <Icons.AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <footer className="risk-override-footer">
            <div><Icons.Info size={15} aria-hidden="true" /><span>Esta decisão entra na trilha de auditoria e no dossiê.</span></div>
            <div>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
              <Button type="submit" variant="primary" isLoading={isSaving} disabled={justification.trim().length < 10}>
                Registrar classificação final
              </Button>
            </div>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
};
