import * as React from 'react';
import { cn } from '../lib/utils';

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'prefix'> {
  /** Valor numérico (controlado). null = vacío. */
  value: number | null;
  /** Callback con el nuevo número (o null si vacío). */
  onChange: (value: number | null) => void;
  /** Prefijo visual (ej: "$"). NO entra en el value. */
  prefix?: React.ReactNode;
  /** Sufijo visual (ej: "g", "ml"). NO entra en el value. */
  suffix?: React.ReactNode;
  /** Decimales máximos permitidos. Default 0 (enteros). */
  decimals?: number;
  /** Min / max permitidos. */
  min?: number;
  max?: number;
}

/**
 * Input numérico con prefijo/sufijo. tabular-nums siempre.
 *
 * - Valores enteros por default — para precio en COP, use con `prefix="$"`.
 * - Para decimales (cantidad en kg/L), pasar `decimals={2}` o `decimals={3}`.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    { value, onChange, prefix, suffix, decimals = 0, min, max, className, disabled, ...rest },
    ref,
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === '' || raw === '-') {
        onChange(null);
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      let n = decimals === 0 ? Math.trunc(parsed) : Number(parsed.toFixed(decimals));
      if (typeof min === 'number') n = Math.max(min, n);
      if (typeof max === 'number') n = Math.min(max, n);
      onChange(n);
    };

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
        {prefix ? (
          <span className="flex select-none items-center pl-3 pr-1 text-sm text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          type="number"
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          step={decimals === 0 ? 1 : Math.pow(10, -decimals)}
          min={min}
          max={max}
          value={value ?? ''}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'tabular flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground',
            '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            '[&[type=number]]:[-moz-appearance:textfield]',
            !prefix && 'pl-3',
            !suffix && 'pr-3',
          )}
          {...rest}
        />
        {suffix ? (
          <span className="flex select-none items-center pl-1 pr-3 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    );
  },
);
NumberInput.displayName = 'NumberInput';
