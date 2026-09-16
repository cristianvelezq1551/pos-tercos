'use client';

import type { ComboChoiceGroup, ProductAvailability } from '@pos-tercos/types';
import { FormField } from '@pos-tercos/ui';
import { SelectableRow } from './SelectableRow';
import type { ChoiceSelection } from '@pos-tercos/domain';

/**
 * Los grupos a elegir de un combo ("Bebida — elige 2").
 *
 * Una casilla POR UNIDAD, no un selector por grupo: así se puede pedir una
 * Pepsi y una Coca, que es como la gente pide de verdad. Nada viene marcado —
 * con una opción por defecto, quien va rápido cobra la bebida equivocada y
 * vuelve el descuadre que estos grupos vienen a cerrar.
 */
export function PickerChoices({
  groups,
  selection,
  onSelect,
  availability,
}: {
  groups: readonly ComboChoiceGroup[];
  selection: ChoiceSelection;
  onSelect: (groupId: string, index: number, productId: string) => void;
  availability?: ProductAvailability;
}) {
  if (groups.length === 0) return null;

  const estado = new Map(
    (availability?.choiceOptions ?? []).map((o) => [
      `${o.groupId}:${o.productId}`,
      { available: o.available, reason: o.reason },
    ]),
  );

  return (
    <>
      {groups.map((g) =>
        Array.from({ length: g.quantity }, (_, i) => (
          <FormField
            key={`${g.id}:${i}`}
            label={g.quantity > 1 ? `${g.label} ${i + 1}` : g.label}
          >
            <div className="grid grid-cols-1 gap-2">
              {g.options.map((o) => {
                const est = estado.get(`${g.id}:${o.productId}`);
                return (
                  <SelectableRow
                    key={o.id}
                    selected={selection[g.id]?.[i] === o.productId}
                    onSelect={() => onSelect(g.id, i, o.productId)}
                    type="radio"
                    name={`choice-${g.id}-${i}`}
                    label={o.productName}
                    delta={o.priceDelta}
                    disabled={est?.available === false}
                    disabledReason={est?.reason ?? null}
                  />
                );
              })}
            </div>
          </FormField>
        )),
      )}
    </>
  );
}
