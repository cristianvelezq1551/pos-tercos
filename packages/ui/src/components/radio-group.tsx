import * as React from 'react';
import { cn } from '../lib/utils';

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  value: string | null;
  onChange: (value: string) => void;
  options: RadioOption[];
  /** Layout: card (recomendado) o inline (compact horizontal). */
  layout?: 'card' | 'inline';
  className?: string;
}

/**
 * Grupo de radios. Layout `card` para selección visual (pickup/delivery, etc.).
 * Layout `inline` para opciones cortas (sí/no/quizá).
 */
export function RadioGroup({
  name,
  value,
  onChange,
  options,
  layout = 'card',
  className,
}: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      className={cn(
        layout === 'card' ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-wrap gap-3',
        className,
      )}
    >
      {options.map((opt) => {
        const checked = value === opt.value;
        const id = `${name}-${opt.value}`;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={cn(
              'group flex cursor-pointer items-start gap-2.5 rounded-lg border bg-card transition-colors duration-150 ease-out',
              'hover:border-ink-300',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
              // Tinte rojo a 10% sobre el card (tema-aware: legible en oscuro y claro).
              checked ? 'border-primary bg-primary/10' : 'border-border',
              opt.disabled && 'cursor-not-allowed opacity-50',
              layout === 'card' ? 'p-3' : 'px-3 py-2',
              'motion-reduce:transition-none',
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded-full border-input bg-card text-primary',
                'focus:outline-none focus-visible:ring-0',
              )}
            />
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{opt.label}</span>
              {opt.description ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {opt.description}
                </span>
              ) : null}
            </div>
          </label>
        );
      })}
    </div>
  );
}
RadioGroup.displayName = 'RadioGroup';
