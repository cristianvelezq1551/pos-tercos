import * as React from 'react';
import { cn } from '../lib/utils';

export type StampTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

export interface StampProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StampTone;
  /** Ángulo de rotación. Default -6deg (sello manual). Pasar 0 para sello recto. */
  rotation?: number;
  /** Tamaño visual. */
  size?: 'sm' | 'md' | 'lg';
}

const TONE: Record<StampTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  neutral: 'text-ink-700',
  primary: 'text-primary',
};

const SIZE: Record<NonNullable<StampProps['size']>, string> = {
  sm: 'text-[0.6875rem] px-2 py-1 border-2',
  md: 'text-sm px-3 py-1.5 border-[2.5px]',
  lg: 'text-base px-4 py-2 border-[3px]',
};

/**
 * Sello rotado tipo "PAGADO", "ANULADA", "VENCIDO". Tipografía display
 * uppercase tracked, doble borde (border + inset shadow) y rotación leve.
 *
 * Uso típico: feedback de estado fuerte sobre cards (LastSale, anomaly cards).
 */
export const Stamp = React.forwardRef<HTMLSpanElement, StampProps>(
  ({ tone = 'success', rotation = -6, size = 'md', className, style, children, ...rest }, ref) => (
    <span
      ref={ref}
      style={{ transform: `rotate(${rotation}deg)`, ...style }}
      className={cn(
        'inline-block select-none rounded font-display font-extrabold uppercase leading-none tracking-[0.08em] [box-shadow:inset_0_0_0_1px_currentColor]',
        TONE[tone],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  ),
);
Stamp.displayName = 'Stamp';
