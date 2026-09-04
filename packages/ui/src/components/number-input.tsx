import * as React from 'react';
import { cn } from '../lib/utils';
import { groupDigits, onlyDigits } from '../lib/format';
import {
  decimalANumero,
  normalizarDecimal,
  textoDeDecimal,
  textoRepresenta,
} from '../lib/decimal-input';

export interface NumberInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'prefix'
> {
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
  /**
   * Muestra separadores de miles mientras se escribe (ej: 100.000). Solo aplica
   * a enteros (decimals === 0); pensado para montos en COP. Cambia el input a
   * texto porque <input type="number"> no puede renderizar puntos de miles.
   */
  grouping?: boolean;
  /** Min / max permitidos. */
  min?: number;
  max?: number;
}

/**
 * Input numérico con prefijo/sufijo. tabular-nums siempre.
 *
 * - Valores enteros por default — para precio en COP, use con `prefix="$" grouping`.
 * - Para decimales (cantidad en kg/L), pasar `decimals={2}` o `decimals={3}`.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      prefix,
      suffix,
      decimals = 0,
      grouping = false,
      min,
      max,
      className,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const grouped = grouping && decimals === 0;

    const clamp = (n: number): number => {
      let v = n;
      if (typeof min === 'number') v = Math.max(min, v);
      if (typeof max === 'number') v = Math.min(max, v);
      return v;
    };

    // Con decimales el campo guarda TEXTO mientras se escribe. Un
    // `type="number"` controlado por un número parsea "6." a 6 y le borra el
    // punto a la persona, y descarta la COMA —el separador del teclado en
    // español—, así que "6,17" terminaba en 617. Lo reportó el dueño cargando
    // una factura desde el celular.
    const conDecimales = !grouped && decimals > 0;
    const [texto, setTexto] = React.useState(() => textoDeDecimal(value));

    // El valor puede llegar recalculado desde afuera. Solo se pisa cuando de
    // verdad es otro número: si ya representa lo mismo, reemplazarlo borraría
    // el separador recién tecleado.
    React.useEffect(() => {
      if (!conDecimales) return;
      setTexto((actual) => (textoRepresenta(actual, value) ? actual : textoDeDecimal(value)));
    }, [conDecimales, value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (grouped) {
        const digits = onlyDigits(raw);
        onChange(digits === '' ? null : clamp(Number(digits)));
        return;
      }
      if (conDecimales) {
        const limpio = normalizarDecimal(raw, decimals);
        setTexto(limpio);
        onChange(limpio === '' ? null : clamp(decimalANumero(limpio)));
        return;
      }
      if (raw === '' || raw === '-') {
        onChange(null);
        return;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      onChange(clamp(Math.trunc(parsed)));
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
          type={grouped || conDecimales ? 'text' : 'number'}
          inputMode={grouped ? 'numeric' : conDecimales ? 'decimal' : 'numeric'}
          step={grouped || conDecimales ? undefined : 1}
          min={grouped || conDecimales ? undefined : min}
          max={grouped || conDecimales ? undefined : max}
          value={
            grouped
              ? value == null
                ? ''
                : groupDigits(String(value))
              : conDecimales
                ? texto
                : (value ?? '')
          }
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'tabular flex-1 bg-transparent px-3 py-2 text-base sm:text-sm text-foreground outline-none placeholder:text-muted-foreground',
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
