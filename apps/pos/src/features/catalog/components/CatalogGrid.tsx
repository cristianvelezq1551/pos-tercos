'use client';

import type { Product, ProductAvailability } from '@pos-tercos/types';
import { EmptyState, Money, cn } from '@pos-tercos/ui';
import { LineArtIllustration } from '@pos-tercos/brand';
import { useMemo, useState } from 'react';
import { useCartStore } from '../../sales';
import { setSoldOut } from '../api';
import { useAvailability } from '../hooks/useAvailability';
import { ProductPickerModal, type PickerSelection } from './ProductPickerModal';

const ALL = '__all__';

export function CatalogGrid({ products }: { products: Product[] }) {
  const addItem = useCartStore((s) => s.addItem);
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  const { byId, refresh } = useAvailability();
  // Override optimista del flag manual mientras el refetch llega.
  const [soldOutOverride, setSoldOutOverride] = useState<Map<string, boolean>>(new Map());
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  const handleToggleSoldOut = async (p: Product, nextSoldOut: boolean) => {
    setTogglingId(p.id);
    setSoldOutOverride((m) => new Map(m).set(p.id, nextSoldOut));
    try {
      await setSoldOut(p.id, nextSoldOut);
      await refresh();
    } catch {
      // Revertir el override si el backend rechazó.
      setSoldOutOverride((m) => {
        const next = new Map(m);
        next.delete(p.id);
        return next;
      });
    } finally {
      setTogglingId(null);
    }
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
            // El motivo de insumos solo cuando no es agotado manual (el toggle ya lo dice).
            const reason = manualSoldOut ? null : (avail?.reason ?? null);
            return (
              <ProductTile
                key={p.id}
                product={p}
                availability={avail}
                manualSoldOut={manualSoldOut}
                unavailable={unavailable}
                reason={reason}
                toggling={togglingId === p.id}
                onClick={() => openPicker(p)}
                onToggleSoldOut={() => void handleToggleSoldOut(p, !manualSoldOut)}
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
        'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-ink-800 hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function ProductTile({
  product,
  availability,
  manualSoldOut,
  unavailable,
  reason,
  toggling,
  onClick,
  onToggleSoldOut,
}: {
  product: Product;
  availability: ProductAvailability | undefined;
  manualSoldOut: boolean;
  unavailable: boolean;
  reason: string | null;
  toggling: boolean;
  onClick: () => void;
  onToggleSoldOut: () => void;
}) {
  const hasVariants =
    (product.sizes && product.sizes.length > 0) ||
    (product.modifiersEnabled && product.modifiers && product.modifiers.length > 0);
  // Stock numérico solo aplica a reventa directa (bebidas, snacks).
  const stock = availability && availability.stock !== null ? availability.stock : null;
  const lowStock = stock !== null && stock > 0 && stock <= 3;

  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={onClick}
        disabled={unavailable}
        aria-disabled={unavailable}
        className={cn(
          'flex h-full min-h-[128px] w-full flex-col rounded-2xl border border-border/60 bg-card p-3.5 text-left transition-[background-color,border-color,transform] duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          unavailable
            ? 'cursor-not-allowed opacity-45 saturate-0'
            : 'hover:border-border hover:bg-ink-800 active:scale-[0.98] motion-reduce:active:scale-100',
          'motion-reduce:transition-none',
        )}
      >
        {/* Categoría — altura fija (1 línea) para que todas las cards midan igual. */}
        <span className="caps line-clamp-1 h-3.5 text-[0.625rem] text-muted-foreground">
          {product.category ?? ''}
        </span>
        {/* Nombre — reserva 2 líneas siempre → cards de igual altura. */}
        <span className="mt-1 line-clamp-2 min-h-[2.5rem] text-[0.9375rem] font-semibold leading-snug text-foreground">
          {product.name}
        </span>
        <div className="mt-auto pt-3">
          <Money
            amount={product.basePrice}
            size="lg"
            weight="bold"
            className="text-foreground"
          />
          {/* Línea reservada (h-4) para que todas las cards midan igual. */}
          <span className="block h-4 text-[0.6875rem] font-medium leading-4 text-muted-foreground">
            {hasVariants ? '+ opciones' : ''}
          </span>
        </div>
      </button>

      {/* Stock de reventa (badge top-left, no altera la altura). */}
      {stock !== null && !unavailable ? (
        <span
          className={cn(
            'pointer-events-none absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[0.5625rem] font-bold tabular-nums',
            lowStock ? 'bg-warning/20 text-warning' : 'bg-ink-800/80 text-muted-foreground',
          )}
        >
          {stock} u
        </span>
      ) : null}

      {/* AGOTADO + motivo — overlay centrado, no altera la altura. */}
      {unavailable ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-background/30 px-2 text-center">
          <span className="rounded-md bg-destructive px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-destructive-foreground shadow">
            Agotado
          </span>
          {reason ? (
            <span className="line-clamp-2 max-w-[92%] text-[0.625rem] font-semibold leading-tight text-foreground">
              {reason}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Toggle manual "86" (agotar / reactivar). */}
      <button
        type="button"
        onClick={onToggleSoldOut}
        disabled={toggling}
        title={manualSoldOut ? 'Reactivar producto' : 'Marcar agotado (86)'}
        className={cn(
          'absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          toggling && 'opacity-50',
          manualSoldOut
            ? 'bg-success/20 text-success hover:bg-success/30'
            : 'bg-ink-800 text-muted-foreground hover:bg-destructive/15 hover:text-destructive',
        )}
      >
        {manualSoldOut ? 'Reactivar' : '86'}
      </button>
    </div>
  );
}
