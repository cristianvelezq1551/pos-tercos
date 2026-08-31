import * as React from 'react';
import { cn } from '../lib/utils';

export interface TopbarProps extends React.HTMLAttributes<HTMLElement> {
  /** Variante visual. Light = fondo papel; Dark = fondo ink-950 (KDS, public-display). */
  variant?: 'light' | 'dark';
  /** Sticky por default. Setear false para layouts kiosko. */
  sticky?: boolean;
  /** Children: usar `<Topbar.Brand>`, `<Topbar.Nav>`, `<Topbar.Actions>` como slots. */
  children?: React.ReactNode;
}

/**
 * Topbar canónica para todas las apps. Slots:
 *
 *   <Topbar variant="light">
 *     <Topbar.Brand>...</Topbar.Brand>
 *     <Topbar.Nav>...</Topbar.Nav>
 *     <Topbar.Actions>...</Topbar.Actions>
 *   </Topbar>
 *
 * Brand colapsa a la izquierda, Actions a la derecha. Nav se expande al medio.
 */
export const Topbar = Object.assign(
  React.forwardRef<HTMLElement, TopbarProps>(
    ({ variant = 'light', sticky = true, className, children, ...rest }, ref) => (
      <header
        ref={ref}
        className={cn(
          'z-30 flex h-14 items-center gap-4 border-b px-4 lg:px-6',
          sticky && 'sticky top-0',
          variant === 'light'
            ? 'border-border bg-card/95 backdrop-blur-md supports-[backdrop-filter]:bg-card/80'
            : 'border-ink-800 bg-ink-950/95 text-ink-50 backdrop-blur-md supports-[backdrop-filter]:bg-ink-950/80',
          className,
        )}
        {...rest}
      >
        {children}
      </header>
    ),
  ),
  {
    Brand: TopbarBrand,
    Nav: TopbarNav,
    Actions: TopbarActions,
  },
);
Topbar.displayName = 'Topbar';

function TopbarBrand({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-3', className)} {...rest}>
      {children}
    </div>
  );
}
TopbarBrand.displayName = 'Topbar.Brand';

function TopbarNav({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return (
    <nav
      className={cn('hidden min-w-0 flex-1 items-center gap-1 lg:flex', className)}
      aria-label="Navegación principal"
      {...rest}
    >
      {children}
    </nav>
  );
}
TopbarNav.displayName = 'Topbar.Nav';

function TopbarActions({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('ml-auto flex items-center gap-2', className)} {...rest}>
      {children}
    </div>
  );
}
TopbarActions.displayName = 'Topbar.Actions';
