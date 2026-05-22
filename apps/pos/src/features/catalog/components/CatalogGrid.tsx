'use client';

import type { Product } from '@pos-tercos/types';
import { EmptyState, Money, cn } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { useMemo, useState } from 'react';
import { useCartStore } from '../../sales';
import { ProductPickerModal, type PickerSelection } from './ProductPickerModal';

const ALL = '__all__';

export function CatalogGrid({ products }: { products: Product[] }) {
  const addItem = useCartStore((s) => s.addItem);
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

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
      {/* Tabs categoría · estilo flat con underline activo */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-3">
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
        <span className="caps ml-auto shrink-0 text-[0.625rem] text-muted-foreground">
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
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((p) => (
            <ProductTile key={p.id} product={p} onClick={() => openPicker(p)} />
          ))}
        </div>
      )}

      <ProductPickerModal
        product={selected}
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
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
      className={cn(
        'relative shrink-0 px-3 py-2 text-sm font-semibold transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md',
        active
          ? 'text-foreground after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:bg-primary'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function ProductTile({ product, onClick }: { product: Product; onClick: () => void }) {
  const hasVariants =
    (product.sizes && product.sizes.length > 0) ||
    (product.modifiersEnabled && product.modifiers && product.modifiers.length > 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col rounded-2xl border border-transparent bg-card p-4 text-left transition-[background-color,border-color,transform] duration-150 ease-out',
        'hover:bg-ink-800',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-[0.98]',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
      )}
    >
      {product.category ? (
        <span className="caps text-[0.625rem] text-muted-foreground">
          {product.category}
        </span>
      ) : null}
      <span className="mt-1 line-clamp-2 text-base font-semibold leading-tight text-foreground">
        {product.name}
      </span>
      <div className="mt-auto pt-4">
        <Money
          amount={product.basePrice}
          size="lg"
          weight="bold"
          className="text-foreground"
        />
        {hasVariants ? (
          <span className="ml-2 text-[0.6875rem] font-medium text-muted-foreground">
            + opciones
          </span>
        ) : null}
      </div>
    </button>
  );
}
