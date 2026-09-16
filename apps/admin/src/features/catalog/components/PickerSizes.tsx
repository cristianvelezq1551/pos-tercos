'use client';

import type { ProductAvailability, ProductSize } from '@pos-tercos/types';
import { FormField } from '@pos-tercos/ui';
import { SelectableRow } from './SelectableRow';

/**
 * Selector de variante. Una variante sin insumos se muestra pero no se puede
 * elegir: esconder el plato entero perdería también las ventas de las otras.
 */
export function PickerSizes({
  sizes,
  selectedId,
  onSelect,
  availability,
}: {
  sizes: readonly ProductSize[];
  selectedId: string | null;
  onSelect: (sizeId: string) => void;
  availability?: ProductAvailability;
}) {
  if (sizes.length === 0) return null;
  const estado = new Map(
    (availability?.variants ?? []).map((v) => [v.sizeId, { available: v.available, reason: v.reason }]),
  );
  return (
    <FormField label="Tamaño">
      <div className="grid grid-cols-1 gap-2">
        {[...sizes]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => (
            <SelectableRow
              key={s.id}
              selected={selectedId === s.id}
              onSelect={() => onSelect(s.id)}
              type="radio"
              name="size"
              label={s.name}
              delta={s.priceModifier}
              disabled={estado.get(s.id)?.available === false}
              disabledReason={estado.get(s.id)?.reason ?? null}
            />
          ))}
      </div>
    </FormField>
  );
}
