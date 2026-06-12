'use client';

import type { SalePaymentInput } from '@pos-tercos/types';
import { Button, formatCop } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import {
  MAX_PARTS,
  amountsFromUnits,
  equalSplitAmounts,
  explodeUnits,
  totalChange,
  validateSplit,
  type SplitMode,
  type SplitPart,
  type SplitUnit,
} from '../../lib/split';
import type { CartTotalsResult } from '../../lib/totals';
import { SplitItemsAssign } from './SplitItemsAssign';
import { SplitPartRow } from './SplitPartRow';

const MODE_LABELS: Array<{ mode: SplitMode; label: string }> = [
  { mode: 'equal', label: 'Partes iguales' },
  { mode: 'items', label: 'Por productos' },
  { mode: 'amounts', label: 'Montos libres' },
];

export interface SplitResult {
  payments: SalePaymentInput[];
  changeDue: number;
}

/**
 * Cuenta dividida: N personas, cada una con su monto (iguales / por
 * productos / libre) y su método. Reporta al modal la cuenta lista para
 * cobrar (o null mientras no valide).
 */
export function SplitPaymentSection({
  total,
  totals,
  methods,
  onChange,
}: {
  total: number;
  totals: CartTotalsResult;
  methods: readonly import('@pos-tercos/types').PaymentMethod[];
  onChange: (result: SplitResult | null, reason: string | null) => void;
}) {
  const [mode, setMode] = useState<SplitMode>('equal');
  const [count, setCount] = useState(2);
  const [units, setUnits] = useState<SplitUnit[]>(() => explodeUnits(totals));
  const [parts, setParts] = useState<SplitPart[]>([]);

  // Montos derivados según el modo (en 'amounts' la edición es manual).
  useEffect(() => {
    setParts((prev) => {
      const amounts =
        mode === 'equal'
          ? equalSplitAmounts(total, count)
          : mode === 'items'
            ? amountsFromUnits(units, count)
            : Array.from({ length: count }, (_, i) => prev[i]?.amount ?? 0);
      return amounts.map((amount, i) => ({
        index: i + 1,
        amount,
        method: prev[i]?.method ?? null,
        cashReceived: prev[i]?.cashReceived ?? null,
        verified: prev[i]?.verified ?? false,
      }));
    });
  }, [mode, count, total, units]);

  // En montos libres, la ÚLTIMA parte se autocompleta con el resto.
  const setPartAmount = (index: number, amount: number) => {
    setParts((prev) => {
      const next = prev.map((p) => (p.index === index ? { ...p, amount } : p));
      const last = next[next.length - 1]!;
      if (index !== last.index) {
        const others = next.slice(0, -1).reduce((acc, p) => acc + p.amount, 0);
        next[next.length - 1] = { ...last, amount: Math.max(0, Math.round(total - others)) };
      }
      return next;
    });
  };

  const validation = useMemo(() => validateSplit(parts, total), [parts, total]);

  useEffect(() => {
    if (!validation.ok) {
      onChange(null, validation.reason);
      return;
    }
    onChange(
      {
        payments: parts.map((p) => ({
          method: p.method!,
          amount: p.amount,
          ...(p.method === 'CASH' && p.cashReceived !== null
            ? { amountReceived: p.cashReceived }
            : {}),
          ...(p.method !== 'CASH' ? { digitalVerified: true } : {}),
        })),
        changeDue: totalChange(parts),
      },
      null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, validation.ok, validation.reason, total]);

  const assigned = parts.reduce((acc, p) => acc + p.amount, 0);

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
