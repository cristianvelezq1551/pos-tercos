'use client';

import type { SalePaymentInput } from '@pos-tercos/types';
import { useEffect, useMemo, useState } from 'react';
import {
  amountsFromUnits,
  equalSplitAmounts,
  explodeUnits,
  rederiveUnits,
  totalChange,
  unitsSignature,
  validateSplit,
  type SplitMode,
  type SplitPart,
  type SplitUnit,
} from '../../lib/split';
import type { CartTotalsResult } from '../../lib/totals';

export interface SplitResult {
  payments: SalePaymentInput[];
  changeDue: number;
}

export interface SplitPaymentState {
  mode: SplitMode;
  setMode: (m: SplitMode) => void;
  count: number;
  setCount: (updater: (c: number) => number) => void;
  units: SplitUnit[];
  setUnits: (updater: (prev: SplitUnit[]) => SplitUnit[]) => void;
  parts: SplitPart[];
  setParts: (updater: (prev: SplitPart[]) => SplitPart[]) => void;
  setPartAmount: (index: number, amount: number) => void;
  assigned: number;
}

/**
 * Estado de la cuenta dividida (modo/personas/unidades/partes) + los efectos
 * que derivan los montos según el modo y que reportan al modal la cuenta lista
 * para cobrar (o null mientras no valide). Separado del render para que el
 * componente quede como vista pura.
 */
export function useSplitPayment(
  total: number,
  totals: CartTotalsResult,
  onChange: (result: SplitResult | null, reason: string | null) => void,
): SplitPaymentState {
  const [mode, setMode] = useState<SplitMode>('equal');
  const [count, setCount] = useState(2);
  const [units, setUnits] = useState<SplitUnit[]>(() => explodeUnits(totals));
  const [parts, setParts] = useState<SplitPart[]>([]);

  // Si el carrito o una promo cambian mientras la cuenta dividida está abierta,
  // re-derivar las unidades con los precios nuevos preservando las asignaciones.
  const sig = unitsSignature(totals);
  useEffect(() => {
    setUnits((prev) => rederiveUnits(totals, prev));
    // `sig` resume el contenido de `totals`; no depender de la referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

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

  return {
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
  };
}
