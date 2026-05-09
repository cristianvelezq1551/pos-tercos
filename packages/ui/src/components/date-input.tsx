import * as React from 'react';
import { cn } from '../lib/utils';

const baseClass = cn(
  'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground tabular transition-colors duration-150 ease-out',
  'hover:border-ink-400',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
  'motion-reduce:transition-none',
);

export type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} type="date" className={cn(baseClass, className)} {...rest} />
  ),
);
DateInput.displayName = 'DateInput';

export const TimeInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} type="time" className={cn(baseClass, className)} {...rest} />
  ),
);
TimeInput.displayName = 'TimeInput';

export interface DateRangeInputProps {
  from: string | null;
  to: string | null;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  className?: string;
}

export function DateRangeInput({
  from,
  to,
  onFromChange,
  onToChange,
  minDate,
  maxDate,
  disabled,
  className,
}: DateRangeInputProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DateInput
        aria-label="Desde"
        value={from ?? ''}
        onChange={(e) => onFromChange(e.target.value)}
        min={minDate}
        max={to ?? maxDate}
        disabled={disabled}
      />
      <span aria-hidden="true" className="shrink-0 text-sm text-muted-foreground">
        →
      </span>
      <DateInput
        aria-label="Hasta"
        value={to ?? ''}
        onChange={(e) => onToChange(e.target.value)}
        min={from ?? minDate}
        max={maxDate}
        disabled={disabled}
      />
    </div>
  );
}
DateRangeInput.displayName = 'DateRangeInput';
