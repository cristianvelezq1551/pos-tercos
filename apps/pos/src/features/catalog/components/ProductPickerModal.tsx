'use client';

import type { Product, ProductModifier, ProductSize } from '@pos-tercos/types';
import {
  Button,
  Dialog,
  FormField,
  Money,
  NumberInput,
  cn,
  formatCop,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';

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
  open,
  onClose,
  onConfirm,
}: {
  product: Product | null;
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

  if (!product) return null;

  const qty = quantity ?? 0;
  const canConfirm = (!requiresSize || sizeId !== null) && qty > 0;
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
          <Money amount={unitPrice * qty} size="xl" weight="bold" />
        </div>
      </div>
    </Dialog>
  );
}

function SelectableRow({
  selected,
  onSelect,
  type,
  name,
  label,
  delta,
}: {
  selected: boolean;
  onSelect: () => void;
  type: 'radio' | 'checkbox';
  name?: string;
  label: string;
  delta: number;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors duration-150 ease-out',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
        selected
          ? 'border-primary bg-destructive/10 font-semibold text-foreground'
          : 'border-border hover:border-ink-300 hover:bg-muted/40',
        'motion-reduce:transition-none',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type={type}
          name={name}
          checked={selected}
          onChange={onSelect}
          className="h-4 w-4 accent-primary"
        />
        {label}
      </span>
      <span className="tabular text-foreground">
        {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${formatCop(delta)}`}
      </span>
    </label>
  );
}
