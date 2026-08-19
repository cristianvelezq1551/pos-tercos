'use client';

import type { Shift } from '@pos-tercos/types';
import { Badge, formatCop } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { listSales } from '../../sales';
import { getExpectedCash, listCashMovements } from '../api';
import { onCajaChanged } from '../../../lib/caja-events';
import { cashMovementsNet } from '../lib/denominations';
import { computeShiftSummary } from '../lib/shift-summary';
import { usePolling } from '../../../lib/use-polling';

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

  const load = async () => {
    if (!shift) return;
    // Esperado AUTORITATIVO del server (consulta sale_payments sin límite de
    // paginación); el cálculo cliente queda solo como respaldo offline — con
    // más de 200 ventas el listado paginado subcuenta.
    try {
      const exp = await getExpectedCash(shift.id);
      setExpected(exp.expectedCash);
      return;
    } catch {
      // sin red o error: cae al cálculo local
    }
    try {
      const [sales, movements] = await Promise.all([
        listSales({ shiftId: shift.id, limit: 200 }),
        listCashMovements(shift.id),
      ]);
      const summary = computeShiftSummary(sales);
      const net = cashMovementsNet(movements);
      setExpected(shift.openingCash + summary.cashSalesTotal + net.net);
    } catch {
      // mantener el último valor
    }
  };

  usePolling(load, REFRESH_MS, { enabled: shift !== null });

  useEffect(() => {
    if (!shift) {
      setExpected(null);
      return;
    }
    return onCajaChanged(() => void load());
  }, [shift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
