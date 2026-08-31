'use client';

import type { CashMovement, ExpectedCash, Shift } from '@pos-tercos/types';
import { LoadingSkeleton, Money } from '@pos-tercos/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listSales } from '../../sales';
import { getExpectedCash, listCashMovements } from '../api';
import { cashMovementsNet } from '../lib/denominations';
import { computeShiftSummary, type ShiftSummary } from '../lib/shift-summary';
import { CashMovementsSection } from './CashMovementsSection';
import { CloseShiftAction } from './CloseShiftAction';
import { ShiftZReport } from './ShiftZReport';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Página de Caja del cajero: Z-report en vivo, stats, movimientos de
 * efectivo y el cierre del turno. (Reemplaza al viejo CajaModal del topbar.)
 */
export function CajaPanel({
  shift,
  onClosed,
}: {
  shift: Shift;
  onClosed?: (closed: Shift) => void;
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [serverExpected, setServerExpected] = useState<ExpectedCash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sales, movs, exp] = await Promise.all([
        listSales({ shiftId: shift.id, limit: 200 }),
        listCashMovements(shift.id),
        // Esperado AUTORITATIVO del server (sin límite de paginación); el
        // cálculo cliente queda como respaldo si esta consulta falla.
        getExpectedCash(shift.id).catch(() => null),
      ]);
      setSummary(computeShiftSummary(sales));
      setMovements(movs);
      setServerExpected(exp);
    } catch (e) {
      setError(getErrorMessage(e, 'Error cargando la caja'));
    } finally {
      setLoading(false);
    }
  }, [shift.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const net = useMemo(() => cashMovementsNet(movements), [movements]);
  const expectedCash =
    serverExpected?.expectedCash ??
    (summary !== null ? shift.openingCash + summary.cashSalesTotal + net.net : null);
  const transfer = summary?.byMethod.TRANSFER;
  const avgTicket =
    summary && summary.countSales > 0 ? Math.round(summary.totalSales / summary.countSales) : 0;

  if (loading) return <LoadingSkeleton shape="text" count={6} />;
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {error}
      </p>
    );
  }
  if (!summary) return null;

  return (
    <div className="space-y-4">
      <ShiftZReport
        shift={shift}
        summary={summary}
        expectedCash={expectedCash ?? 0}
        cashIn={net.cashIn}
        cashOut={net.cashOut}
        nombresDeMedios={Object.fromEntries(
          (serverExpected?.digital ?? []).map((d) => [d.method, d.name]),
        )}
      />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Ventas" value={summary.countSales} />
        <Stat label="Transferencias" value={transfer?.count ?? 0} />
        <Stat label="Anuladas" value={summary.voidCount} />
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Ticket promedio</span>
        <Money amount={avgTicket} weight="semibold" />
      </div>
      <CashMovementsSection shiftId={shift.id} onChanged={() => void load()} />
      <div className="border-t border-border pt-4">
        <CloseShiftAction shift={shift} onClosed={onClosed} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
      <p className="font-display text-xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="caps text-[0.5625rem] text-muted-foreground">{label}</p>
    </div>
  );
}
