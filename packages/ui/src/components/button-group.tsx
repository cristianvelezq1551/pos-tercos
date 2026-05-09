import * as React from 'react';
import { cn } from '../lib/utils';

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Orientación. Default horizontal. */
  orientation?: 'horizontal' | 'vertical';
  /** Tamaño semántico aplicado por children (no fuerza size). */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Grupo segmentado de Buttons — borders compartidos, esquinas externas redondeadas
 * sólo en los extremos. Uso típico: filtros mutuamente excluyentes.
 */
export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ orientation = 'horizontal', className, role, children, ...rest }, ref) => (
    <div
      ref={ref}
      role={role ?? 'group'}
      className={cn(
        'inline-flex isolate',
        orientation === 'horizontal'
          ? '[&>*]:rounded-none [&>*:first-child]:rounded-l-lg [&>*:last-child]:rounded-r-lg [&>*:not(:first-child)]:-ml-px focus-within:[&>*]:z-10'
          : 'flex-col [&>*]:rounded-none [&>*:first-child]:rounded-t-lg [&>*:last-child]:rounded-b-lg [&>*:not(:first-child)]:-mt-px focus-within:[&>*]:z-10',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  ),
);
ButtonGroup.displayName = 'ButtonGroup';
