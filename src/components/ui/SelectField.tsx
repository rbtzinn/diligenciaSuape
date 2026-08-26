import { useId } from 'react';
import { Icons } from './Icons';
import '../../styles/select-field.css';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

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
  const selectId = useId();

  return (
    <label className={`ui-select-field ui-select-field--${tone} ${className}`} htmlFor={selectId}>
      <span className="ui-select-field__label">{label}</span>
      <span className="ui-select-field__control">
        <select
          id={selectId}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as T)}
        >
          {options.map((option) => (
            <option value={option.value} key={option.value}>{option.label}</option>
          ))}
        </select>
        <Icons.ChevronDown className="ui-select-field__chevron" size={15} aria-hidden="true" />
      </span>
    </label>
  );
}
