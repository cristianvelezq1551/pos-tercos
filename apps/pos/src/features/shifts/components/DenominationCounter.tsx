'use client';

import { Money } from '@pos-tercos/ui';
import { COP_DENOMINATIONS, sumBreakdown } from '../lib/denominations';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/**
 * Arqueo: el cajero ingresa cuántas piezas hay de cada denominación; el total
 * se calcula solo. Pensado para conteo ciego (no muestra el esperado).
 */
export function DenominationCounter({
  counts,
  onChange,
  disabled,
}: {
  counts: Record<number, number>;
  onChange: (counts: Record<number, number>) => void;
  disabled?: boolean;
}) {
  const total = sumBreakdown(counts);

  const set = (denom: number, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    onChange({ ...counts, [denom]: n });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {COP_DENOMINATIONS.map((d) => {
          const qty = counts[d] ?? 0;
          return (
            <label key={d} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {COP.format(d)}
              </span>
              <span className="text-muted-foreground">×</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={qty === 0 ? '' : qty}
                onChange={(e) => set(d, e.target.value)}
                disabled={disabled}
                placeholder="0"
                className="h-9 w-16 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-medium text-muted-foreground">Total contado</span>
        <Money amount={total} size="lg" weight="bold" />
      </div>
    </div>
  );
}
