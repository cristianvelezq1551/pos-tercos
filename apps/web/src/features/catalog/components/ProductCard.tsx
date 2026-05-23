'use client';

import type { PublicMenuProduct } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import { Plus } from 'lucide-react';
import { COP } from '../../../lib/format';

export function ProductCard({
  product,
  unavailable = false,
  onClick,
}: {
  product: PublicMenuProduct;
  unavailable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={unavailable}
      aria-disabled={unavailable}
      className={cn(
        'group w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'flex items-center gap-3 border-b border-border py-4',
        'sm:card-lift sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:rounded-xl sm:border-0 sm:bg-card sm:py-0',
        unavailable
          ? 'cursor-not-allowed opacity-50'
          : 'active:scale-[0.99] sm:hover:bg-muted/60 sm:active:scale-100',
      )}
    >
      <div
        className={cn(
          'relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted',
          'sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none',
        )}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className={cn(
              'h-full w-full object-cover sm:transition-transform sm:duration-300',
              unavailable ? 'grayscale' : 'sm:group-hover:scale-105',
            )}
            loading="lazy"
          />
        ) : (
          <ImageFallback label={product.name} />
        )}
        {unavailable ? (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-destructive px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-destructive-foreground shadow">
            Agotado
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-2 sm:p-4">
        <h3 className="text-sm font-bold leading-tight text-foreground sm:text-base">
          {product.name}
        </h3>
        {product.description ? (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground sm:text-sm">
            {product.description}
          </p>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-3 sm:mt-3">
          <span className="text-sm font-bold tabular-nums text-foreground sm:order-2 sm:text-base sm:text-primary">
            {COP.format(product.basePrice)}
          </span>
          {unavailable ? (
            <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground sm:order-1 sm:h-9">
              Agotado
            </span>
          ) : (
            <span
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors sm:order-1 sm:h-9',
                'bg-primary text-primary-foreground hover:bg-red-700',
                'sm:bg-muted sm:text-foreground sm:hover:bg-background',
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
              Agregar
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ImageFallback({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || 'T';
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-background">
      <span className="font-display text-5xl font-extrabold uppercase tracking-[0.04em] text-white/10 sm:text-7xl">
        {initial}
      </span>
    </div>
  );
}
