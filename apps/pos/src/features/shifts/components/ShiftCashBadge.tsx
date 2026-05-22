'use client';

import type { Shift } from '@pos-tercos/types';
import { Badge, formatCop } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listSales } from '../../sales';
import { computeShiftSummary } from '../lib/shift-summary';

const REFRESH_MS = 30_000;

/**
 * Badge del topbar: en vez de la apertura fija, muestra el **efectivo que
 * debería haber en caja ahora** (apertura + ventas en efectivo del turno).
 * Refresca cada 30s y al volver el foco.
 */
export function ShiftCashBadge({ shift }: { shift: Shift | null }) {
  const [expected, setExpected] = useState<number | null>(
    shift ? shift.openingCash : null,
  );

  useEffect(() => {
    if (!shift) {
      setExpected(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const sales = await listSales({ shiftId: shift.id, limit: 200 });
        if (cancelled) return;
        const summary = computeShiftSummary(sales);
        setExpected(shift.openingCash + summary.cashSalesTotal);
      } catch {
        // mantener el último valor
      }
    };
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [shift?.id, shift?.openingCash]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shift) {
    return (
      <span className="caps ml-2 text-[0.625rem] text-muted-foreground">
        Sin turno
      </span>
    );
  }

  return (
    <Badge tone="success" size="md" withDot className="ml-2">
      En caja: {formatCop(expected ?? shift.openingCash)}
    </Badge>
  );
}
