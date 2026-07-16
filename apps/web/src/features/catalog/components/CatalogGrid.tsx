'use client';

import type { PublicMenuProduct } from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCartStore } from '../../cart/store/cart-store';
import { useAvailability } from '../hooks/useAvailability';
import { ProductCard } from './ProductCard';
import { ProductPickerModal, type PickerSelection } from './ProductPickerModal';

const ALL = '__all__';

export function CatalogGrid({
  products,
  categories,
}: {
  products: PublicMenuProduct[];
  categories: string[];
}) {
  const addItem = useCartStore((s) => s.addItem);
  const availability = useAvailability();
  const [selected, setSelected] = useState<PublicMenuProduct | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(ALL);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory !== ALL && p.category !== activeCategory) return false;
      if (!q) return true;
      const haystack = `${p.name} ${p.description ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [activeCategory, products, query]);

  const handleConfirm = (sel: PickerSelection) => {
    addItem({
      productId: sel.productId,
      productName: sel.productName,
      imageUrl: sel.imageUrl,
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
      notes: sel.notes,
    });
  };

  const tabs: { value: string; label: string }[] = [
    { value: ALL, label: 'Todo' },
    ...categories.map((c) => ({ value: c, label: c })),
  ];

  return (
    <section id="menu" className="px-4 py-6 sm:px-12 sm:py-12 lg:px-20">
      <header className="mb-5 flex flex-col gap-4 sm:mb-8 sm:gap-6">
        <h2 className="reveal-up hidden font-display text-5xl font-extrabold uppercase leading-none tracking-[0.02em] text-foreground sm:block sm:text-6xl">
          Menú
        </h2>

        <label className="relative block sm:max-w-sm">
          <span className="sr-only">Buscar en el menú</span>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el menú"
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:gap-1 sm:overflow-visible sm:rounded-full sm:bg-secondary sm:p-1 sm:pb-1">
            {tabs.map((tab) => (
              <CategoryTab
                key={tab.value}
                label={tab.label}
                active={activeCategory === tab.value}
                onClick={() => setActiveCategory(tab.value)}
              />
            ))}
          </div>
          <span className="ml-auto text-xs font-medium text-muted-foreground sm:text-sm">
            {visible.length} {visible.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No hay productos {query ? `para "${query}"` : 'disponibles en esta categoría'}.
        </div>
      ) : (
        <div className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((p) => {
            const avail = availability.get(p.id);
            const unavailable = avail ? !avail.available : false;
            return (
              <ProductCard
                key={p.id}
                product={p}
                unavailable={unavailable}
                onClick={() => {
                  if (unavailable) return;
                  setSelected(p);
                  setOpen(true);
                }}
              />
            );
          })}
        </div>
      )}

      <ProductPickerModal
        product={selected}
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </section>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-full px-4 text-xs font-semibold transition-colors sm:h-8',
        active
          ? 'bg-primary text-primary-foreground sm:bg-background sm:text-foreground sm:shadow-sm'
          : 'border border-border bg-card text-muted-foreground hover:text-foreground sm:border-0 sm:bg-transparent',
      )}
    >
      {label}
    </button>
  );
}
