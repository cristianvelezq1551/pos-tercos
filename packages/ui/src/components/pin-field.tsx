import * as React from 'react';
import { FormField } from './form-field';
import { Input } from './input';

export interface PinFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  hint?: React.ReactNode;
}

/** ¿Es un PIN de 6 dígitos válido (formato)? */
export function isValidPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/**
 * Campo de PIN de aprobación (Dueño). 6 dígitos numéricos. Reutilizable en
 * cualquier acción sensible (nómina, anulaciones, etc.). No verifica el PIN —
 * eso lo hace el backend; aquí solo valida el formato y normaliza la entrada.
 */
export function PinField({
  value,
  onChange,
  disabled,
  label = 'PIN de aprobación (Dueño)',
  hint,
}: PinFieldProps) {
  const error = value && !isValidPin(value) ? '6 dígitos' : undefined;
  return (
    <FormField label={label} required error={error} hint={hint}>
      <Input
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={disabled}
        placeholder="● ● ● ● ● ●"
      />
    </FormField>
  );
}
PinField.displayName = 'PinField';
