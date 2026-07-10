'use client';

import type { Product, Promotion } from '@pos-tercos/types';
import { EmptyState } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { useMemo, useState } from 'react';
import { usePolling } from '../../../lib/use-polling';
import { fetchActivePromotions, useCartStore } from '../../sales';
import { getActivePromoBadge } from '../../sales/lib/promo-preview';
import { useAvailability } from '../hooks/useAvailability';
import { useSoldOutToggle } from '../hooks/useSoldOutToggle';
import { CategoryTab } from './CategoryTab';
import { ProductPickerModal, type PickerSelection } from './ProductPickerModal';
import { ProductTile } from './ProductTile';

/** Re-fetch de promos cada 60s: refleja cambios rápido desde admin. */
const PROMO_REFRESH_MS = 60_000;

const ALL = '__all__';

export function CatalogGrid({ products }: { products: Product[] }) {
  const addItem = useCartStore((s) => s.addItem);
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

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
  const { soldOutOverride, togglingId, toggleSoldOut } = useSoldOutToggle(refresh);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [products]);

  const visible = useMemo(() => {
    if (activeCategory === ALL) return products;
    return products.filter((p) => p.category === activeCategory);
  }, [activeCategory, products]);

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
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Categorías · chips que envuelven en varias líneas (sin scroll). */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2.5 sm:px-4">
        <CategoryTab
          label="Todo"
          active={activeCategory === ALL}
          onClick={() => setActiveCategory(ALL)}
        />
        {categories.map((c) => (
          <CategoryTab
            key={c}
            label={c}
            active={activeCategory === c}
            onClick={() => setActiveCategory(c)}
          />
        ))}
        <span className="caps ml-auto pl-2 text-[0.625rem] text-muted-foreground">
          {visible.length} de {products.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            illustration={<LineArtIllustration name="empty-plate" />}
            title="No hay productos activos en esta categoría"
            size="sm"
          />
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(min(150px,100%),1fr))] gap-3 overflow-y-auto p-3 sm:p-4">
          {visible.map((p) => {
            const avail = byId.get(p.id);
            const manualSoldOut = soldOutOverride.get(p.id) ?? p.soldOut;
            const unavailable = manualSoldOut || (avail ? !avail.available : false);
            const reason = manualSoldOut ? null : (avail?.reason ?? null);
            const promoBadge = getActivePromoBadge(p.id, p.basePrice, promos);
            return (
              <ProductTile
                key={p.id}
                product={p}
                availability={avail}
                manualSoldOut={manualSoldOut}
                unavailable={unavailable}
                reason={reason}
                toggling={togglingId === p.id}
                promo={promoBadge}
                onClick={() => openPicker(p)}
                onToggleSoldOut={() => void toggleSoldOut(p, !manualSoldOut)}
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
