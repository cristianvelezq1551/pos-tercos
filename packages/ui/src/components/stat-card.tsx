import * as React from 'react';
import { cn } from '../lib/utils';
import { Percentage } from './percentage';

export type StatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  deltaTone?: 'success' | 'destructive' | 'muted';
  icon?: React.ReactNode;
  tone?: StatTone;
}

const TONE_ACCENT: Record<StatTone, string> = {
  neutral: 'before:bg-ink-700',
  primary: 'before:bg-primary',
  success: 'before:bg-success',
  warning: 'before:bg-warning',
  danger: 'before:bg-destructive',
};

const TONE_ICON: Record<StatTone, string> = {
  neutral: 'text-ink-400',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

/**
 * StatCard limpia: bg card + cinta vertical tonal + label + valor display.
 * Diseño minimal: la jerarquía la da el contraste tipográfico, no decoraciones.
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    { label, value, hint, delta, deltaLabel, deltaTone, icon, tone = 'neutral', className, ...rest },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        'relative flex flex-col rounded-xl border border-border bg-card p-5',
        'before:absolute before:left-0 before:top-4 before:bottom-4 before:w-0.5 before:rounded-r-full',
        TONE_ACCENT[tone],
        className,
      )}
      {...rest}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="caps text-[0.6875rem] text-muted-foreground">{label}</p>
        {icon ? <span className={cn('shrink-0', TONE_ICON[tone])}>{icon}</span> : null}
      </div>
      <p className="mt-3 font-display text-3xl font-extrabold tabular leading-none tracking-tight text-foreground sm:text-4xl">
        {value}
      </p>
      {(hint || delta != null) && (
        <div className="mt-3 flex flex-wrap items-baseline gap-1.5 text-xs text-muted-foreground">
          {delta != null ? (
            <Percentage
              value={delta}
              withSign
              tonal={!deltaTone}
              className={cn(
                'text-xs',
                deltaTone === 'success' && 'text-success',
                deltaTone === 'destructive' && 'text-destructive',
                deltaTone === 'muted' && 'text-muted-foreground',
              )}
            />
          ) : null}
          {deltaLabel ? <span>{deltaLabel}</span> : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      )}
    </div>
  ),
);
StatCard.displayName = 'StatCard';
