'use client';

import type {
  ProductModifier,
  ProductSize,
  PublicMenuProduct,
} from '@pos-tercos/types';
import { cn } from '@pos-tercos/ui';
import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { COP } from '../../../lib/format';

export interface PickerSelection {
  productId: string;
  productName: string;
  imageUrl: string | null;
  size: ProductSize | null;
  modifiers: ProductModifier[];
  quantity: number;
  unitPrice: number;
}

export function ProductPickerModal({
  product,
  open,
  onClose,
  onConfirm,
}: {
  product: PublicMenuProduct | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (sel: PickerSelection) => void;
}) {
  const sizes = useMemo(() => product?.sizes ?? [], [product]);
  const modifiers = useMemo(() => product?.modifiers ?? [], [product]);
  const modifiersEnabled = product?.modifiersEnabled ?? false;
  const requiresSize = sizes.length > 0;

  const [sizeId, setSizeId] = useState<string | null>(null);
  const [modifierIds, setModifierIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (open && product) {
      const sortedSizes = [...sizes].sort((a, b) => a.sortOrder - b.sortOrder);
      setSizeId(sortedSizes[0]?.id ?? null);
      setModifierIds(new Set());
      setQuantity(1);
    }
  }, [open, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const selectedSize = useMemo(
    () => (sizeId ? sizes.find((s) => s.id === sizeId) ?? null : null),
    [sizeId, sizes],
  );
  const selectedModifiers = useMemo(
    () => modifiers.filter((m) => modifierIds.has(m.id)),
    [modifierIds, modifiers],
  );

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    const sizeMod = selectedSize?.priceModifier ?? 0;
    const modSum = selectedModifiers.reduce((acc, m) => acc + m.priceDelta, 0);
    return product.basePrice + sizeMod + modSum;
  }, [product, selectedSize, selectedModifiers]);

  if (!open || !product) return null;

  const canConfirm = (!requiresSize || sizeId !== null) && quantity > 0;
  const totalPrice = unitPrice * quantity;
  const sortedSizes = [...sizes].sort((a, b) => a.sortOrder - b.sortOrder);

  const toggleModifier = (id: string) => {
    setModifierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      size: selectedSize,
      modifiers: selectedModifiers,
      quantity,
      unitPrice,
    });
    onClose();
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/70 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out] sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex min-h-full w-full max-w-none flex-col overflow-hidden bg-card shadow-xl motion-safe:animate-[scaleIn_150ms_ease-out] sm:my-8 sm:min-h-0 sm:max-w-[520px] sm:rounded-2xl"
      >
        <div className="relative aspect-[520/280] w-full overflow-hidden bg-muted sm:aspect-[520/240]">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-800 to-ink-950">
              <span className="font-display text-8xl font-extrabold uppercase tracking-[0.04em] text-white/10">
                {product.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black/80"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
          {product.category ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {product.category}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <h2
              id="picker-title"
              className="text-2xl font-bold leading-tight text-foreground"
            >
              {product.name}
            </h2>
            {product.description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            ) : null}
          </div>

          <p className="text-2xl font-bold tabular-nums text-foreground">
            {COP.format(product.basePrice)}
          </p>

          <div className="h-px w-full bg-border" />

          {requiresSize ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-foreground">Tamaño</p>
              <div className="flex flex-col gap-2">
                {sortedSizes.map((s) => {
                  const checked = sizeId === s.id;
                  return (
                    <label
                      key={s.id}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
                        checked
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border hover:border-muted-foreground',
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="picker-size"
                          value={s.id}
                          checked={checked}
                          onChange={() => setSizeId(s.id)}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="font-medium">{s.name}</span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.priceModifier === 0
                          ? '—'
                          : `${s.priceModifier > 0 ? '+' : ''}${COP.format(s.priceModifier)}`}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="h-px w-full bg-border" />
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Cantidad</p>
            <div className="inline-flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Quitar uno"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-30"
              >
                <Minus className="h-4 w-4" strokeWidth={2} />
              </button>
              <span className="w-8 text-center text-base font-semibold tabular-nums text-foreground">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Sumar uno"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>

          {modifiersEnabled && modifiers.length > 0 ? (
            <>
              <div className="h-px w-full bg-border" />
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-foreground">Extras</p>
                <div className="flex flex-col gap-2.5">
                  {modifiers.map((m) => {
                    const checked = modifierIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-3 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModifier(m.id)}
                          className="h-4 w-4 shrink-0 rounded-sm border border-input bg-card accent-primary"
                        />
                        <span className="flex-1">
                          {m.name}
                          {m.priceDelta !== 0 ? (
                            <span className="ml-1 tabular-nums text-muted-foreground">
                              {m.priceDelta > 0 ? '+' : ''}
                              {COP.format(m.priceDelta)}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <footer className="sticky bottom-0 border-t border-border bg-card p-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:static sm:border-t-0 sm:p-6 sm:pt-0">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-md transition-colors hover:bg-red-700 hover:shadow-primary/30 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agregar al carrito — {COP.format(totalPrice)}
          </button>
        </footer>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96) translateY(-4px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>
  );
}
