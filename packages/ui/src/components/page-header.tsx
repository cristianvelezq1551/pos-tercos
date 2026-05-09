import * as React from 'react';
import { cn } from '../lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  description?: React.ReactNode;
  /** Acciones al extremo derecho (Buttons). */
  actions?: React.ReactNode;
  /** Breadcrumbs renderizados arriba del título. */
  breadcrumbs?: BreadcrumbItem[];
  /** Eyebrow (kicker) caps antes del título. Ej "Reportes". */
  eyebrow?: React.ReactNode;
  /** Ícono contextual a la izquierda del título (BrandIcon o lucide). */
  icon?: React.ReactNode;
  /** Si false, no renderiza el double-rule decorativo. Default `true`. */
  withDivider?: boolean;
}

/**
 * Header canónico de página con personalidad editorial:
 *
 * - Eyebrow caps → título display gigante → descripción.
 * - Ícono contextual (BrandIcon) opcional al lado del título.
 * - Double-rule debajo (cinta gruesa + hairline) — separa visualmente del contenido.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  eyebrow,
  icon,
  withDivider = true,
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'border-b border-border bg-card/50 px-4 pb-6 pt-5 sm:px-6 sm:pb-7 sm:pt-6 lg:px-8 lg:pb-8 lg:pt-8',
        className,
      )}
      {...rest}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <nav aria-label="Breadcrumb" className="mb-3">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {breadcrumbs.map((b, i) => (
                  <React.Fragment key={`${b.label}-${i}`}>
                    {i > 0 ? (
                      <li aria-hidden="true" className="text-ink-300">
                        /
                      </li>
                    ) : null}
                    <li>
                      {b.href ? (
                        <a className="hover:text-foreground" href={b.href}>
                          {b.label}
                        </a>
                      ) : (
                        <span className="text-foreground">{b.label}</span>
                      )}
                    </li>
                  </React.Fragment>
                ))}
              </ol>
            </nav>
          ) : null}

          {eyebrow ? (
            <p className="caps mb-2 text-[0.6875rem] text-primary">{eyebrow}</p>
          ) : null}

          <div className="flex items-start gap-3 sm:gap-4">
            {icon ? (
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-card text-primary sm:h-12 sm:w-12">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-3xl font-extrabold leading-[0.95] tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>

          {withDivider ? (
            <span aria-hidden="true" className="double-rule mt-5 block w-24" />
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
PageHeader.displayName = 'PageHeader';
