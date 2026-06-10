import * as React from 'react';
import { cn } from '../lib/utils';
import { formatNumber } from '../lib/format';

export interface QuantityProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number | null | undefined;
  /** Unidad de medida (g, ml, un, kg, etc.). */
  unit?: string;
  /** Decimales FIJOS (siempre se muestran, aunque sean ceros). */
  decimals?: number;
  /** Decimales MÁXIMOS (recorta ceros al final). Preferir frente a `decimals` cuando el dato es variable. */
  maxDecimals?: number;
}

/**
 * Renderiza una cantidad con unidad. Tabular nums activo.
 * Ej: `<Quantity value={1500} unit="g" />` → "1.500 g"
 *     `<Quantity value={1.5} maxDecimals={4} />` → "1,5" (en vez de "1,5000")
 */
export const Quantity = React.forwardRef<HTMLSpanElement, QuantityProps>(
  ({ value, unit, decimals, maxDecimals, className, ...rest }, ref) => (
    <span ref={ref} className={cn('tabular text-foreground', className)} {...rest}>
      {formatNumber(
        value,
        maxDecimals !== undefined ? { maxDecimals } : { decimals: decimals ?? 0 },
      )}
      {unit ? <span className="ml-1 text-muted-foreground">{unit}</span> : null}
    </span>
  ),
);
Quantity.displayName = 'Quantity';
