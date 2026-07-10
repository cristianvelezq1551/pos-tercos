import * as React from 'react';
import { cn } from '../lib/utils';

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

/**
 * Sidebar canónica con slots `Header / Sections / Footer`.
 *
 *   <Sidebar>
 *     <Sidebar.Header>...</Sidebar.Header>
 *     <Sidebar.Sections>
 *       <Sidebar.Section title="Operación">
 *         <Sidebar.Link href="/" active>Dashboard</Sidebar.Link>
 *       </Sidebar.Section>
 *     </Sidebar.Sections>
 *     <Sidebar.Footer>...</Sidebar.Footer>
 *   </Sidebar>
 */
function SidebarRoot({ className, children, ...rest }: SidebarProps) {
  return (
    <div className={cn('flex h-full flex-col', className)} {...rest}>
      {children}
    </div>
  );
}
SidebarRoot.displayName = 'Sidebar';

function SidebarHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex h-14 shrink-0 items-center gap-3 border-b border-border px-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
SidebarHeader.displayName = 'Sidebar.Header';

function SidebarSections({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-3 py-4', className)} {...rest}>
      {children}
    </div>
  );
}
SidebarSections.displayName = 'Sidebar.Sections';

export interface SidebarSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Título de la sección. Renderizado en caps con tracking. */
  title?: string;
}

function SidebarSection({ title, className, children, ...rest }: SidebarSectionProps) {
  return (
    <div className={cn('mb-5', className)} {...rest}>
      {title ? (
        <p className="caps mb-1.5 px-2 text-[0.6875rem] text-muted-foreground">{title}</p>
      ) : null}
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}
SidebarSection.displayName = 'Sidebar.Section';

/**
 * Helper para apps que usan Next.js Link (prefetch + client nav).
 * Devuelve la className canónica de un Sidebar.Link según `active`.
 */
export function sidebarLinkClass(active: boolean, extra?: string): string {
  return cn(
    'group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-150 ease-out',
    active
      ? 'bg-red-50 text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r-full before:bg-primary'
      : 'text-ink-300 hover:bg-muted hover:text-foreground',
    extra,
  );
}

export interface SidebarLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean;
  icon?: React.ReactNode;
  /** Badge a la derecha (count, indicador). */
  trailing?: React.ReactNode;
}

function SidebarLink({
  active = false,
  icon,
  trailing,
  className,
  children,
  ...rest
}: SidebarLinkProps) {
  return (
    <li>
      <a
        aria-current={active ? 'page' : undefined}
        className={sidebarLinkClass(active, className)}
        {...rest}
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {trailing}
      </a>
    </li>
  );
}
SidebarLink.displayName = 'Sidebar.Link';

function SidebarFooter({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('shrink-0 border-t border-border px-3 py-3', className)} {...rest}>
      {children}
    </div>
  );
}
SidebarFooter.displayName = 'Sidebar.Footer';

export const Sidebar = Object.assign(SidebarRoot, {
  Header: SidebarHeader,
  Sections: SidebarSections,
  Section: SidebarSection,
  Link: SidebarLink,
  Footer: SidebarFooter,
});
