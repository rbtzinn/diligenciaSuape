// ==========================================================
// DILIGÊNCIA 360 — Primitivos da ficha
// ==========================================================
// O dossiê deixou de ser uma pilha de cartões e passou a ser uma
// ficha: fundo de papel, seções numeradas, rótulo monoespaçado e fio
// fino no lugar da moldura.
//
// A diferença não é de gosto. Cartão sobre cartão cria uma hierarquia
// que o conteúdo não tem — no dossiê, identificação, score e eixos
// estão no mesmo nível de leitura, e o que os separa é ordem, não
// profundidade. A ficha diz isso; a pilha de caixas dizia o oposto.
// ==========================================================

import React from 'react';
import { cn } from '../../lib/cn';

interface SheetSectionProps {
  /** Marcador da seção — "A", "B", "00". Vira "(A)" no cabeçalho. */
  mark?: string;
  title: React.ReactNode;
  /** Metadado alinhado à direita: data da consulta, contagem. */
  meta?: React.ReactNode;
  /** Barra de ações abaixo do conteúdo, separada por fio. */
  footer?: React.ReactNode;
  id?: string;
  className?: string;
  /** Sem respiro interno — para lista e tabela que já têm o seu. */
  flush?: boolean;
  children?: React.ReactNode;
}

/**
 * Uma seção da ficha. O cabeçalho é uma linha só, em caixa alta
 * monoespaçada, com o marcador à esquerda e o metadado à direita — a
 * mesma forma de um carimbo de protocolo.
 */
export const SheetSection: React.FC<SheetSectionProps> = ({
  mark,
  title,
  meta,
  footer,
  id,
  className,
  flush = false,
  children,
}) => (
  <section id={id} className={cn('min-w-0', className)}>
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <h2 className="ficha-label min-w-0 truncate text-ink-3">
        {mark ? <span className="text-ink-muted">({mark})</span> : null} {title}
      </h2>
      {meta ? <span className="ficha-label shrink-0 text-ink-muted">{meta}</span> : null}
    </div>

    <div className={cn('min-w-0', flush ? '' : 'pt-3')}>{children}</div>

    {footer ? <div className="mt-3 border-t border-line-soft pt-3">{footer}</div> : null}
  </section>
);

interface DataRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Documento, número de processo: exige dígito de largura fixa. */
  mono?: boolean;
  className?: string;
}

/**
 * Linha de campo: rótulo à esquerda, valor à direita, fio embaixo.
 *
 * Empilha em telas estreitas, onde rótulo e valor lado a lado
 * deixavam duas colunas de dez caracteres cada.
 */
export const DataRow: React.FC<DataRowProps> = ({ label, value, mono = false, className }) => (
  <div
    className={cn(
      'flex min-w-0 flex-col gap-0.5 border-b border-line-soft py-2 last:border-b-0',
      'sm:flex-row sm:items-baseline sm:justify-between sm:gap-4',
      className,
    )}
  >
    <dt className="ficha-label shrink-0 text-ink-3">{label}</dt>
    <dd
      className={cn(
        'min-w-0 text-sm leading-snug text-ink sm:text-right',
        mono && 'num font-mono',
      )}
    >
      {value}
    </dd>
  </div>
);

export const DataList: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => <dl className={cn('min-w-0', className)}>{children}</dl>;

export type StampTone = 'ok' | 'warn' | 'high' | 'critical' | 'neutral';

const STAMP_TONE: Record<StampTone, string> = {
  ok: 'border-ok text-ok-text',
  warn: 'border-warn text-warn-text',
  high: 'border-high text-high-text',
  critical: 'border-bad text-bad-text',
  neutral: 'border-line-strong text-ink-3',
};

/* Sobre o painel escuro, o vermelho do nível crítico fica quase
   invisível — é tinta escura sobre fundo escuro. Ali o carimbo usa a
   cor do texto claro, e quem carrega a gravidade é o número ao lado. */
const STAMP_TONE_ON_DEEP: Record<StampTone, string> = {
  ok: 'border-ok text-ok',
  warn: 'border-warn text-warn',
  high: 'border-high text-high',
  critical: 'border-bad-line text-bad-line',
  neutral: 'border-on-deep-3 text-on-deep-2',
};

/**
 * Carimbo do nível de risco.
 *
 * Inclinado de propósito: é o único elemento torto da tela, e é isso
 * que faz o olho ir nele primeiro. Um selo reto seria mais um chip
 * entre os outros — e o nível de atenção não é mais um chip.
 */
export const Stamp: React.FC<{
  tone?: StampTone;
  /** Carimbo aplicado sobre o painel escuro. */
  onDeep?: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', onDeep = false, children, className }) => (
  <span
    className={cn(
      'ficha-label inline-block -rotate-[4deg] border-2 px-2 py-0.5 font-bold tracking-[0.14em]',
      onDeep ? STAMP_TONE_ON_DEEP[tone] : STAMP_TONE[tone],
      className,
    )}
  >
    {children}
  </span>
);
