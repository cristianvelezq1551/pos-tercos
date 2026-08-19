'use client';

import type { Product } from '@pos-tercos/types';
import { useMemo } from 'react';

/**
 * Chips de "Agregar producto" en la edición de un pedido: con la cocina en
 * curso solo se ofrecen productos de reventa directa, y lo agotado se ve
 * tachado y no se puede agregar.
 */
export function AddProductChips({
  products,
  kitchenStarted,
  pending,
  isAvailable,
  onPick,
}: {
  products: Product[];
  kitchenStarted: boolean;
  pending: boolean;
  isAvailable: (productId: string) => boolean;
  onPick: (product: Product) => void;
}) {
  // Cocina en curso → solo se pueden AGREGAR productos de reventa directa.
  const addable = useMemo(
    () => products.filter((p) => (kitchenStarted ? p.directResale : true)),
    [products, kitchenStarted],
  );

  return (
    <div>
      <p className="caps mb-1 text-[0.625rem] text-muted-foreground">Agregar producto</p>
      <div className="flex flex-wrap gap-1.5">
        {addable.slice(0, 24).map((p) => {
          const soldOut = !isAvailable(p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={pending || soldOut}
              onClick={() => onPick(p)}
              title={soldOut ? 'Agotado — no se puede agregar' : undefined}
              className={
                soldOut
                  ? 'cursor-not-allowed rounded-full border border-border bg-muted/20 px-2.5 py-1 text-xs font-medium text-muted-foreground/50 line-through'
                  : 'rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground'
              }
            >
              + {p.name}
              {soldOut ? ' · Agotado' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
