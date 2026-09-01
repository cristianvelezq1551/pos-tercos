import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-md border font-medium leading-none transition-colors',
  {
    variants: {
      tone: {
        neutral: '',
        primary: '',
        success: '',
        warning: '',
        danger: '',
        info: '',
      },
      variant: {
        subtle: '',
        solid: '',
        outline: '',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[0.6875rem]',
        md: 'px-2 py-0.5 text-xs',
        lg: 'px-2.5 py-1 text-sm',
      },
    },
    compoundVariants: [
      // SUBTLE variants: bg suave + text fuerte + border tenue del mismo hue
      { tone: 'neutral', variant: 'subtle', class: 'bg-ink-100 text-ink-700 border-ink-200' },
      { tone: 'primary', variant: 'subtle', class: 'bg-red-50 text-red-700 border-red-200' },
      {
        tone: 'success',
        variant: 'subtle',
        class: 'bg-success-bg text-success border-success-border',
      },
      {
        tone: 'warning',
        variant: 'subtle',
        class: 'bg-warning-bg text-warning border-warning-border',
      },
      { tone: 'danger', variant: 'subtle', class: 'bg-red-50 text-red-700 border-red-200' },
      { tone: 'info', variant: 'subtle', class: 'bg-ink-100 text-ink-600 border-ink-200' },

      // SOLID variants
      { tone: 'neutral', variant: 'solid', class: 'bg-ink-700 text-ink-50 border-ink-700' },
      {
        tone: 'primary',
        variant: 'solid',
        class: 'bg-primary text-primary-foreground border-primary',
      },
      {
        tone: 'success',
        variant: 'solid',
        class: 'bg-success text-success-foreground border-success',
      },
      {
        tone: 'warning',
        variant: 'solid',
        class: 'bg-warning text-warning-foreground border-warning',
      },
      {
        tone: 'danger',
        variant: 'solid',
        class: 'bg-destructive text-destructive-foreground border-destructive',
      },
      { tone: 'info', variant: 'solid', class: 'bg-ink-600 text-ink-50 border-ink-600' },

      // OUTLINE variants
      { tone: 'neutral', variant: 'outline', class: 'bg-transparent text-foreground border-ink-400' },
      {
        tone: 'primary',
        variant: 'outline',
        class: 'bg-transparent text-primary border-primary/50',
      },
      {
        tone: 'success',
        variant: 'outline',
        class: 'bg-transparent text-success border-success/50',
      },
      {
        tone: 'warning',
        variant: 'outline',
        class: 'bg-transparent text-warning border-warning/50',
      },
      {
        tone: 'danger',
        variant: 'outline',
        class: 'bg-transparent text-destructive border-destructive/50',
      },
      { tone: 'info', variant: 'outline', class: 'bg-transparent text-muted-foreground border-ink-400' },
    ],
    defaultVariants: {
      tone: 'neutral',
      variant: 'subtle',
      size: 'md',
    },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>['size']>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Punto/dot decorativo a la izquierda */
  withDot?: boolean;
}

/**
 * Badge tonal cerrado a la paleta de marca.
 * Usa `<StatusBadge>` cuando el estado venga de un enum mapeado.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, variant, size, withDot, children, ...rest }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone, variant, size }), className)} {...rest}>
      {withDot ? (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  ),
);
Badge.displayName = 'Badge';
