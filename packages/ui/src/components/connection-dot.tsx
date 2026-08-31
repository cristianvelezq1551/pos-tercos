import * as React from 'react';
import { cn } from '../lib/utils';

export type ConnectionState = 'live' | 'connecting' | 'error' | 'idle';

export interface ConnectionDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  state: ConnectionState;
  /** Mostrar etiqueta a la derecha */
  label?: React.ReactNode;
  size?: 'sm' | 'md';
}

const STATE_CONFIG: Record<ConnectionState, { color: string; label: string; pulse: boolean }> = {
  live: { color: 'bg-success', label: 'En vivo', pulse: true },
  connecting: { color: 'bg-warning', label: 'Conectando…', pulse: true },
  error: { color: 'bg-destructive', label: 'Sin conexión', pulse: false },
  idle: { color: 'bg-ink-400', label: 'Inactivo', pulse: false },
};

/**
 * Punto de estado de conexión (WS/SSE/polling). Reutilizado en KDS,
 * POS WebOrdersDrawer, public-display.
 */
export const ConnectionDot = React.forwardRef<HTMLSpanElement, ConnectionDotProps>(
  ({ state, label, size = 'sm', className, ...rest }, ref) => {
    const cfg = STATE_CONFIG[state];
    const dotSize = size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2';
    const finalLabel = label ?? cfg.label;

    return (
      <span
        ref={ref}
        role="status"
        aria-label={typeof finalLabel === 'string' ? finalLabel : cfg.label}
        className={cn('inline-flex items-center gap-1.5', className)}
        {...rest}
      >
        <span className={cn('relative inline-flex shrink-0', dotSize)}>
          {cfg.pulse ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                cfg.color,
              )}
            />
          ) : null}
          <span
            aria-hidden="true"
            className={cn('relative inline-flex rounded-full', dotSize, cfg.color)}
          />
        </span>
        {label !== undefined ? (
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        ) : null}
      </span>
    );
  },
);
ConnectionDot.displayName = 'ConnectionDot';
