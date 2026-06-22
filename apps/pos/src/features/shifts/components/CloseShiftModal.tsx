'use client';

import type { CashMovement, Shift } from '@pos-tercos/types';
import { Button, Dialog, formatDate } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { useOffline } from '../../offline';
import { listSales } from '../../sales';
import { closeShift } from '../api/close';
import { getExpectedCash, listCashMovements } from '../api';
import {
  cashMovementsNet,
  digitalMovementsNet,
  sumBreakdown,
  toBreakdownLines,
} from '../lib/denominations';
import { computeShiftSummary, type ShiftSummary } from '../lib/shift-summary';
import { CloseShiftFields } from './CloseShiftFields';
import { getErrorMessage } from '../../../lib/errors';

export function CloseShiftModal({
  shift,
  open,
  onClose,
  onClosed,
}: {
  shift: Shift | null;
  open: boolean;
  onClose: () => void;
  onClosed: (shift: Shift) => void;
}) {
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [digitalCounts, setDigitalCounts] = useState<Record<string, number | null>>({});
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(false);
  // Arqueo por denominación (default) o monto directo.
  const [arqueo, setArqueo] = useState(true);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [manual, setManual] = useState<number | null>(null);
  const [tips, setTips] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Esperado del server (autoritativo); cae al cálculo cliente si la red falla.
  const [serverExpected, setServerExpected] = useState<number | null>(null);

  // El cierre necesita el backend (Z-report + efectivo esperado) y que NO queden
  // ventas offline en cola: si no, el esperado quedaría mal y daría descuadre
  // falso. El bloqueo se libera solo cuando termina de sincronizar.
  const { status, pending: offlinePending } = useOffline();
  const blockedReason =
    status === 'offline'
      ? 'Sin conexión. El cierre necesita el backend (Z-report y efectivo esperado). Reconectá para cerrar el turno.'
      : offlinePending > 0
        ? `Hay ${offlinePending} venta(s) offline sin sincronizar. Espera a que terminen de sincronizar antes de cerrar — si no, el efectivo esperado quedaría mal.`
        : null;

  useEffect(() => {
    if (!open || !shift) return;
    setSummary(null);
    setMovements([]);
    setArqueo(true);
    setCounts({});
    setManual(null);
    setTips(null);
    setNotes('');
    setError(null);
    setPending(false);
    setServerExpected(null);
    setLoading(true);
    Promise.all([
      listSales({ shiftId: shift.id, limit: 200 }),
      listCashMovements(shift.id),
      // Esperado AUTORITATIVO del server (mismo número que usará el cierre).
      getExpectedCash(shift.id).catch(() => null),
    ])
      .then(([sales, movs, exp]) => {
        setSummary(computeShiftSummary(sales));
        setMovements(movs);
        setServerExpected(exp?.expectedCash ?? null);
      })
      .catch((err) =>
        setError(getErrorMessage(err, 'Error cargando el cierre')),
      )
      .finally(() => setLoading(false));
  }, [open, shift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const net = useMemo(() => cashMovementsNet(movements), [movements]);
  const digitalNet = useMemo(() => digitalMovementsNet(movements), [movements]);
  const expectedCash = useMemo(() => {
    if (!shift || !summary) return null;
    // Preferir el número autoritativo del server; el cálculo cliente es respaldo.
    return serverExpected ?? shift.openingCash + summary.cashSalesTotal + net.net;
  }, [shift, summary, net, serverExpected]);

  const countedNum = arqueo ? sumBreakdown(counts) : (manual ?? 0);
  const hasCount = arqueo ? Object.values(counts).some((n) => n > 0) : manual !== null;
  const canConfirm =
    summary !== null && hasCount && countedNum >= 0 && !pending && !blockedReason;

  const handleConfirm = async () => {
    if (!shift || !canConfirm) return;
    setError(null);
    setPending(true);
    try {
      const digital = Object.entries(digitalCounts)
        .filter(([, v]) => v !== null)
        .map(([method, v]) => ({ method: method as never, counted: v! }));
      const closed = await closeShift(shift.id, {
        countedCash: countedNum,
        breakdown: arqueo ? toBreakdownLines(counts) : undefined,
        digitalCounts: digital.length > 0 ? digital : undefined,
        tips: tips ?? undefined,
        notes: notes.trim() || undefined,
      });
      onClosed(closed);
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido'));
      setPending(false);
    }
  };

  if (!shift) return null;

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Cerrar turno"
      description={`Apertura ${formatDate(shift.openedAt, 'datetime')} · Cajero ${shift.cashierName ?? '—'}`}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {pending ? 'Cerrando…' : 'Cerrar turno'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {blockedReason ? (
          <p
            role="alert"
            className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm font-semibold text-warning"
          >
            {blockedReason}
          </p>
        ) : null}

        <CloseShiftFields
          loading={loading}
          shift={shift}
          summary={summary}
          expectedCash={expectedCash}
          cashIn={net.cashIn}
          cashOut={net.cashOut}
          pending={pending}
          arqueo={arqueo}
          onArqueoChange={setArqueo}
          counts={counts}
          onCountsChange={setCounts}
          manual={manual}
          onManualChange={setManual}
          digitalNet={digitalNet}
          digitalCounts={digitalCounts}
          onDigitalChange={(method, value) =>
            setDigitalCounts((prev) => ({ ...prev, [method]: value }))
          }
          tips={tips}
          onTipsChange={setTips}
          notes={notes}
          onNotesChange={setNotes}
        />

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
