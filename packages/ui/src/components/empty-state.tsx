import * as React from 'react';
import { cn } from '../lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ilustración line-art (típicamente `<LineArtIllustration name="..." />`). */
  illustration?: React.ReactNode;
  /** Título principal. */
  title: string;
  /** Descripción debajo del título. */
  description?: React.ReactNode;
  /** Slot de acciones (Buttons). */
  action?: React.ReactNode;
  /** Tamaño visual. `sm` = inline en cards; `md` = página completa. */
  size?: 'sm' | 'md';
}

/**
 * Empty state canónico. SIEMPRE usar este wrapper en lugar de un `<p>` "No hay datos".
 *
 * Si no se pasa `illustration`, queda solo texto + acción (variante mínima).
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    { illustration, title, description, action, size = 'md', className, ...rest },
    ref,
  ) => (
    <div
      ref={ref}
      role="status"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 text-center',
        size === 'sm' ? 'gap-2 px-6 py-8' : 'gap-3 px-8 py-12 sm:py-16',
        className,
      )}
      {...rest}
    >
      {illustration ? <div className="text-ink-300">{illustration}</div> : null}
      <h3
        className={cn(
          'font-display font-bold tracking-tight text-foreground',
          size === 'sm' ? 'text-base' : 'text-xl',
        )}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            'max-w-md text-muted-foreground',
            size === 'sm' ? 'text-xs' : 'text-sm',
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
