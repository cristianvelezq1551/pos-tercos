'use client';

import type { Product } from '@pos-tercos/types';
import { useMemo, useState } from 'react';
import { ListSearch } from '../../../components/ListSearch';
import { filtrarPorTexto } from '../../../lib/buscar';

/**
 * Chips de "Agregar producto" en la edición de un pedido: con la cocina en
 * curso solo se ofrecen productos de reventa directa, y lo agotado se ve
 * tachado y no se puede agregar.
 *
 * Se muestran TODOS los productos y hay un buscador. Antes se cortaba en los
 * primeros 24: lo que quedaba después (bebidas, Porción papas, Perros TERCOS)
 * no se podía agregar a un pedido ya cobrado y el cajero tenía que hacer otra
 * venta aparte.
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
  const [query, setQuery] = useState('');
  // Cocina en curso → solo se pueden AGREGAR productos de reventa directa.
  const addable = useMemo(
    () => products.filter((p) => (kitchenStarted ? p.directResale : true)),
    [products, kitchenStarted],
  );
  const visibles = useMemo(
    () => filtrarPorTexto(addable, query, (p) => `${p.name} ${p.category ?? ''}`),
    [addable, query],
  );

  return (
    <div>
      <p className="caps mb-1 text-[0.625rem] text-muted-foreground">Agregar producto</p>
      <ListSearch
        value={query}
        onChange={setQuery}
        placeholder="Buscar producto"
        label="Buscar producto para agregar al pedido"
        visibleCount={visibles.length}
        totalCount={addable.length}
        noun={['producto', 'productos']}
      />
      {visibles.length === 0 && query.trim() ? (
        <p className="text-xs text-muted-foreground">
          Ningún producto coincide con «{query.trim()}». Revisa cómo está escrito o limpia la búsqueda.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {visibles.map((p) => {
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
