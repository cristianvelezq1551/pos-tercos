import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/utils';

const cardVariants = cva(
  'rounded-2xl border bg-card text-card-foreground transition-shadow duration-150',
  {
    variants: {
      variant: {
        default: 'border-border shadow-xs',
        muted: 'border-transparent bg-muted/40 shadow-none',
        accent:
          'relative border-border shadow-xs before:absolute before:left-0 before:top-5 before:bottom-5 before:w-1 before:rounded-r-full before:bg-primary',
        ribbon:
          'relative border-border shadow-xs pt-[18px] before:absolute before:inset-x-0 before:top-0 before:h-[6px] before:rounded-t-2xl before:bg-primary',
        ticket:
          'relative border-2 border-dashed border-ink-300 bg-card shadow-none',
        elevated: 'border-border shadow-md hover:shadow-lg',
      },
      tone: {
        none: '',
        success: '',
        warning: '',
        danger: '',
      },
      interactive: {
        true: 'hover:shadow-md hover:-translate-y-px transition-[transform,box-shadow] motion-reduce:hover:transform-none',
        false: '',
      },
    },
    compoundVariants: [
      // Tonal cards (subtle bg + border tonal)
      { tone: 'success', class: 'border-success-border bg-success-bg/40' },
      { tone: 'warning', class: 'border-warning-border bg-warning-bg/40' },
      { tone: 'danger', class: 'border-red-200 bg-red-50/40' },
    ],
    defaultVariants: {
      variant: 'default',
      tone: 'none',
      interactive: false,
    },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

/**
 * Card canónica con personalidad de marca:
 *
 * - `default`: el clásico (border ink-200, sombra muy sutil).
 * - `muted`: bg-muted/40, sin sombra. Para secciones de relleno.
 * - `accent`: cinta vertical roja a la izquierda — destaca cards principales del dashboard.
 * - `ribbon`: cinta roja superior — para cards de "destacado" o "stat principal".
 * - `ticket`: dashed border doble grosor — para sumarios de venta, tickets, recibos.
 * - `elevated`: sombra mayor — para overlays o highlights.
 *
 * Compose con `<Card.Header>`, `<Card.Body>`, `<Card.Footer>`.
 */
const CardRoot = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant, tone, interactive, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, tone, interactive }), className)}
      {...rest}
    />
  ),
);
CardRoot.displayName = 'Card';

function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 px-5 py-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
CardHeader.displayName = 'Card.Header';

function CardTitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-display text-lg font-bold leading-tight tracking-tight', className)}
      {...rest}
    >
      {children}
    </h3>
  );
}
CardTitle.displayName = 'Card.Title';

function CardEyebrow({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('caps text-[0.625rem] text-muted-foreground', className)} {...rest}>
      {children}
    </p>
  );
}
CardEyebrow.displayName = 'Card.Eyebrow';

function CardBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pb-4', className)} {...rest}>
      {children}
    </div>
  );
}
CardBody.displayName = 'Card.Body';

function CardFooter({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
CardFooter.displayName = 'Card.Footer';

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Eyebrow: CardEyebrow,
  Body: CardBody,
  Footer: CardFooter,
});
