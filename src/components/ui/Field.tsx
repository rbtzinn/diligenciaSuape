// ==========================================================
// DILIGÊNCIA 360 — Campo de formulário
// ==========================================================
// Havia três desenhos de campo no projeto: `.input-control` no
// index.css, o `.ui-select-field` em select-field.css e uma dúzia de
// `<input>` com estilo em linha no login e nas gavetas. Alturas
// diferentes, anel de foco diferente, e no celular só um deles
// respeitava a área mínima de toque.
//
// Todos passam a sair daqui, sobre os mesmos tokens de controle que
// o botão usa — por isso um campo e um botão lado a lado finalmente
// têm a mesma altura.
// ==========================================================

import React, { forwardRef, useId } from 'react';
import { cn } from '../../lib/cn';
import { ControlSize, resolveControlSize } from './controlSize';

const CONTROL_BASE = cn(
  'w-full min-w-0 border bg-surface text-ink transition-colors',
  'border-line hover:border-line-strong',
  'focus:border-brand focus:outline-none focus:shadow-[var(--ring-focus)]',
  'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted',
  'aria-[invalid=true]:border-high aria-[invalid=true]:shadow-[0_0_0_3px_rgb(220_38_38/0.14)]',
);

const CONTROL_SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'min-h-[var(--control-height-sm)] rounded-[var(--control-radius-sm)] px-[var(--control-pad-x-sm)] py-[var(--control-pad-y-sm)] text-xs',
  md: 'min-h-[var(--control-height-md)] rounded-[var(--control-radius-md)] px-[var(--control-pad-x-md)] py-[var(--control-pad-y-md)] text-base',
  lg: 'min-h-[var(--control-height-lg)] rounded-[var(--control-radius-lg)] px-[var(--control-pad-x-lg)] py-[var(--control-pad-y-lg)] text-md',
};

interface FieldShellProps {
  label?: React.ReactNode;
  /** Ação no canto direito do rótulo — "Esqueci minha senha". */
  labelAction?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/** Rótulo, dica e mensagem de erro em volta de um controle. */
export const FieldShell: React.FC<FieldShellProps> = ({
  label,
  labelAction,
  hint,
  error,
  htmlFor,
  className,
  children,
}) => (
  <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
    {label || labelAction ? (
      <div className="flex min-w-0 items-center justify-between gap-2">
        {label ? (
          <label htmlFor={htmlFor} className="text-xs font-semibold text-ink-2">
            {label}
          </label>
        ) : null}
        {labelAction}
      </div>
    ) : null}

    {children}

    {error ? (
      <p role="alert" className="text-xs font-medium text-high-text">
        {error}
      </p>
    ) : hint ? (
      <p className="text-xs text-ink-3">{hint}</p>
    ) : null}
  </div>
);

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode;
  labelAction?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  controlSize?: ControlSize;
  /** Ícone à esquerda, dentro do campo. */
  leading?: React.ReactNode;
  /** Botão à direita, dentro do campo — mostrar senha, limpar. */
  trailing?: React.ReactNode;
  /** Documento e identificador em monoespaçado. */
  mono?: boolean;
  fieldClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({
  label,
  labelAction,
  hint,
  error,
  controlSize = 'md',
  leading,
  trailing,
  mono = false,
  className,
  fieldClassName,
  id,
  ...props
}, ref) {
  const generated = useId();
  const inputId = id || generated;
  const resolved = resolveControlSize(controlSize);

  return (
    <FieldShell
      label={label}
      labelAction={labelAction}
      hint={hint}
      error={error}
      htmlFor={inputId}
      className={fieldClassName}
    >
      <div className="relative flex min-w-0 items-center">
        {leading ? (
          <span aria-hidden="true" className="pointer-events-none absolute left-3 grid place-items-center text-ink-3">
            {leading}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            CONTROL_BASE,
            CONTROL_SIZE[resolved],
            mono && 'font-mono',
            leading && 'pl-10',
            trailing && 'pr-11',
            className,
          )}
          {...props}
        />

        {trailing ? <span className="absolute right-1.5 flex items-center">{trailing}</span> : null}
      </div>
    </FieldShell>
  );
});

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  controlSize?: ControlSize;
  disabled?: boolean;
  tone?: 'default' | 'deep';
  className?: string;
  id?: string;
}

export function Select<T extends string>({
  label,
  hint,
  error,
  value,
  options,
  onChange,
  controlSize = 'md',
  disabled = false,
  tone = 'default',
  className,
  id,
}: SelectProps<T>) {
  const generated = useId();
  const selectId = id || generated;
  const resolved = resolveControlSize(controlSize);
  const deep = tone === 'deep';

  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={selectId} className={className}>
      <div className="relative flex min-w-0 items-center">
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value as T)}
          className={cn(
            CONTROL_BASE,
            CONTROL_SIZE[resolved],
            'cursor-pointer appearance-none pr-9',
            deep && 'border-deep-line bg-deep-raised text-on-deep hover:border-on-deep-3',
          )}
        >
          {options.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('pointer-events-none absolute right-3', deep ? 'text-on-deep-3' : 'text-ink-3')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </FieldShell>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  /** Canto direito do rótulo — contador de caracteres, por exemplo. */
  labelAction?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  fieldClassName?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({
  label,
  labelAction,
  hint,
  error,
  className,
  fieldClassName,
  id,
  rows = 4,
  ...props
}, ref) {
  const generated = useId();
  const areaId = id || generated;

  return (
    <FieldShell
      label={label}
      labelAction={labelAction}
      hint={hint}
      error={error}
      htmlFor={areaId}
      className={fieldClassName}
    >
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL_BASE, 'rounded-md px-3 py-2 text-base leading-relaxed', className)}
        {...props}
      />
    </FieldShell>
  );
});
