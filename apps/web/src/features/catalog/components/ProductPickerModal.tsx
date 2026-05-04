'use client';

import type {
  ProductModifier,
  ProductSize,
  PublicMenuProduct,
} from '@pos-tercos/types';
import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { COP } from '../../../lib/format';

export interface PickerSelection {
  productId: string;
  productName: string;
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
  const sizes = product?.sizes ?? [];
  const modifiers = product?.modifiers ?? [];
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

  const canConfirm = (!requiresSize || sizeId !== null) && quantity > 0;
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
      quantity,
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
    >
      <div className="space-y-5">
        {requiresSize ? (
          <div className="space-y-2">
            <Label>Tamaño</Label>
            <div className="grid grid-cols-1 gap-2">
              {sortedSizes.map((s) => (
                <label
                  key={s.id}
                  className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                    sizeId === s.id
                      ? 'border-blue-600 bg-blue-50 font-medium text-blue-900'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="size"
                      value={s.id}
                      checked={sizeId === s.id}
                      onChange={() => setSizeId(s.id)}
                      className="h-4 w-4"
                    />
                    {s.name}
                  </span>
                  <span className="tabular-nums text-gray-700">
                    {s.priceModifier === 0
                      ? '—'
                      : `${s.priceModifier > 0 ? '+' : ''}${COP.format(s.priceModifier)}`}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {modifiersEnabled && modifiers.length > 0 ? (
          <div className="space-y-2">
            <Label>Modificadores</Label>
            <div className="grid grid-cols-1 gap-2">
              {modifiers.map((m) => {
                const checked = modifierIds.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition ${
                      checked
                        ? 'border-blue-600 bg-blue-50 font-medium text-blue-900'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModifier(m.id)}
                        className="h-4 w-4"
                      />
                      {m.name}
                    </span>
                    <span className="tabular-nums text-gray-700">
                      {m.priceDelta === 0
                        ? '—'
                        : `${m.priceDelta > 0 ? '+' : ''}${COP.format(m.priceDelta)}`}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="qty">Cantidad</Label>
          <Input
            id="qty"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="w-24"
          />
        </div>

        <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
          <span className="text-sm text-gray-600">
            {COP.format(unitPrice)} × {quantity}
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {COP.format(unitPrice * quantity)}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Agregar al pedido
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
