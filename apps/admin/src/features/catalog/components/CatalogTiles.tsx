'use client';

import type { Product, ProductAvailability } from '@pos-tercos/types';
import type { ProductPromoBadge } from '../../sales';
import { ProductTile } from './ProductTile';

export interface CatalogTilesProps {
  products: Product[];
  /** La grilla va en bloques y el encabezado ya dice la categoría. */
  hideCategory?: boolean;
  byId: Map<string, ProductAvailability>;
  soldOutOverride: Map<string, boolean>;
  forceAvailableOverride: Map<string, boolean>;
  togglingId: string | null;
  promoById: Map<string, ProductPromoBadge | null>;
  onOpen: (p: Product) => void;
  onToggleSoldOut: (p: Product, next: boolean) => void;
  onToggleForceAvailable: (p: Product, next: boolean) => void;
}

/**
 * Una tanda de tarjetas de producto. Vive aparte porque se rinde en dos
 * sitios: la vista plana (una categoría o una búsqueda) y cada bloque de la
 * vista agrupada.
 *
 * La grilla le pone MÁXIMO a la columna, no solo mínimo. Con `1fr` suelto, en
 * una pantalla angosta el ancho sobrante se repartía entre pocas columnas y
 * cada tarjeta crecía de 164 a 191 px: en el monitor del local se veía enorme
 * y entraban la mitad de los productos. Medido a 1242 px.
 */
export function CatalogTiles({
  products,
  hideCategory = false,
  byId,
  soldOutOverride,
  forceAvailableOverride,
  togglingId,
  promoById,
  onOpen,
  onToggleSoldOut,
  onToggleForceAvailable,
}: CatalogTilesProps) {
  return (
    <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(min(120px,100%),160px))] justify-center gap-3 p-3 sm:p-4">
      {products.map((p) => {
        const avail = byId.get(p.id);
        const manualSoldOut = soldOutOverride.get(p.id) ?? p.soldOut;
        const forced = forceAvailableOverride.get(p.id) ?? p.forceAvailable;
        // Sin stock por cómputo del backend (insumo/subproducto no alcanza).
        const computedUnavailable = avail ? !avail.available : false;
        // 86 manual pisa todo; forzar disponible pisa la falta de stock.
        const unavailable = manualSoldOut || (!forced && computedUnavailable);
        const reason = manualSoldOut ? null : forced ? null : (avail?.reason ?? null);
        return (
          <ProductTile
            key={p.id}
            product={p}
            hideCategory={hideCategory}
            availability={avail}
            manualSoldOut={manualSoldOut}
            forced={forced}
            computedUnavailable={computedUnavailable}
            unavailable={unavailable}
            reason={reason}
            toggling={togglingId === p.id}
            promo={promoById.get(p.id) ?? null}
            onClick={() => onOpen(p)}
            onToggleSoldOut={() => onToggleSoldOut(p, !manualSoldOut)}
            onToggleForceAvailable={(next) => onToggleForceAvailable(p, next)}
          />
        );
      })}
    </div>
  );
}
