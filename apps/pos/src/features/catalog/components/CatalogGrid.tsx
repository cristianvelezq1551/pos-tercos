'use client';

import type { Product } from '@pos-tercos/types';
import { useMemo, useState } from 'react';
import { COP } from '../lib/format';
import { ProductPickerModal, type PickerSelection } from './ProductPickerModal';

const ALL = '__all__';

export function CatalogGrid({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<PickerSelection | null>(null);
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
    setLastAdded(sel);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
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
          {visible.length} de {products.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12 text-center text-sm text-gray-500">
          No hay productos activos en esta categoría.
        </div>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((p) => (
            <ProductTile key={p.id} product={p} onClick={() => openPicker(p)} />
          ))}
        </div>
      )}

      {lastAdded ? (
        <div className="border-t border-gray-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Agregado: <strong>{lastAdded.productName}</strong>
          {lastAdded.size ? ` · ${lastAdded.size.name}` : ''}
          {lastAdded.modifiers.length > 0
            ? ` · ${lastAdded.modifiers.map((m) => m.name).join(', ')}`
            : ''}{' '}
          × {lastAdded.quantity} ={' '}
          <span className="font-semibold tabular-nums">
            {COP.format(lastAdded.unitPrice * lastAdded.quantity)}
          </span>
          <span className="ml-2 text-xs text-emerald-600">
            (carrito real entra en 5.E.4)
          </span>
        </div>
      ) : null}

      <ProductPickerModal
        product={selected}
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
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

function ProductTile({ product, onClick }: { product: Product; onClick: () => void }) {
  const hasVariants =
    (product.sizes && product.sizes.length > 0) ||
    (product.modifiersEnabled && product.modifiers && product.modifiers.length > 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-blue-400 hover:shadow-sm"
    >
      <span className="line-clamp-2 text-sm font-semibold text-gray-900">
        {product.name}
      </span>
      {product.category ? (
        <span className="mt-1 text-xs text-gray-500">{product.category}</span>
      ) : null}
      <span className="mt-2 text-base font-bold tabular-nums text-blue-700">
        {COP.format(product.basePrice)}
      </span>
      {hasVariants ? (
        <span className="mt-1 text-xs text-gray-400">+ opciones</span>
      ) : null}
    </button>
  );
}
