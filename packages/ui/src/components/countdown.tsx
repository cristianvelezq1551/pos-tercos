'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { formatDuration } from '../lib/format';

export interface CountdownProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Inicio del cronómetro. Acepta Date o ISO string. */
  startedAt: Date | string | null | undefined;
  /**
   * Si los minutos transcurridos cruzan este umbral, el color escala a `warning`.
   * Default: 7.
   */
  warningAfterMinutes?: number;
  /**
   * Si los minutos transcurridos cruzan este umbral, el color escala a `destructive`.
   * Default: 10.
   */
  dangerAfterMinutes?: number;
  /** Tick rate en ms. Default 1000. */
  tickMs?: number;
  /** Pintar tonal según umbral. Default true. */
  tonal?: boolean;
}

/**
 * Cronómetro live (mm:ss / h:mm:ss). Color escala a warning/danger según
 * los minutos transcurridos. Reemplaza `useElapsed` + render manual del KDS.
 */
export const Countdown = React.forwardRef<HTMLSpanElement, CountdownProps>(
  (
    {
      startedAt,
      warningAfterMinutes = 7,
      dangerAfterMinutes = 10,
      tickMs = 1000,
      tonal = true,
      className,
      ...rest
    },
    ref,
  ) => {
    const start = React.useMemo(() => {
      if (!startedAt) return null;
      const d = startedAt instanceof Date ? startedAt : new Date(startedAt);
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }, [startedAt]);

    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
      if (!start) return;
      const id = setInterval(() => setNow(Date.now()), tickMs);
      return () => clearInterval(id);
    }, [start, tickMs]);

    if (!start) {
      return (
        <span ref={ref} className={cn('tabular text-muted-foreground', className)} {...rest}>
          —
        </span>
      );
    }

    const elapsed = Math.max(0, now - start);
    const minutes = elapsed / 60000;

    let toneClass = 'text-foreground';
    if (tonal) {
      if (minutes >= dangerAfterMinutes) toneClass = 'text-destructive';
      else if (minutes >= warningAfterMinutes) toneClass = 'text-warning';
    }

    return (
      <span
        ref={ref}
        role="timer"
        aria-live="off"
        className={cn('tabular font-semibold', toneClass, className)}
        {...rest}
      >
        {formatDuration(elapsed)}
      </span>
    );
  },
);
Countdown.displayName = 'Countdown';
