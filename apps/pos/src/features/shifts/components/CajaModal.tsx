'use client';

import type { CashMovement, Shift } from '@pos-tercos/types';
import { Button, Dialog, LoadingSkeleton, Money } from '@pos-tercos/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listSales } from '../../sales';
import { listCashMovements } from '../api';
import { cashMovementsNet } from '../lib/denominations';
import { computeShiftSummary, type ShiftSummary } from '../lib/shift-summary';
import { CashMovementsSection } from './CashMovementsSection';
import { ShiftZReport } from './ShiftZReport';

/** Vista de la caja del turno actual (sin cerrarlo) + movimientos de efectivo. */
export function CajaModal({
  shift,
  open,
  onClose,
}: {
  shift: Shift | null;
  open: boolean;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shift) return;
    setError(null);
    setLoading(true);
    try {
      const [sales, movs] = await Promise.all([
        listSales({ shiftId: shift.id, limit: 200 }),
        listCashMovements(shift.id),
      ]);
      setSummary(computeShiftSummary(sales));
      setMovements(movs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando la caja');
    } finally {
      setLoading(false);
    }
  }, [shift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !shift) return;
    setSummary(null);
    setMovements([]);
    void load();
  }, [open, shift?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const net = useMemo(() => cashMovementsNet(movements), [movements]);
  const expectedCash = useMemo(
    () => (shift && summary ? shift.openingCash + summary.cashSalesTotal + net.net : null),
    [shift, summary, net],
  );

  if (!shift) return null;

  const transfer = summary?.byMethod.TRANSFER;
  const avgTicket =
    summary && summary.countSales > 0
      ? Math.round(summary.totalSales / summary.countSales)
      : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Estado de caja"
      description="Cómo va el turno actual"
      maxWidth="max-w-lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <LoadingSkeleton shape="text" count={5} />
        ) : error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : summary ? (
          <>
            <ShiftZReport
              shift={shift}
              summary={summary}
              expectedCash={expectedCash ?? 0}
              cashIn={net.cashIn}
              cashOut={net.cashOut}
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
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
      <p className="font-display text-xl font-bold text-foreground tabular-nums">
        {value}
      </p>
      <p className="caps text-[0.5625rem] text-muted-foreground">{label}</p>
    </div>
  );
}
