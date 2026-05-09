import * as React from 'react';
import { cn } from '../lib/utils';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ancho máximo. `7xl` = dashboards full. `4xl` = formularios y detalle. `2xl` = login/onboarding. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  /** Padding vertical. Default `lg`. */
  padY?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE: Record<NonNullable<ContainerProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-none',
};

const PAD_Y: Record<NonNullable<ContainerProps['padY']>, string> = {
  none: '',
  sm: 'py-4 sm:py-5',
  md: 'py-6 sm:py-8',
  lg: 'py-8 sm:py-10 lg:py-12',
  xl: 'py-10 sm:py-14 lg:py-20',
};

/**
 * Container canónico para CONTENIDO PRINCIPAL de una página. Provee:
 *
 * - `mx-auto` + `max-w-*` configurable.
 * - Padding horizontal responsive (`px-4 sm:px-6 lg:px-8`).
 * - Padding vertical configurable.
 *
 * Usar SIEMPRE alrededor del contenido de una página (NO incluir el
 * PageHeader sticky — ése se renderiza fuera y abarca el ancho total).
 */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ size = '7xl', padY = 'lg', className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZE[size], PAD_Y[padY], className)}
      {...rest}
    >
      {children}
    </div>
  ),
);
Container.displayName = 'Container';
