import * as React from 'react';
import { cn } from '../lib/utils';
import { formatPercent } from '../lib/format';

export interface PercentageProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Valor ya en %, no en 0-1. Ej: 15.6 → "15,6 %" */
  value: number | null | undefined;
  decimals?: number;
  /** Prefija + cuando es positivo. */
  withSign?: boolean;
  /**
   * Si true, colorea según signo:
   * - positivo → success
   * - negativo → destructive
   * - cero / null → muted
   */
  tonal?: boolean;
}

export const Percentage = React.forwardRef<HTMLSpanElement, PercentageProps>(
  ({ value, decimals = 1, withSign = false, tonal = false, className, ...rest }, ref) => {
    let toneClass = 'text-foreground';
    if (tonal) {
      if (value == null || value === 0) toneClass = 'text-muted-foreground';
      else if (value > 0) toneClass = 'text-success';
      else toneClass = 'text-destructive';
    }
    return (
      <span ref={ref} className={cn('tabular font-medium', toneClass, className)} {...rest}>
        {formatPercent(value, { decimals, withSign })}
      </span>
    );
  },
);
Percentage.displayName = 'Percentage';
