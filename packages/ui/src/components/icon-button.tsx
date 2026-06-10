import * as React from 'react';
import { cn } from '../lib/utils';
import { Button, type ButtonProps } from './button';

export interface IconButtonProps extends Omit<ButtonProps, 'size'> {
  /** Label requerido para accesibilidad — si NO muestras texto, el screen reader lo necesita. */
  'aria-label': string;
  /** Tamaño del botón cuadrado. */
  size?: 'sm' | 'md' | 'lg';
  /** Tooltip opcional (renderiza title nativo). Para tooltip rico, envolver en `<Tooltip>`. */
  tooltip?: string;
}

const SIZE: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
};

/**
 * Botón cuadrado solo-ícono. Wraps `<Button variant size="icon">` con
 * accesibilidad asegurada (aria-label requerido).
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', tooltip, className, children, ...rest }, ref) => (
    <Button
      ref={ref}
      size="icon"
      title={tooltip}
      className={cn('shrink-0 p-0', SIZE[size], className)}
      {...rest}
    >
      {children}
    </Button>
  ),
);
IconButton.displayName = 'IconButton';
