'use client';

import type { Product, ProductAvailability } from '@pos-tercos/types';
import { Money, cn, formatCop } from '@pos-tercos/ui';
import type { ProductPromoBadge } from '../../sales/lib/promo-preview';

export function ProductTile({
  product,
  availability,
  manualSoldOut,
  unavailable,
  reason,
  toggling,
  promo,
  onClick,
  onToggleSoldOut,
}: {
  product: Product;
  availability: ProductAvailability | undefined;
  manualSoldOut: boolean;
  unavailable: boolean;
  reason: string | null;
  toggling: boolean;
  promo: ProductPromoBadge | null;
  onClick: () => void;
  onToggleSoldOut: () => void;
}) {
  const hasVariants =
    (product.sizes && product.sizes.length > 0) ||
    (product.modifiersEnabled && product.modifiers && product.modifiers.length > 0);
  // Stock numérico solo aplica a reventa directa (bebidas, snacks).
  const stock = availability && availability.stock !== null ? availability.stock : null;
  const lowStock = stock !== null && stock > 0 && stock <= 3;
  // Mostrar el chip de promo solo si está disponible (si no, queda raro).
  const showPromo = promo !== null && !unavailable;

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onClick}
        disabled={unavailable}
        aria-disabled={unavailable}
        className={cn(
          'flex aspect-square w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          unavailable
            ? 'cursor-not-allowed opacity-45 saturate-0'
            : 'hover:border-border hover:bg-ink-800 active:scale-[0.98] motion-reduce:active:scale-100',
          'motion-reduce:transition-none',
        )}
      >
        {/* Categoría — deja hueco a la derecha para el botón 86. */}
        <span className="caps line-clamp-1 pr-9 text-[0.625rem] text-muted-foreground">
          {product.category ?? ''}
        </span>

        {/* Ícono para identificar el producto de un vistazo — arriba, tamaño
            moderado (no compite con el nombre ni el precio). */}
        {product.emoji ? (
          <span aria-hidden className="mt-1 text-[1.875rem] leading-none">
            {product.emoji}
          </span>
        ) : null}

        {/* Aire flexible → ancla el pie abajo y equilibra el cuadrado. */}
        <div className="min-h-0 flex-1" />

        {/* Pie: nombre + precio con el tag de descuento AL LADO. */}
        <div className="flex shrink-0 flex-col gap-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {product.name}
          </span>
          {/* Precio base tachado cuando hay descuento que reduce el precio. */}
          {showPromo && promo.discountedPrice !== null ? (
            <span className="text-[0.6875rem] leading-none text-muted-foreground line-through tabular-nums">
              {formatCop(product.basePrice)}
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <Money
              amount={
                showPromo && promo.discountedPrice !== null
                  ? promo.discountedPrice
                  : product.basePrice
              }
              size="lg"
              weight="bold"
              className={
                showPromo && promo.discountedPrice !== null
                  ? 'text-success'
                  : 'text-foreground'
              }
            />
            {/* Tag de descuento — junto al precio. */}
            {showPromo ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide',
                  promo.kind === 'discount'
                    ? 'bg-success/20 text-success'
                    : 'bg-info/20 text-info',
                )}
              >
                {promo.label}
              </span>
            ) : null}
            {/* Stock de reventa: chip a la derecha. */}
            {stock !== null && !unavailable ? (
              <span
                className={cn(
                  'ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums',
                  lowStock ? 'bg-warning/20 text-warning' : 'bg-ink-800/80 text-muted-foreground',
                )}
              >
                {stock} u
              </span>
            ) : null}
          </div>
          {hasVariants ? (
            <span className="text-[0.6875rem] font-medium leading-4 text-muted-foreground">
              + opciones
            </span>
          ) : null}
        </div>
      </button>

      {/* AGOTADO + motivo — overlay centrado, no altera la altura. */}
      {unavailable ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-background/30 px-2 text-center">
          <span className="rounded-md bg-destructive px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-destructive-foreground shadow">
            Agotado
          </span>
          {reason ? (
            <span className="line-clamp-2 max-w-[92%] text-[0.625rem] font-semibold leading-tight text-foreground">
              {reason}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Toggle manual "86" (agotar / reactivar). */}
      <button
        type="button"
        onClick={onToggleSoldOut}
        disabled={toggling}
        title={manualSoldOut ? 'Reactivar producto' : 'Marcar agotado (86)'}
        className={cn(
          'absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          toggling && 'opacity-50',
          manualSoldOut
            ? 'bg-success/20 text-success hover:bg-success/30'
            : 'bg-ink-800 text-muted-foreground hover:bg-destructive/15 hover:text-destructive',
        )}
      >
        {manualSoldOut ? 'Reactivar' : '86'}
      </button>
    </div>
  );
}
