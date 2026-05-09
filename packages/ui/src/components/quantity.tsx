import * as React from 'react';
import { cn } from '../lib/utils';
import { formatNumber } from '../lib/format';

export interface QuantityProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number | null | undefined;
  /** Unidad de medida (g, ml, un, kg, etc.). */
  unit?: string;
  decimals?: number;
}

/**
 * Renderiza una cantidad con unidad. Tabular nums activo.
 * Ej: `<Quantity value={1500} unit="g" />` → "1.500 g"
 */
export const Quantity = React.forwardRef<HTMLSpanElement, QuantityProps>(
  ({ value, unit, decimals = 0, className, ...rest }, ref) => (
    <span ref={ref} className={cn('tabular text-foreground', className)} {...rest}>
      {formatNumber(value, { decimals })}
      {unit ? <span className="ml-1 text-muted-foreground">{unit}</span> : null}
    </span>
  ),
);
Quantity.displayName = 'Quantity';
