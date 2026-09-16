'use client';

import type {
  AppliedChoice,
  Product,
  ProductAvailability,
  ProductModifier,
  ProductSize,
  Promotion,
} from '@pos-tercos/types';
import {
  Button,
  Dialog,
  FormField,
  NumberInput,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { getLinePromoDiscount } from '../../sales/lib/promo-preview';
import { SelectableRow } from './SelectableRow';
import { PickerChoices } from './PickerChoices';
import { PickerSizes } from './PickerSizes';
import { PickerTotal } from './PickerTotal';
import {
  aChoices,
  elegir,
  nuevaSeleccion,
  recargoDeSeleccion,
  resumenDeSeleccion,
  seleccionCompleta,
  type ChoiceSelection,
} from '@pos-tercos/domain';
import { displayBasePrice } from '../lib/display-price';

export type PickerSelection = {
  productId: string;
  productName: string;
  size: ProductSize | null;
  modifiers: ProductModifier[];
  quantity: number;
  /** unitPrice = base + sizeModifier + sum(modifierDeltas). Sin promos. */
  unitPrice: number;
  /** Product.isCombo — necesario para que COMBO_OFF se previsualice/cobre igual. */
  isCombo: boolean;
  /** Lo elegido, con nombre y recargo congelados (como los modificadores). */
  choices: AppliedChoice[];
  /** Resumen legible ("Bebida: 2 Coca-Cola") para la fila del carrito. */
  choiceLabels: string[];
};

export function ProductPickerModal({
  product,
  promos = [],
  availability,
  open,
  onClose,
  onConfirm,
}: {
  product: Product | null;
  /** Disponibilidad del producto, con el detalle por variante. */
  availability?: ProductAvailability;
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
  // Una variante sin insumos se muestra pero no se puede elegir: esconder el
  // plato entero perdería también las ventas de las otras.
  const variantState = useMemo(() => {
    const m = new Map<string, { available: boolean; reason: string | null }>();
    for (const v of availability?.variants ?? []) {
      m.set(v.sizeId, { available: v.available, reason: v.reason });
    }
    return m;
  }, [availability]);
  const sizeBlocked = (id: string): boolean => variantState.get(id)?.available === false;

  const [sizeId, setSizeId] = useState<string | null>(null);
  const [modifierIds, setModifierIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState<number | null>(1);
  const choiceGroups = useMemo(() => product?.choiceGroups ?? [], [product]);
  const [choiceSel, setChoiceSel] = useState<ChoiceSelection>({});

  useEffect(() => {
    if (open && product) {
      const sortedSizes = [...sizes].sort((a, b) => a.sortOrder - b.sortOrder);
      // Preselecciona la primera que SÍ se pueda hacer: dejar marcada una sin
      // insumos obligaría al cajero a descubrir por qué no lo deja confirmar.
      const primeraPosible = sortedSizes.find((sz) => !sizeBlocked(sz.id)) ?? sortedSizes[0];
      setSizeId(primeraPosible?.id ?? null);
      setModifierIds(new Set());
      setQuantity(1);
      setChoiceSel(nuevaSeleccion(product.choiceGroups ?? []));
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
    const recargo = recargoDeSeleccion(choiceGroups, choiceSel);
    return displayBasePrice(product) + sizeMod + modSum + recargo;
  }, [product, selectedSize, selectedModifiers, choiceGroups, choiceSel]);

  const qty = quantity ?? 0;
  // Descuento de promo para la selección actual (mismo motor que el carrito).
  const lineDiscount = useMemo(
    () =>
      product
        ? getLinePromoDiscount(product.id, unitPrice, qty, promos, undefined, product.isCombo)
        : 0,
    [product, unitPrice, qty, promos],
  );

  if (!product) return null;

  const canConfirm =
    (!requiresSize || (sizeId !== null && !sizeBlocked(sizeId))) &&
    qty > 0 &&
    seleccionCompleta(choiceGroups, choiceSel);

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
      isCombo: product.isCombo,
      choices: aChoices(choiceGroups, choiceSel),
      choiceLabels: resumenDeSeleccion(choiceGroups, choiceSel),
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
        <PickerSizes
          sizes={sizes}
          selectedId={sizeId}
          onSelect={setSizeId}
          availability={availability}
        />

        <PickerChoices
          groups={choiceGroups}
          selection={choiceSel}
          onSelect={(groupId, index, productId) =>
            setChoiceSel((prev) => elegir(prev, groupId, index, productId))
          }
          availability={availability}
        />

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

        <PickerTotal unitPrice={unitPrice} quantity={qty} lineDiscount={lineDiscount} />
      </div>
    </Dialog>
  );
}

