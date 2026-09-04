// ==========================================================
// DILIGÊNCIA 360 — SelectField
// ==========================================================
// Apelido do `Select` de Field.tsx, mantido porque a barra do mapa e
// as gavetas já o chamam com esta assinatura. O desenho e o
// select-field.css saíram: campo é um só.
// ==========================================================

import { Select, SelectOption } from './Field';

export type { SelectOption };

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  tone?: 'default' | 'dark';
  disabled?: boolean;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
  tone = 'default',
  disabled = false,
}: SelectFieldProps<T>) {
  return (
    <Select
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      controlSize="sm"
      disabled={disabled}
      // `dark` era o nome antigo da superfície escura do mapa.
      tone={tone === 'dark' ? 'deep' : 'default'}
      className={className}
    />
  );
}
