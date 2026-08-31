import * as React from 'react';
import { cn } from '../lib/utils';

/*
 * `text-base sm:text-sm` no es un capricho de tamaño: iOS hace ZOOM automático
 * al enfocar cualquier campo con letra menor a 16 px, y después no vuelve solo
 * — hay que alejar a mano. 16 px en celular lo evita; de `sm` para arriba
 * vuelve a 14 px, donde el zoom no existe y el diseño no cambia.
 *
 * La otra salida sería `maximum-scale=1` en el viewport, pero eso le quita el
 * pellizco para acercar a TODA la página, también a quien lo necesita para leer.
 */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Select nativo styled. Para selects con búsqueda usar Combobox (TODO).
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...rest }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 py-2 text-base sm:text-sm text-foreground transition-colors duration-150 ease-out',
          'hover:border-ink-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
          'motion-reduce:transition-none',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </div>
  ),
);
Select.displayName = 'Select';
