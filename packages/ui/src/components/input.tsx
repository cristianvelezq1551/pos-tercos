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
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm text-foreground transition-colors duration-150 ease-out',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'placeholder:text-muted-foreground',
          'hover:border-ink-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
          'motion-reduce:transition-none',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
