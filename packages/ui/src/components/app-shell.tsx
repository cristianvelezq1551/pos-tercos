import * as React from 'react';
import { cn } from '../lib/utils';

export interface AppShellProps {
  /** Topbar fija arriba. */
  topbar?: React.ReactNode;
  /** Sidebar fija a la izquierda en desktop, scrolleable independiente del main. */
  sidebar?: React.ReactNode;
  /** Footer al fondo (típicamente solo en web público). */
  footer?: React.ReactNode;
  /** Contenido principal. */
  children: React.ReactNode;
  /** Ancho de la sidebar (cuando se renderiza). Default: w-60 (240px). */
  sidebarWidth?: string;
  className?: string;
  mainClassName?: string;
}

/**
 * Wrapper de layout para las apps.
 *
 * Crítico: el viewport está dividido en topbar + (sidebar | main).
 * El main es la ÚNICA región scrolleable. La sidebar es altura completa,
 * con su propio scroll interno si tiene muchos items — el scroll del main
 * NO mueve la sidebar (UX problem que tenía la versión anterior).
 */
export function AppShell({
  topbar,
  sidebar,
  footer,
  children,
  sidebarWidth = 'w-60',
  className,
  mainClassName,
}: AppShellProps) {
  return (
    <div
      className={cn('flex h-dvh flex-col overflow-hidden bg-background text-foreground', className)}
    >
      {topbar}
      <div className="flex min-h-0 flex-1">
        {sidebar ? (
          <aside
            className={cn(
              'hidden shrink-0 overflow-y-auto border-r border-border bg-card lg:block',
              sidebarWidth,
            )}
          >
            {sidebar}
          </aside>
        ) : null}
        <main className={cn('min-w-0 flex-1 overflow-y-auto', mainClassName)}>
          {children}
          {footer}
        </main>
      </div>
    </div>
  );
}
AppShell.displayName = 'AppShell';
