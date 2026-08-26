'use client';

import type { Product, Promotion } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { useMemo, useState } from 'react';
import { usePolling } from '../../../lib/use-polling';
import { fetchActivePromotions, useCartStore } from '../../sales';
import {
  getActivePromoBadge,
  type ProductPromoBadge,
} from '../../sales/lib/promo-preview';
import { useAvailability } from '../hooks/useAvailability';
import { useSoldOutToggle } from '../hooks/useSoldOutToggle';
import { filterProductsByQuery } from '../lib/product-search';
import { ALL_CATEGORIES, CatalogToolbar } from './CatalogToolbar';
import { ProductPickerModal, type PickerSelection } from './ProductPickerModal';
import { ProductTile } from './ProductTile';

/** Re-fetch de promos cada 60s: refleja cambios rápido desde admin. */
const PROMO_REFRESH_MS = 60_000;

export function CatalogGrid({ products }: { products: Product[] }) {
  const addItem = useCartStore((s) => s.addItem);
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const { byId, refresh } = useAvailability();
  const [promos, setPromos] = useState<Promotion[]>([]);

  // Cargar promos activas + refrescar cada 60s. Mismas que el carrito usa.
  usePolling(async () => {
    try {
      setPromos(await fetchActivePromotions());
    } catch {
      // sin red: se mantienen las últimas promos conocidas
    }
  }, PROMO_REFRESH_MS);
  const { soldOutOverride, forceAvailableOverride, togglingId, toggleSoldOut, toggleForceAvailable } =
    useSoldOutToggle(refresh);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [products]);

  // Buscar manda sobre la categoría: el alcance es TODO el menú.
  const searching = query.trim().length > 0;
  const visible = useMemo(() => {
    if (searching) return filterProductsByQuery(products, query);
    if (activeCategory === ALL_CATEGORIES) return products;
    return products.filter((p) => p.category === activeCategory);
  }, [activeCategory, products, query, searching]);

  // El badge de promo se calcula UNA vez por (catálogo, promos), no por tile en
  // cada render: `getActivePromoBadge` refiltra y remapea todas las promos por
  // producto, y teclear re-renderiza la grilla entera. Se refresca solo cuando
  // entra una tanda nueva de promos (cada 60s).
  const promoById = useMemo(() => {
    const at = new Date();
    const map = new Map<string, ProductPromoBadge | null>();
    for (const p of products) {
      map.set(p.id, getActivePromoBadge(p.id, p.basePrice, promos, at, p.isCombo));
    }
    return map;
  }, [products, promos]);

  const handleQueryChange = (next: string) => {
    setQuery(next);
    // Al teclear, el filtro de categoría deja de aplicar: que los chips lo digan.
    if (next.trim()) setActiveCategory(ALL_CATEGORIES);
  };

  const handleSelectCategory = (category: string) => {
    setActiveCategory(category);
    setQuery('');
  };

  const openPicker = (p: Product) => {
    setSelected(p);
    setOpen(true);
  };

  const handleConfirm = (sel: PickerSelection) => {
    addItem({
      productId: sel.productId,
      productName: sel.productName,
      size: sel.size
        ? { id: sel.size.id, name: sel.size.name, priceModifier: sel.size.priceModifier }
        : null,
      modifiers: sel.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        priceDelta: m.priceDelta,
      })),
      quantity: sel.quantity,
      unitPrice: sel.unitPrice,
      isCombo: sel.isCombo,
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <CatalogToolbar
        categories={categories}
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
        query={query}
        onQueryChange={handleQueryChange}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        visibleCount={visible.length}
        totalCount={products.length}
      />

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            illustration={<LineArtIllustration name="empty-plate" />}
            title={
              searching
                ? `No hay productos que coincidan con "${query.trim()}"`
                : 'No hay productos activos en esta categoría'
            }
            size="sm"
          />
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-3 overflow-y-auto p-3 sm:p-4">
          {visible.map((p) => {
            const avail = byId.get(p.id);
            const manualSoldOut = soldOutOverride.get(p.id) ?? p.soldOut;
            const forced = forceAvailableOverride.get(p.id) ?? p.forceAvailable;
            // Sin stock por cómputo del backend (insumo/subproducto no alcanza).
            const computedUnavailable = avail ? !avail.available : false;
            // 86 manual pisa todo; forzar disponible pisa la falta de stock.
            const unavailable = manualSoldOut || (!forced && computedUnavailable);
            const reason = manualSoldOut ? null : forced ? null : (avail?.reason ?? null);
            const promoBadge = promoById.get(p.id) ?? null;
            return (
              <ProductTile
                key={p.id}
                product={p}
                availability={avail}
                manualSoldOut={manualSoldOut}
                forced={forced}
                computedUnavailable={computedUnavailable}
                unavailable={unavailable}
                reason={reason}
                toggling={togglingId === p.id}
                promo={promoBadge}
                onClick={() => openPicker(p)}
                onToggleSoldOut={() => void toggleSoldOut(p, !manualSoldOut)}
                onToggleForceAvailable={(next) => void toggleForceAvailable(p, next)}
              />
            );
          })}
        </div>
      )}

      <ProductPickerModal
        product={selected}
        promos={promos}
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
