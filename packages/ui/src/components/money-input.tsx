import * as React from 'react';
import { cn } from '../lib/utils';
import { groupDigits, onlyDigits } from '../lib/format';

export interface MoneyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'prefix'
> {
  /** Valor en dígitos crudos, sin separadores. Ej: "100000". '' = vacío. */
  value: string;
  /** Devuelve los dígitos sin separadores (lo que se guarda en el estado). */
  onChange: (digits: string) => void;
  /** Prefijo visual. Default "$". Pasar null para ocultarlo. */
  prefix?: React.ReactNode;
}

/**
 * Input de plata en COP (entero). El usuario ve separadores de miles
 * (100.000) mientras el estado guarda solo dígitos ("100000"). Drop-in para
 * formularios cuyo estado de monto es string. Para estado numérico usar
 * `NumberInput` con `grouping`.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, prefix = '$', className, disabled, ...rest }, ref) => {
    return (
      <div
        className={cn(
          'group flex h-10 w-full items-stretch overflow-hidden rounded-md border border-input bg-card transition-colors duration-150 ease-out',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background focus-within:border-primary',
          'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:disabled]:bg-muted',
          'has-[[aria-invalid="true"]]:border-destructive has-[[aria-invalid="true"]]:ring-destructive/30',
          'hover:border-ink-400',
          className,
        )}
      >
        {prefix != null ? (
          <span className="flex select-none items-center pl-3 pr-1 text-sm text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={groupDigits(value ?? '')}
          onChange={(e) => onChange(onlyDigits(e.target.value))}
          disabled={disabled}
          className={cn(
            'tabular-nums flex-1 bg-transparent px-3 py-2 text-base sm:text-sm text-foreground outline-none placeholder:text-muted-foreground',
            prefix == null && 'pl-3',
          )}
          {...rest}
        />
      </div>
    );
  },
);
MoneyInput.displayName = 'MoneyInput';
