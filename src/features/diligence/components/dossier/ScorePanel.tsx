// ==========================================================
// DILIGÊNCIA 360 — Painel do score
// ==========================================================
// O único bloco escuro da ficha, e por isso o primeiro que o olho
// encontra. É onde está a decisão.
//
// O acento aqui não é o azul institucional: #2D60AD sobre o azul
// profundo do painel dá menos de 2:1 e simplesmente não se lê. É o
// mesmo azul clareado até passar em contraste (`--brand-blue-on-deep`),
// e é ele que pinta número, trilho e marcadores.
//
// O número grande é o cálculo automático quando não houve ajuste, e a
// decisão do analista quando houve — com o automático ao lado, nunca
// apagado. Essa é a razão de existir do módulo de risco, e a tela não
// pode contradizê-la.
// ==========================================================

import React from 'react';
import type { DiligenceItem } from '../../types';
import type { StatusVariant } from '../../../../types';
import { deriveRiskBreakdown } from './riskBreakdown';
import { Stamp, StampTone } from '../../../../components/ui/Sheet';
import { cn } from '../../../../lib/cn';

interface ScorePanelProps {
  diligence: DiligenceItem;
  /** Fontes que não responderam, para a linha de cobertura. */
  unansweredSources: string[];
  className?: string;
}

const STAMP_TONE: Record<StatusVariant, StampTone> = {
  low: 'ok',
  success: 'ok',
  medium: 'warn',
  high: 'high',
  critical: 'critical',
  info: 'neutral',
  primary: 'neutral',
  neutral: 'neutral',
};

export const ScorePanel: React.FC<ScorePanelProps> = ({ diligence, unansweredSources, className }) => {
  const risco = diligence.risco;
  const breakdown = deriveRiskBreakdown(risco);
  const score = Math.max(0, Math.min(100, Number(risco?.score) || 0));
  const override = risco?.manualOverride;

  return (
    <div className={cn('on-deep min-w-0 bg-deep px-4 py-4 text-on-deep sm:px-5 sm:py-5', className)}>
      {/* ---- Número ---- */}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 items-baseline gap-2">
          <strong className="num text-[3.25rem] font-extrabold leading-[0.85] tracking-tight text-brand-on-deep">
            {risco ? score : '—'}
          </strong>
          <span className="ficha-label text-on-deep-3">/100</span>
        </p>

        <Stamp onDeep tone={risco?.cor ? STAMP_TONE[risco.cor] ?? 'neutral' : 'neutral'}>
          {risco?.nivel || 'não calculado'}
        </Stamp>
      </div>

      {/* ---- Trilho ---- */}
      <div
        role="img"
        aria-label={`Índice de atenção: ${score} de 100`}
        className="mt-3 h-1 w-full bg-deep-hover"
      >
        <span className="block h-full bg-brand-on-deep" style={{ width: `${score}%` }} />
      </div>

      {/* ---- Eixos ---- */}
      <div className="mt-4 grid grid-cols-2 gap-px bg-deep-line sm:grid-cols-4">
        {breakdown.axes.map((axis) => (
          <div key={axis.id} className="min-w-0 bg-deep px-3 py-2.5 text-center">
            <strong className="num block text-xl font-bold leading-none text-on-deep">{axis.points}</strong>
            <span className="ficha-label mt-1 block text-on-deep-3">{axis.label}</span>
          </div>
        ))}
      </div>

      {/* ---- Decisão ---- */}
      {risco?.decisaoDesc || risco?.decisao ? (
        <p className="mt-4 text-sm font-semibold leading-relaxed text-on-deep">
          {risco.decisaoDesc || risco.decisao}
        </p>
      ) : null}

      {/* ---- O que exige leitura humana ----
          Cada linha é um critério que o motor marcou como indicador ou
          incerteza, e não como fato confirmado. Elas ficam no acento
          para não se misturarem à frase da decisão: a decisão é o que o
          cálculo conclui, estas são as ressalvas dele. */}
      {breakdown.needsReview.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {breakdown.needsReview.slice(0, 4).map((detalhe, index) => (
            <li
              key={`${detalhe.criterio}-${index}`}
              className="flex min-w-0 gap-1.5 font-mono text-2xs leading-relaxed text-brand-on-deep"
            >
              <span aria-hidden="true" className="shrink-0 font-bold">!</span>
              <span className="min-w-0">{detalhe.info || detalhe.criterio}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ---- Cobertura ----
          Ponto de lacuna não é achado sobre a empresa, e por isso não
          entra em nenhum dos quatro eixos. Fica aqui, dito com todas as
          letras. */}
      {breakdown.coveragePoints > 0 || unansweredSources.length > 0 ? (
        <p className="mt-3 border-t border-deep-line pt-3 font-mono text-2xs leading-relaxed text-on-deep-2">
          Cobertura incompleta
          {breakdown.coveragePoints > 0 ? ` · ${breakdown.coveragePoints} ponto(s) de lacuna` : ''}
          {unansweredSources.length > 0 ? ` · sem resposta: ${unansweredSources.join(', ')}` : ''}.
          {' '}Ausência de achado nessas fontes não é ausência de ocorrência.
        </p>
      ) : null}

      {/* ---- Ajuste humano ----
          O cálculo automático permanece visível ao lado da decisão. É
          a garantia de que o ajuste é rastreável, e não uma
          substituição silenciosa do número. */}
      {override ? (
        <p className="mt-3 border-t border-deep-line pt-3 font-mono text-2xs leading-relaxed text-on-deep-2">
          Classificação definida por {override.reviewedBy || 'analista'} — cálculo automático era{' '}
          <span className="num font-bold text-on-deep">{override.automaticScore}</span> ({override.automaticLevel}).
        </p>
      ) : null}
    </div>
  );
};
