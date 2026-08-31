import * as React from 'react';
import { cn } from '../lib/utils';

export interface BrandFooterProps extends React.HTMLAttributes<HTMLElement> {
  /** Slot izquierda: típicamente BrandLogo + claim. */
  brand?: React.ReactNode;
  /** Slot centro: links secundarios. */
  links?: React.ReactNode;
  /** Slot derecha: legal, redes, contacto. */
  meta?: React.ReactNode;
}

/**
 * Footer mínimo para apps públicas (web pública). Las apps internas
 * (admin, pos, kds) NO usan footer.
 */
export function BrandFooter({ brand, links, meta, className, ...rest }: BrandFooterProps) {
  return (
    <footer
      className={cn('border-t border-border bg-card px-4 py-6 sm:px-6 lg:px-8', className)}
      {...rest}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        {brand ? <div className="min-w-0">{brand}</div> : null}
        {links ? (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">{links}</div>
        ) : null}
        {meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null}
      </div>
    </footer>
  );
}
BrandFooter.displayName = 'BrandFooter';
