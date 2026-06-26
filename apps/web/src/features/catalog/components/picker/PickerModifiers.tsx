'use client';

import type { PublicMenuModifier } from '@pos-tercos/types';
import { COP } from '../../../../lib/format';

/** Lista de extras (checkboxes), solo si el producto los habilita. */
export function PickerModifiers({
  modifiers,
  selected,
  onToggle,
}: {
  modifiers: PublicMenuModifier[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      <div className="h-px w-full bg-border" />
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-foreground">Extras</p>
        <div className="flex flex-col gap-2.5">
          {modifiers.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-3 text-sm text-foreground"
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => onToggle(m.id)}
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
          ))}
        </div>
      </div>
    </>
  );
}
