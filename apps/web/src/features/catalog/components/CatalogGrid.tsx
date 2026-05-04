'use client';

import type { PublicMenuProduct } from '@pos-tercos/types';
import { useMemo, useState } from 'react';
import { useCartStore } from '../../cart/store/cart-store';
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
  const [selected, setSelected] = useState<PublicMenuProduct | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  const visible = useMemo(() => {
    if (activeCategory === ALL) return products;
    return products.filter((p) => p.category === activeCategory);
  }, [activeCategory, products]);

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
    <>
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <CategoryChip
          label="Todo"
          active={activeCategory === ALL}
          onClick={() => setActiveCategory(ALL)}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            active={activeCategory === c}
            onClick={() => setActiveCategory(c)}
          />
        ))}
        <span className="ml-auto text-xs text-gray-500">
          {visible.length} producto{visible.length === 1 ? '' : 's'}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12 text-center text-sm text-gray-500">
          No hay productos disponibles en esta categoría.
        </div>
      ) : (
        <div className="grid auto-rows-min grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onClick={() => {
                setSelected(p);
                setOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <ProductPickerModal
        product={selected}
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}

function CategoryChip({
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
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
