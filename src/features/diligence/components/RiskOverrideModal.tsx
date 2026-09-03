// ==========================================================
// DILIGÊNCIA 360 — Classificação final de risco
// ==========================================================
// O cálculo automático permanece preservado: a tela mostra os dois
// lado a lado e registra o ajuste com autor, data e justificativa.
// Essa é a razão de existir do modal, e não muda.
//
// O que muda é a casca: eram 317 linhas de CSS em
// dossier-v3/risk-override.css mais a sexta cópia do laço de foco.
// Agora é um Modal do projeto, e o controle de faixa usa os tokens
// de cor do nível selecionado em vez de uma paleta própria.
// ==========================================================

import React, { FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Modal } from '../../../components/ui/Modal';
import { Note } from '../../../components/ui/Note';
import { TextArea } from '../../../components/ui/Field';
import { Chip, ChipTone } from '../../../components/ui/Chip';
import { cn } from '../../../lib/cn';
import type { RiskAssessment } from '../types';

interface RiskOverrideModalProps {
  isOpen: boolean;
  risk: RiskAssessment;
  isSaving?: boolean;
  onClose: () => void;
  onSubmit: (payload: { score: number; level: string; justification: string }) => Promise<void>;
}

const MIN_JUSTIFICATION = 10;

const LEVELS = [
  {
    level: 'Atenção Baixa',
    short: 'Baixa',
    min: 0,
    max: 14,
    tone: 'ok' as ChipTone,
    copy: 'Monitoramento ordinário e registro das limitações conhecidas.',
  },
  {
    level: 'Atenção Moderada',
    short: 'Moderada',
    min: 15,
    max: 34,
    tone: 'warn' as ChipTone,
    copy: 'Há sinais ou lacunas que pedem análise complementar documentada.',
  },
  {
    level: 'Atenção Elevada',
    short: 'Elevada',
    min: 35,
    max: 59,
    tone: 'high' as ChipTone,
    copy: 'A exposição é relevante e exige aprofundamento antes de avançar.',
  },
  {
    level: 'Atenção Crítica',
    short: 'Crítica',
    min: 60,
    max: 100,
    tone: 'critical' as ChipTone,
    copy: 'A exposição acumulada pede mitigação e decisão formal do comitê.',
  },
] as const;

type Level = (typeof LEVELS)[number];

/** Superfície do cartão de nível quando selecionado. */
const LEVEL_SURFACE: Record<ChipTone, string> = {
  ok: 'border-ok-line bg-ok-bg',
  warn: 'border-warn-line bg-warn-bg',
  high: 'border-high-line bg-high-bg',
  critical: 'border-bad-line bg-bad-bg',
  brand: 'border-brand-line bg-brand-soft',
  info: 'border-info-line bg-info-bg',
  neutral: 'border-neutral-line bg-neutral-soft',
  muted: 'border-line bg-surface-subtle',
};

const LEVEL_ACCENT: Record<ChipTone, string> = {
  ok: 'accent-[color:var(--status-low)]',
  warn: 'accent-[color:var(--status-medium)]',
  high: 'accent-[color:var(--status-high)]',
  critical: 'accent-[color:var(--status-critical)]',
  brand: 'accent-[color:var(--brand-blue)]',
  info: 'accent-[color:var(--status-info)]',
  neutral: 'accent-[color:var(--status-neutral)]',
  muted: 'accent-[color:var(--border-strong)]',
};

function getLevel(level?: string, score?: number): Level {
  const byName = LEVELS.find((item) => item.level === level);
  if (byName) return byName;
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  return LEVELS.find((item) => safeScore >= item.min && safeScore <= item.max) || LEVELS[0];
}

function clampToLevel(score: number, level: Level) {
  return Math.max(level.min, Math.min(level.max, Math.round(score)));
}

export const RiskOverrideModal: React.FC<RiskOverrideModalProps> = ({
  isOpen,
  risk,
  isSaving = false,
  onClose,
  onSubmit,
}) => {
  const formId = useId();
  const initialLevel = getLevel(risk.nivel, risk.score);
  const [level, setLevel] = useState<string>(initialLevel.level);
  const [score, setScore] = useState(clampToLevel(risk.score, initialLevel));
  const [justification, setJustification] = useState('');
  const [error, setError] = useState('');

  const selectedLevel = useMemo(() => getLevel(level, score), [level, score]);
  const automaticScore = risk.manualOverride?.automaticScore ?? risk.automaticScore ?? risk.score ?? 0;
  const automaticLevel = risk.manualOverride?.automaticLevel || getLevel(undefined, automaticScore).level;
  const adjustment = score - automaticScore;

  // Cada abertura recomeça do cálculo automático corrente.
  useEffect(() => {
    if (!isOpen) return;
    const nextLevel = getLevel(risk.nivel, risk.score);
    setLevel(nextLevel.level);
    setScore(clampToLevel(risk.score, nextLevel));
    setJustification('');
    setError('');
  }, [isOpen, risk.nivel, risk.score]);

  const selectLevel = (nextLevel: Level) => {
    setLevel(nextLevel.level);
    setScore((current) => clampToLevel(current, nextLevel));
    setError('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const reason = justification.trim();
    if (reason.length < MIN_JUSTIFICATION) {
      setError(
        `Explique em pelo menos ${MIN_JUSTIFICATION} caracteres quais sinais, hipóteses ou lacunas sustentam a decisão.`,
      );
      return;
    }
    setError('');
    try {
      await onSubmit({ score, level: selectedLevel.level, justification: reason });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Não foi possível registrar a classificação.',
      );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={!isSaving}
      disableEscape={isSaving}
      title="Definir classificação final de risco"
      subtitle="Decisão humana · Compliance SUAPE"
      icon={<Icons.ShieldAlert size={17} aria-hidden="true" />}
      footer={
        <>
          <p className="mr-auto flex min-w-0 items-center gap-1.5 text-2xs text-ink-3">
            <Icons.Info size={14} aria-hidden="true" className="shrink-0" />
            Esta decisão entra na trilha de auditoria e no dossiê.
          </p>

          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            isLoading={isSaving}
            loadingLabel="Registrando…"
            disabled={justification.trim().length < MIN_JUSTIFICATION}
          >
            Registrar classificação final
          </Button>
        </>
      }
    >
      <p className="text-base leading-relaxed text-ink-2">
        O cálculo automático permanece preservado. Seu ajuste será registrado com autor, data e justificativa.
      </p>

      {/* ---- Automático x decidido ---- */}
      <section
        aria-label="Comparação entre cálculo e decisão"
        className="grid min-w-0 items-center gap-2 rounded-lg border border-line bg-surface-subtle p-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]"
      >
        <div className="min-w-0 rounded-md border border-line bg-surface px-3 py-2">
          <span className="block text-2xs font-semibold uppercase tracking-wide text-ink-3">Radar automático</span>
          <strong className="num block text-xl font-extrabold leading-none text-ink-2">
            {automaticScore}
            <span className="text-xs font-medium text-ink-3">/100</span>
          </strong>
          <span className="block text-2xs text-ink-3">{automaticLevel}</span>
        </div>

        <Icons.ArrowRight
          size={18}
          aria-hidden="true"
          className="mx-auto rotate-90 text-ink-3 sm:rotate-0"
        />

        <div className={cn('min-w-0 rounded-md border px-3 py-2', LEVEL_SURFACE[selectedLevel.tone])}>
          <span className="block text-2xs font-semibold uppercase tracking-wide text-ink-3">
            Classificação final
          </span>
          <strong className="num block text-xl font-extrabold leading-none text-ink">
            {score}
            <span className="text-xs font-medium text-ink-3">/100</span>
          </strong>
          <span className="block text-2xs text-ink-2">{selectedLevel.level}</span>
        </div>

        {/* Zero é "sem ajuste", não "agravou": tom neutro. */}
        <Chip
          tone={adjustment === 0 ? 'neutral' : adjustment > 0 ? 'high' : 'ok'}
          size="sm"
          className="num justify-self-start sm:justify-self-end"
        >
          {adjustment > 0 ? '+' : ''}
          {adjustment} pontos
        </Chip>
      </section>

      <form id={formId} onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-3">
        {/* ---- Nível ---- */}
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs font-semibold text-ink-2">
            Nível de atenção definido pelo Compliance
          </legend>

          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {LEVELS.map((item) => {
              const active = selectedLevel.level === item.level;
              return (
                <button
                  key={item.level}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectLevel(item)}
                  className={cn(
                    'flex min-w-0 flex-col gap-0.5 rounded-lg border p-2.5 text-left transition-colors',
                    active
                      ? cn(LEVEL_SURFACE[item.tone], 'ring-2 ring-brand/25')
                      : 'border-line bg-surface hover:bg-surface-hover',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <strong className="text-sm font-bold text-ink">{item.short}</strong>
                    <span className="num ml-auto text-2xs font-semibold text-ink-3">
                      {item.min}–{item.max}
                    </span>
                  </span>
                  <span className="text-2xs leading-snug text-ink-2">{item.copy}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* ---- Pontuação dentro da faixa ---- */}
        <section className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <label htmlFor="risk-final-score" className="text-xs font-semibold text-ink-2">
              Pontuação dentro da faixa {selectedLevel.short.toLowerCase()}
            </label>
            <output htmlFor="risk-final-score" className="num text-sm font-bold text-ink">
              {score}/100
            </output>
          </div>

          <input
            id="risk-final-score"
            type="range"
            min={selectedLevel.min}
            max={selectedLevel.max}
            value={score}
            onChange={(event) => setScore(Number(event.target.value))}
            className={cn('h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-active', LEVEL_ACCENT[selectedLevel.tone])}
          />

          <div className="num flex justify-between text-2xs text-ink-3">
            <span>{selectedLevel.min}</span>
            <span>{selectedLevel.max}</span>
          </div>
        </section>

        {/* ---- Fundamentação ---- */}
        <TextArea
          id="risk-justification"
          label="Fundamentação obrigatória"
          labelAction={
            <span
              className={cn(
                'num text-2xs font-semibold',
                justification.trim().length >= MIN_JUSTIFICATION ? 'text-ok-text' : 'text-ink-3',
              )}
            >
              {justification.trim().length}/{MIN_JUSTIFICATION} mínimo
            </span>
          }
          hint="Descreva a exposição observada. Evite afirmar irregularidade quando a evidência ainda for apenas indício ou hipótese."
          rows={4}
          maxLength={1000}
          value={justification}
          onChange={(event) => {
            setJustification(event.target.value);
            if (error) setError('');
          }}
          placeholder="Ex.: estrutura societária em camadas, coincidência de endereço e representação jurídica, notícia adversa ainda não confirmada e lacuna de beneficiário final."
          error={error || undefined}
        />

        {error ? (
          <Note tone="high" role="alert" icon={<Icons.AlertCircle size={15} aria-hidden="true" />}>
            {error}
          </Note>
        ) : null}
      </form>
    </Modal>
  );
};
