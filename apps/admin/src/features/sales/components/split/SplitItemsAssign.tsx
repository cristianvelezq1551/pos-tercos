'use client';

import { formatCop } from '@pos-tercos/ui';
import type { SplitUnit } from '../../lib/split';

/**
 * Modo "por productos": cada UNIDAD vendida (una línea de 3 hamburguesas son
 * 3 unidades asignables) se asigna a una persona tocando su número.
 */
export function SplitItemsAssign({
  units,
  partsCount,
  onAssign,
}: {
  units: readonly SplitUnit[];
  partsCount: number;
  onAssign: (unitKey: string, person: number) => void;
}) {
  return (
    <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
      {units.map((u) => (
        <div
          key={u.key}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{u.label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{formatCop(u.amount)}</span>
          <div className="flex gap-1" role="radiogroup" aria-label={`Quién paga ${u.label}`}>
            {Array.from({ length: partsCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={u.assignedTo === n}
                aria-label={`Persona ${n}`}
                onClick={() => onAssign(u.key, n)}
                className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors ${
                  u.assignedTo === n
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-input bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
