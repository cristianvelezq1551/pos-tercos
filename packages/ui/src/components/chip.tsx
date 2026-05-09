import * as React from 'react';
import { cn } from '../lib/utils';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  onRemove?: () => void;
  /** Ícono opcional a la izquierda */
  leadingIcon?: React.ReactNode;
}

/**
 * Chip seleccionable (como filtro o tag de categoría). Si `onRemove` se pasa,
 * agrega una "x" a la derecha.
 *
 * - Sin `selected`: estado idle.
 * - `selected`: highlight tonal con la primary.
 */
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected = false, onRemove, leadingIcon, children, type, ...rest }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-pressed={selected}
      className={cn(
        'group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
        selected
          ? 'border-primary bg-red-50 text-primary hover:bg-red-100'
          : 'border-border bg-card text-foreground hover:bg-muted',
        className,
      )}
      {...rest}
    >
      {leadingIcon}
      <span>{children}</span>
      {onRemove ? (
        <span
          role="button"
          aria-label="Quitar"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-1 ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-ink-200 hover:text-foreground"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      ) : null}
    </button>
  ),
);
Chip.displayName = 'Chip';
