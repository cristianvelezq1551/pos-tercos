'use client';

import type { CashMovement, Shift } from '@pos-tercos/types';
import {
  Button,
  Checkbox,
  Dialog,
  FormField,
  Input,
  LoadingSkeleton,
  NumberInput,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { useOffline } from '../../offline';
import { listSales } from '../../sales';
import { closeShift } from '../api/close';
import { listCashMovements } from '../api';
import { cashMovementsNet, sumBreakdown, toBreakdownLines } from '../lib/denominations';
import { computeShiftSummary, type ShiftSummary } from '../lib/shift-summary';
import { DenominationCounter } from './DenominationCounter';
import { DifferenceWidget } from './DifferenceWidget';
import { ShiftZReport } from './ShiftZReport';

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
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(false);
  // Arqueo por denominación (default) o monto directo.
  const [arqueo, setArqueo] = useState(true);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [manual, setManual] = useState<number | null>(null);
  // Conteo ciego: no mostrar el esperado hasta revelar (anti-sesgo).
  const [blind, setBlind] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // El cierre necesita el backend (Z-report + efectivo esperado) y que NO queden
  // ventas offline en cola: si no, el esperado quedaría mal y daría descuadre
  // falso. El bloqueo se libera solo cuando termina de sincronizar.
  const { status, pending: offlinePending } = useOffline();
  const blockedReason =
    status === 'offline'
      ? 'Sin conexión. El cierre necesita el backend (Z-report y efectivo esperado). Reconectá para cerrar el turno.'
      : offlinePending > 0
        ? `Hay ${offlinePending} venta(s) offline sin sincronizar. Esperá a que terminen de sincronizar antes de cerrar — si no, el efectivo esperado quedaría mal.`
        : null;

  useEffect(() => {
    if (!open || !shift) return;
    setSummary(null);
    setMovements([]);
    setArqueo(true);
    setCounts({});
    setManual(null);
    setBlind(true);
    setRevealed(false);
    setNotes('');
    setError(null);
    setPending(false);
    setLoading(true);
    Promise.all([
      listSales({ shiftId: shift.id, limit: 200 }),
      listCashMovements(shift.id),
    ])
      .then(([sales, movs]) => {
        setSummary(computeShiftSummary(sales));
        setMovements(movs);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Error cargando el cierre'),
      )
      .finally(() => setLoading(false));
  }, [open, shift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const net = useMemo(() => cashMovementsNet(movements), [movements]);
  const expectedCash = useMemo(() => {
    if (!shift || !summary) return null;
    return shift.openingCash + summary.cashSalesTotal + net.net;
  }, [shift, summary, net]);

  const countedNum = arqueo ? sumBreakdown(counts) : (manual ?? 0);
  const hasCount = arqueo ? Object.values(counts).some((n) => n > 0) : manual !== null;
  const showResult = !blind || revealed;
  const difference = expectedCash !== null ? countedNum - expectedCash : 0;
  const canConfirm =
    summary !== null && hasCount && countedNum >= 0 && !pending && !blockedReason;

  const handleConfirm = async () => {
    if (!shift || !canConfirm) return;
    setError(null);
    setPending(true);
    try {
      const closed = await closeShift(shift.id, {
        countedCash: countedNum,
        breakdown: arqueo ? toBreakdownLines(counts) : undefined,
        notes: notes.trim() || undefined,
      });
      onClosed(closed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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

        {loading ? (
          <LoadingSkeleton shape="text" count={5} />
        ) : null}

        {/* Reporte de cierre: oculto en conteo ciego hasta revelar. */}
        {!loading && summary && showResult ? (
          <ShiftZReport
            shift={shift}
            summary={summary}
            expectedCash={expectedCash ?? 0}
            cashIn={net.cashIn}
            cashOut={net.cashOut}
          />
        ) : null}

        {/* Controles de arqueo / conteo ciego. */}
        {!loading && summary ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Checkbox
              checked={arqueo}
              onChange={(e) => setArqueo(e.target.checked)}
              label="Arqueo por denominación"
              disabled={pending}
            />
            <Checkbox
              checked={blind}
              onChange={(e) => {
                setBlind(e.target.checked);
                if (e.target.checked) setRevealed(false);
              }}
              label="Conteo ciego (no ver el esperado)"
              disabled={pending}
            />
          </div>
        ) : null}

        {!loading && summary ? (
          arqueo ? (
            <DenominationCounter counts={counts} onChange={setCounts} disabled={pending} />
          ) : (
            <FormField label="Efectivo contado físicamente (COP)" required>
              <NumberInput
                value={manual}
                onChange={setManual}
                prefix="$"
                min={0}
                placeholder={showResult && expectedCash !== null ? String(expectedCash) : '0'}
                disabled={pending}
                autoFocus
                required
              />
            </FormField>
          )
        ) : null}

        {/* Diferencia: visible solo si no es ciego o ya se reveló. */}
        {!loading && summary && hasCount ? (
          showResult ? (
            <DifferenceWidget difference={difference} />
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className={cn(
                'w-full rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50',
              )}
            >
              Conteo ciego activo · tocá para revelar el esperado y la diferencia
            </button>
          )
        ) : null}

        <FormField label="Notas (opcional)">
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. faltan $5k del cambio del cliente Pedro"
            maxLength={500}
            disabled={pending}
          />
        </FormField>

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
