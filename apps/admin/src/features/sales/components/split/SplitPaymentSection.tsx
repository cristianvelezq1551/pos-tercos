'use client';

import type { PaymentMethodSetting } from '@pos-tercos/types';
import { Button, formatCop } from '@pos-tercos/ui';
import { MAX_PARTS, type SplitMode } from '../../lib/split';
import type { CartTotalsResult } from '../../lib/totals';
import { SplitItemsAssign } from './SplitItemsAssign';
import { SplitPartRow } from './SplitPartRow';
import { useSplitPayment, type SplitResult } from './use-split-payment';

export type { SplitResult };

const MODE_LABELS: Array<{ mode: SplitMode; label: string }> = [
  { mode: 'equal', label: 'Partes iguales' },
  { mode: 'items', label: 'Por productos' },
  { mode: 'amounts', label: 'Montos libres' },
];

/**
 * Cuenta dividida: N personas, cada una con su monto (iguales / por
 * productos / libre) y su método. Reporta al modal la cuenta lista para
 * cobrar (o null mientras no valide). La lógica de estado vive en
 * `useSplitPayment`; este componente es la vista.
 */
export function SplitPaymentSection({
  total,
  totals,
  methods,
  onChange,
}: {
  total: number;
  totals: CartTotalsResult;
  methods: readonly PaymentMethodSetting[];
  onChange: (result: SplitResult | null, reason: string | null) => void;
}) {
  const {
    mode,
    setMode,
    count,
    setCount,
    units,
    setUnits,
    parts,
    setParts,
    setPartAmount,
    assigned,
  } = useSplitPayment(total, totals, onChange);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {MODE_LABELS.map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => setMode(m.mode)}
              aria-pressed={mode === m.mode}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === m.mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Personas</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCount((c) => Math.max(2, c - 1))}
            disabled={count <= 2}
            aria-label="Quitar persona"
          >
            −
          </Button>
          <span className="w-5 text-center text-sm font-semibold tabular-nums">{count}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCount((c) => Math.min(MAX_PARTS, c + 1))}
            disabled={count >= MAX_PARTS}
            aria-label="Agregar persona"
          >
            +
          </Button>
        </div>
      </div>

      {mode === 'items' ? (
        <SplitItemsAssign
          units={units}
          partsCount={count}
          onAssign={(key, person) =>
            setUnits((prev) => prev.map((u) => (u.key === key ? { ...u, assignedTo: person } : u)))
          }
        />
      ) : null}

      <div className="space-y-2">
        {parts.map((p) => (
          <SplitPartRow
            key={p.index}
            part={p}
            methods={methods}
            amountEditable={mode === 'amounts'}
            onChange={(patch) =>
              patch.amount !== undefined
                ? setPartAmount(p.index, patch.amount)
                : setParts((prev) =>
                    prev.map((x) => (x.index === p.index ? { ...x, ...patch } : x)),
                  )
            }
          />
        ))}
      </div>

      <p className="text-right text-xs tabular-nums text-muted-foreground">
        Asignado {formatCop(assigned)} de {formatCop(total)}
      </p>
    </div>
  );
}
