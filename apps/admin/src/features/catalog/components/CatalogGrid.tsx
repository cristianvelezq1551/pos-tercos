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
import { displayBasePrice } from '../lib/display-price';
import { useSoldOutToggle } from '../hooks/useSoldOutToggle';
import { filterProductsByQuery } from '../lib/product-search';
import { categoriesInOrder, groupByCategory } from '../lib/group-by-category';
import { ALL_CATEGORIES, CatalogToolbar } from './CatalogToolbar';
import { CatalogTiles } from './CatalogTiles';
import { ProductPickerModal, type PickerSelection } from './ProductPickerModal';

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

  // El orden de los chips es el ORDEN EN QUE LLEGAN los productos: el server
  // los manda según `/categories`. Ordenarlos por nombre acá ponía "Bebidas"
  // de primera —gana por la B— que es justo el problema que se corrigió.
  const categories = useMemo(() => categoriesInOrder(products), [products]);

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
  // En "Todos" la grilla va en bloques por categoría: revuelta, las bebidas
  // —más de la mitad del catálogo— tapaban los platos. Con una categoría
  // elegida o buscando, el bloque sobra: ya está todo acotado.
  const grupos = useMemo(
    () => (searching || activeCategory !== ALL_CATEGORIES ? null : groupByCategory(visible)),
    [activeCategory, searching, visible],
  );

  const promoById = useMemo(() => {
    const at = new Date();
    const map = new Map<string, ProductPromoBadge | null>();
    for (const p of products) {
      map.set(p.id, getActivePromoBadge(p.id, displayBasePrice(p), promos, at, p.isCombo));
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

  const tileProps = {
    byId,
    soldOutOverride,
    forceAvailableOverride,
    togglingId,
    promoById,
    onOpen: openPicker,
    onToggleSoldOut: (p: Product, next: boolean) => void toggleSoldOut(p, next),
    onToggleForceAvailable: (p: Product, next: boolean) => void toggleForceAvailable(p, next),
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
      ) : grupos ? (
        <div className="flex-1 overflow-y-auto">
          {grupos.map((g) => (
            <section key={g.category ?? '(sin categoría)'}>
              {/* Pegajoso: en un catálogo largo, al bajar hay que seguir
                  sabiendo qué se está mirando. */}
              <h2 className="caps sticky top-0 z-10 bg-background/95 px-4 pb-1 pt-3 text-[0.6875rem] font-semibold text-muted-foreground backdrop-blur-sm">
                {g.category ?? 'Sin categoría'}
              </h2>
              <CatalogTiles products={g.products} hideCategory {...tileProps} />
            </section>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <CatalogTiles products={visible} {...tileProps} />
        </div>
      )}

      <ProductPickerModal
        product={selected}
        promos={promos}
        availability={selected ? byId.get(selected.id) : undefined}
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
