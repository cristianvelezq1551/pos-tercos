import * as React from 'react';
import { cn } from '../lib/utils';
import { formatCop } from '../lib/format';

export interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Monto en COP (entero, sin decimales por convención). */
  amount: number | string | null | undefined;
  /** Mostrar el símbolo "$" (default true). */
  withSymbol?: boolean;
  /**
   * Si true y amount > 0, prefija "+" (útil en deltas).
   * Si amount < 0, el formatter es-CO ya muestra el signo.
   */
  withSign?: boolean;
  /** Tamaño tipográfico semántico. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  /** Pesos. `bold` para CTAs grandes; `medium` para celdas de tabla. */
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
}

const SIZES: Record<NonNullable<MoneyProps['size']>, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
};

const WEIGHTS: Record<NonNullable<MoneyProps['weight']>, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

/**
 * Renderiza pesos colombianos (COP) con `tabular-nums` siempre activo,
 * para que las columnas de tablas y los totales del carrito alineen.
 */
export const Money = React.forwardRef<HTMLSpanElement, MoneyProps>(
  ({ amount, withSymbol = true, withSign = false, size = 'md', weight = 'medium', className, ...rest }, ref) => {
    const formatted = formatCop(amount, { withSymbol });
    const showPlus =
      withSign && typeof amount === 'number' && amount > 0 && !formatted.startsWith('-');
    return (
      <span
        ref={ref}
        className={cn('tabular text-foreground', SIZES[size], WEIGHTS[weight], className)}
        {...rest}
      >
        {showPlus ? '+' : ''}
        {formatted}
      </span>
    );
  },
);
Money.displayName = 'Money';
