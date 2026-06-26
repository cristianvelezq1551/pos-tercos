'use client';

import type {
  ProductSize,
  PublicMenuModifier,
  PublicMenuProduct,
} from '@pos-tercos/types';
import { useEffect, useMemo, useState } from 'react';
import { COP } from '../../../lib/format';
import { displayBasePrice } from '../../../lib/menu-price';
import { PickerHeader } from './picker/PickerHeader';
import { PickerModifiers } from './picker/PickerModifiers';
import { PickerNotes } from './picker/PickerNotes';
import { PickerQuantity } from './picker/PickerQuantity';
import { PickerSizes } from './picker/PickerSizes';

export interface PickerSelection {
  productId: string;
  productName: string;
  imageUrl: string | null;
  size: ProductSize | null;
  modifiers: PublicMenuModifier[];
  quantity: number;
  unitPrice: number;
  notes?: string;
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
  const sortedSizes = useMemo(
    () => [...sizes].sort((a, b) => a.sortOrder - b.sortOrder),
    [sizes],
  );

  const [sizeId, setSizeId] = useState<string | null>(null);
  const [modifierIds, setModifierIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open && product) {
      setSizeId(sortedSizes[0]?.id ?? null);
      setModifierIds(new Set());
      setQuantity(1);
      setNotes('');
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
    return displayBasePrice(product) + sizeMod + modSum;
  }, [product, selectedSize, selectedModifiers]);

  if (!open || !product) return null;

  const canConfirm = (!requiresSize || sizeId !== null) && quantity > 0;
  const totalPrice = unitPrice * quantity;

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
      notes: notes.trim() || undefined,
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
        <PickerHeader name={product.name} imageUrl={product.imageUrl} onClose={onClose} />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
          {product.category ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {product.category}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <h2 id="picker-title" className="text-2xl font-bold leading-tight text-foreground">
              {product.name}
            </h2>
            {product.description ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            ) : null}
          </div>

          <p className="text-2xl font-bold tabular-nums text-foreground">
            {COP.format(displayBasePrice(product))}
          </p>

          <div className="h-px w-full bg-border" />

          {requiresSize ? (
            <PickerSizes sizes={sortedSizes} sizeId={sizeId} onSelect={setSizeId} />
          ) : null}

          <PickerQuantity quantity={quantity} onChange={setQuantity} />

          {modifiersEnabled && modifiers.length > 0 ? (
            <PickerModifiers modifiers={modifiers} selected={modifierIds} onToggle={toggleModifier} />
          ) : null}

          <div className="h-px w-full bg-border" />
          <PickerNotes notes={notes} onChange={setNotes} />
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
