'use client';

import type { Shift } from '@pos-tercos/types';
import { Badge, formatCop } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listSales } from '../../sales';
import { listCashMovements } from '../api';
import { onCajaChanged } from '../lib/caja-events';
import { cashMovementsNet } from '../lib/denominations';
import { computeShiftSummary } from '../lib/shift-summary';

const REFRESH_MS = 30_000;

/**
 * Badge del topbar: el **efectivo que debería haber en caja ahora**
 * (apertura + ventas en efectivo + entradas − salidas). Refresca cada 30s,
 * al volver el foco y al instante cuando algo mueve la caja
 * (`notifyCajaChanged`).
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
        const [sales, movements] = await Promise.all([
          listSales({ shiftId: shift.id, limit: 200 }),
          listCashMovements(shift.id),
        ]);
        if (cancelled) return;
        const summary = computeShiftSummary(sales);
        const net = cashMovementsNet(movements);
        setExpected(shift.openingCash + summary.cashSalesTotal + net.net);
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
    const offCaja = onCajaChanged(() => void load());
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      offCaja();
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
