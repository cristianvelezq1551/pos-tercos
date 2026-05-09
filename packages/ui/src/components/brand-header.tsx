import * as React from 'react';
import { cn } from '../lib/utils';

export interface BrandHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Slot para `<BrandLogo>`. */
  logo: React.ReactNode;
  /** Claim/tagline arriba del logo (caps tracked). */
  eyebrow?: React.ReactNode;
  /** Tagline debajo del logo. */
  tagline?: React.ReactNode;
  /** Variante visual. `centered` = login / splash. `editorial` = page header de detalle. */
  variant?: 'centered' | 'editorial';
}

/**
 * Header decorativo full-width con logo + tagline + double-rule.
 *
 * - `centered`: bloque centrado vertical, ideal para login / pantallas de
 *   onboarding / 404.
 * - `editorial`: alineado a la izquierda, como portada de revista.
 */
export function BrandHeader({
  logo,
  eyebrow,
  tagline,
  variant = 'centered',
  className,
  ...rest
}: BrandHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3',
        variant === 'centered' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
      {...rest}
    >
      {eyebrow ? (
        <span className="caps text-[0.6875rem] text-primary">{eyebrow}</span>
      ) : null}
      <div className="flex items-center gap-3">{logo}</div>
      {tagline ? (
        <p
          className={cn(
            'max-w-md text-sm text-muted-foreground',
            variant === 'centered' ? 'text-center' : 'text-left',
          )}
        >
          {tagline}
        </p>
      ) : null}
      <span aria-hidden="true" className="double-rule mt-2 w-24" />
    </header>
  );
}
BrandHeader.displayName = 'BrandHeader';
