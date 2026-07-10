'use client';

import type { Product, ProductModifier, ProductSize, Promotion } from '@pos-tercos/types';
import {
  Button,
  Dialog,
  FormField,
  Money,
  NumberInput,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { getLinePromoDiscount } from '../../sales/lib/promo-preview';
import { SelectableRow } from './SelectableRow';

export type PickerSelection = {
  productId: string;
  productName: string;
  size: ProductSize | null;
  modifiers: ProductModifier[];
  quantity: number;
  /** unitPrice = base + sizeModifier + sum(modifierDeltas). Sin promos. */
  unitPrice: number;
};

export function ProductPickerModal({
  product,
  promos = [],
  open,
  onClose,
  onConfirm,
}: {
  product: Product | null;
  /** Promos activas del canal caja — para previsualizar el precio con descuento. */
  promos?: readonly Promotion[];
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
  const [quantity, setQuantity] = useState<number | null>(1);

  useEffect(() => {
    if (open && product) {
      const sortedSizes = [...sizes].sort((a, b) => a.sortOrder - b.sortOrder);
      setSizeId(sortedSizes[0]?.id ?? null);
      setModifierIds(new Set());
      setQuantity(1);
    }
  }, [open, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const qty = quantity ?? 0;
  // Descuento de promo para la selección actual (mismo motor que el carrito).
  const lineDiscount = useMemo(
    () => (product ? getLinePromoDiscount(product.id, unitPrice, qty, promos) : 0),
    [product, unitPrice, qty, promos],
  );

  if (!product) return null;

  const canConfirm = (!requiresSize || sizeId !== null) && qty > 0;
  const sortedSizes = [...sizes].sort((a, b) => a.sortOrder - b.sortOrder);
  const lineTotal = unitPrice * qty;
  const discountedTotal = lineTotal - lineDiscount;

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
      size: selectedSize,
      modifiers: selectedModifiers,
      quantity: qty,
      unitPrice,
    });
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={product.name}
      description={product.description ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Agregar al carrito
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {requiresSize ? (
          <FormField label="Tamaño">
            <div className="grid grid-cols-1 gap-2">
              {sortedSizes.map((s) => (
                <SelectableRow
                  key={s.id}
                  selected={sizeId === s.id}
                  onSelect={() => setSizeId(s.id)}
                  type="radio"
                  name="size"
                  label={s.name}
                  delta={s.priceModifier}
                />
              ))}
            </div>
          </FormField>
        ) : null}

        {modifiersEnabled && modifiers.length > 0 ? (
          <FormField label="Modificadores">
            <div className="grid grid-cols-1 gap-2">
              {modifiers.map((m) => (
                <SelectableRow
                  key={m.id}
                  selected={modifierIds.has(m.id)}
                  onSelect={() => toggleModifier(m.id)}
                  type="checkbox"
                  label={m.name}
                  delta={m.priceDelta}
                />
              ))}
            </div>
          </FormField>
        ) : null}

        <FormField label="Cantidad">
          <div className="w-32">
            <NumberInput value={quantity} onChange={setQuantity} min={1} decimals={0} />
          </div>
        </FormField>

        <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            <Money amount={unitPrice} className="text-current" /> × {qty}
          </span>
          {lineDiscount > 0 ? (
            <span className="flex items-baseline gap-2">
              <Money
                amount={lineTotal}
                className="text-muted-foreground line-through"
              />
              <Money amount={discountedTotal} size="xl" weight="bold" className="text-success" />
            </span>
          ) : (
            <Money amount={lineTotal} size="xl" weight="bold" />
          )}
        </div>
        {lineDiscount > 0 ? (
          <p className="-mt-2 text-right text-xs font-medium text-success">
            Promo aplicada · ahorrás <Money amount={lineDiscount} className="text-success" />
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

