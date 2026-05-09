'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: 'sm' | 'md';
  label?: React.ReactNode;
  description?: React.ReactNode;
}

const SIZES = {
  sm: { track: 'h-5 w-9', thumb: 'h-3.5 w-3.5', translate: 'peer-checked:translate-x-4' },
  md: { track: 'h-6 w-11', thumb: 'h-4 w-4', translate: 'peer-checked:translate-x-5' },
} as const;

/**
 * Toggle switch (boolean). Para preferencia del usuario / on-off de servicios.
 * Para forms con sí/no que se envían, preferir Checkbox por convención semántica.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, size = 'md', label, description, id, ...rest }, ref) => {
    const reactId = React.useId();
    const finalId = id ?? `sw-${reactId}`;
    const s = SIZES[size];
    return (
      <div className={cn('flex items-start gap-2.5', className)}>
        <label
          htmlFor={finalId}
          className={cn(
            'relative inline-flex shrink-0 cursor-pointer items-center rounded-full bg-ink-200 transition-colors duration-200 ease-out',
            'has-[:checked]:bg-primary',
            'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
            s.track,
          )}
        >
          <input
            ref={ref}
            id={finalId}
            type="checkbox"
            role="switch"
            className="peer sr-only"
            {...rest}
          />
          <span
            aria-hidden="true"
            className={cn(
              'inline-block translate-x-1 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out motion-reduce:transition-none',
              s.thumb,
              s.translate,
            )}
          />
        </label>
        {(label || description) && (
          <div className="min-w-0 flex-1 leading-tight">
            {label ? (
              <label htmlFor={finalId} className="cursor-pointer text-sm font-medium text-foreground">
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
Switch.displayName = 'Switch';
