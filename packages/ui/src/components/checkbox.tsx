import * as React from 'react';
import { cn } from '../lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label inline al lado del checkbox. */
  label?: React.ReactNode;
  /** Hint debajo. */
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, ...rest }, ref) => {
    const reactId = React.useId();
    const finalId = id ?? `cb-${reactId}`;
    return (
      <div className={cn('flex items-start gap-2.5', className)}>
        <input
          ref={ref}
          id={finalId}
          type="checkbox"
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-input bg-card text-primary',
            'transition-colors duration-150',
            'checked:bg-primary checked:border-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'motion-reduce:transition-none',
          )}
          {...rest}
        />
        {(label || description) && (
          <div className="min-w-0 flex-1 leading-tight">
            {label ? (
              <label
                htmlFor={finalId}
                className="cursor-pointer text-sm font-medium text-foreground"
              >
                {label}
              </label>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        )}
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';
