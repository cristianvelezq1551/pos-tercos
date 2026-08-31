'use client';

import type { PublicMenuProduct } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import { Plus } from 'lucide-react';
import { COP } from '../../../lib/format';
import { displayBasePrice } from '../../../lib/menu-price';
import { getMenuPromoBadge, usePromotions } from '../../promotions';
import { ProductImage } from './ProductImage';

export function ProductCard({
  product,
  unavailable = false,
  closed = false,
  onClick,
}: {
  product: PublicMenuProduct;
  /** Sin stock: el producto no se puede vender aunque el local esté abierto. */
  unavailable?: boolean;
  /**
   * El local no está tomando pedidos. Distinto de `unavailable`: el producto
   * existe y hay, pero ahora no se puede pedir. Por eso NO dice "Agotado" —
   * sería mentir sobre el motivo, y mañana el mismo producto se vende igual.
   */
  closed?: boolean;
  onClick: () => void;
}) {
  const promotions = usePromotions((s) => s.promotions);
  const price = displayBasePrice(product);
  const promo = unavailable
    ? null
    : getMenuPromoBadge(product.id, price, promotions, undefined, product.isCombo);
  // Se puede mirar el menú, no agregar: quien está cerrado igual quiere que le
  // vean los precios.
  const noSePuedePedir = unavailable || closed;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={noSePuedePedir}
      aria-disabled={noSePuedePedir}
      className={cn(
        'group w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'flex items-center gap-3 border-b border-border py-4',
        'sm:card-lift sm:flex-col sm:items-stretch sm:gap-0 sm:overflow-hidden sm:rounded-xl sm:border-0 sm:bg-card sm:py-0',
        unavailable
          ? 'cursor-not-allowed opacity-50'
          : closed
            ? // Cerrado atenúa menos que agotado: el menú se sigue leyendo.
              'cursor-not-allowed opacity-75'
            : 'active:scale-[0.99] sm:hover:bg-muted/60 sm:active:scale-100',
      )}
    >
      <div
        className={cn(
          'relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted',
          'sm:aspect-square sm:h-auto sm:w-full sm:rounded-none',
        )}
      >
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          unavailable={unavailable}
          zoomOnHover
        />
        {unavailable ? (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-destructive px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-destructive-foreground shadow">
            Agotado
          </span>
        ) : null}
        {promo ? (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[0.625rem] font-bold text-white shadow sm:left-2 sm:top-2 sm:px-2 sm:py-1 sm:text-xs">
            {promo.label}
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
          {promo?.discountedPrice != null ? (
            <span className="flex flex-col items-start sm:order-2 sm:items-end">
              <span className="text-xs tabular-nums text-muted-foreground line-through">
                {COP.format(price)}
              </span>
              <span className="text-sm font-bold tabular-nums text-emerald-500 sm:text-base">
                {COP.format(promo.discountedPrice)}
              </span>
            </span>
          ) : (
            <span className="text-sm font-bold tabular-nums text-foreground sm:order-2 sm:text-base sm:text-primary">
              {COP.format(price)}
            </span>
          )}
          {unavailable ? (
            <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground sm:order-1 sm:h-9">
              Agotado
            </span>
          ) : closed ? (
            <span className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground sm:order-1 sm:h-9">
              Cerrado
            </span>
          ) : (
            <span
              className={cn(
                // 44px en móvil: es el botón que convierte y se toca con el
                // pulgar. Estaba al revés (32px con el dedo, 36px con el mouse).
                'inline-flex h-11 items-center gap-1 rounded-full px-4 text-xs font-semibold transition-colors sm:order-1 sm:h-9 sm:px-3',
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
