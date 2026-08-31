import * as React from 'react';
import { cn } from '../lib/utils';

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Eyebrow tipo señalética (caps tracked). */
  eyebrow?: React.ReactNode;
  /** Título display. */
  title?: React.ReactNode;
  /** Descripción debajo del título. */
  description?: React.ReactNode;
  /** Slot a la derecha del título (botones, links, filtros). */
  actions?: React.ReactNode;
  /**
   * Decoración debajo del título.
   * - `double-rule`: cinta gruesa + hairline separadas (ornamento de marca).
   * - `hairline`: línea sutil 1px ink-300.
   * - `none`: sin decoración.
   * Default `double-rule` cuando hay `title`, sino `none`.
   */
  divider?: 'double-rule' | 'hairline' | 'none';
  /** Tamaño de spacing. */
  size?: 'sm' | 'md' | 'lg';
}

const TITLE_SIZE: Record<NonNullable<SectionProps['size']>, string> = {
  sm: 'text-xl sm:text-2xl',
  md: 'text-2xl sm:text-3xl',
  lg: 'text-3xl sm:text-4xl',
};

const SPACING: Record<NonNullable<SectionProps['size']>, string> = {
  sm: 'space-y-3',
  md: 'space-y-5',
  lg: 'space-y-6',
};

/**
 * Section canónica: bloque con eyebrow + título display + actions + divider
 * ornamental + content. Reemplaza headings ad-hoc dentro de páginas.
 */
export function Section({
  eyebrow,
  title,
  description,
  actions,
  divider,
  size = 'md',
  className,
  children,
  ...rest
}: SectionProps) {
  const hasHeader = Boolean(eyebrow || title || description || actions);
  const finalDivider = divider ?? (title ? 'double-rule' : 'none');

  return (
    <section className={cn(SPACING[size], className)} {...rest}>
      {hasHeader ? (
        <header className="space-y-2">
          {eyebrow ? (
            <span className="caps inline-block text-[0.6875rem] text-primary">{eyebrow}</span>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              {title ? (
                <h2
                  className={cn(
                    'font-display font-extrabold leading-[0.95] tracking-tight text-foreground',
                    TITLE_SIZE[size],
                  )}
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
          {finalDivider === 'double-rule' ? (
            <span aria-hidden="true" className="double-rule mt-1 block w-full" />
          ) : finalDivider === 'hairline' ? (
            <span aria-hidden="true" className="hairline mt-1 block w-full" />
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
Section.displayName = 'Section';
