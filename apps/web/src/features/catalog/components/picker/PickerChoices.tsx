'use client';

import type { PublicMenuChoiceGroup } from '@pos-tercos/types';
import type { ChoiceSelection } from '@pos-tercos/domain';
import { cn } from '@pos-tercos/ui';
import { COP } from '../../../../lib/format';

/**
 * Los grupos a elegir de un combo ("Bebida — elige 2").
 *
 * Una casilla POR UNIDAD para poder mezclar (una Pepsi y una Coca), y nada
 * viene marcado: si el pedido llegara sin elección, el local no sabría qué
 * entregar ni qué descontar.
 */
export function PickerChoices({
  groups,
  selection,
  onSelect,
}: {
  groups: readonly PublicMenuChoiceGroup[];
  selection: ChoiceSelection;
  onSelect: (groupId: string, index: number, productId: string) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <>
      {groups.map((g) =>
        Array.from({ length: g.quantity }, (_, i) => (
          <div key={`${g.id}:${i}`} className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-foreground">
              {g.quantity > 1 ? `${g.label} ${i + 1}` : g.label}
            </p>
            <div className="flex flex-col gap-2">
              {g.options.map((o) => {
                const checked = selection[g.id]?.[i] === o.productId;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      'flex min-h-[44px] items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm transition-colors',
                      checked
                        ? 'cursor-pointer border-primary bg-primary/10 text-foreground'
                        : 'cursor-pointer border-border hover:border-muted-foreground',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name={`picker-choice-${g.id}-${i}`}
                        value={o.productId}
                        checked={checked}
                        onChange={() => onSelect(g.id, i, o.productId)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="font-medium">{o.productName}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {o.priceDelta === 0 ? '—' : `+${COP.format(o.priceDelta)}`}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )),
      )}
      <div className="h-px w-full bg-border" />
    </>
  );
}
