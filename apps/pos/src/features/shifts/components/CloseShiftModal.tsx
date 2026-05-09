'use client';

import type { Sale, Shift } from '@pos-tercos/types';
import {
  Button,
  Dialog,
  FormField,
  Input,
  LoadingSkeleton,
  Money,
  NumberInput,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { listSales } from '../../sales/api/list';
import { closeShift } from '../api/close';

interface ShiftSummary {
  totalSales: number;
  countSales: number;
  byMethod: Record<string, { count: number; total: number }>;
  cashSalesTotal: number;
}

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
  const [loading, setLoading] = useState(false);
  const [counted, setCounted] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open || !shift) return;
    setSummary(null);
    setCounted(null);
    setNotes('');
    setError(null);
    setPending(false);
    setLoading(true);
    listSales({ shiftId: shift.id, limit: 200 })
      .then((sales) => setSummary(computeSummary(sales)))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Error cargando ventas'),
      )
      .finally(() => setLoading(false));
  }, [open, shift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const expectedCash = useMemo(() => {
    if (!shift || !summary) return null;
    return shift.openingCash + summary.cashSalesTotal;
  }, [shift, summary]);

  const countedNum = counted ?? 0;
  const difference = expectedCash !== null ? countedNum - expectedCash : 0;
  const canConfirm = summary !== null && counted !== null && countedNum >= 0 && !pending;

  const handleConfirm = async () => {
    if (!shift || !canConfirm) return;
    setError(null);
    setPending(true);
    try {
      const closed = await closeShift(shift.id, {
        countedCash: countedNum,
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
        {loading ? (
          <LoadingSkeleton shape="text" count={5} />
        ) : summary ? (
          <section className="rounded-xl bg-muted/40 p-4">
            <p className="caps text-[0.625rem] text-muted-foreground">Reporte de cierre del turno</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <Row label="Apertura (efectivo inicial)" value={shift.openingCash} />
              <Row
                label={`Ventas en efectivo (${summary.byMethod.CASH?.count ?? 0})`}
                value={summary.cashSalesTotal}
                positive
              />
              {Object.entries(summary.byMethod)
                .filter(([m]) => m !== 'CASH')
                .map(([method, v]) => (
                  <Row
                    key={method}
                    muted
                    label={`${method} (${v.count})`}
                    value={v.total}
                  />
                ))}
              <div className="border-t border-border pt-2">
                <Row label="Esperado en caja" value={expectedCash ?? 0} bold />
              </div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                Total ventas del turno: {summary.countSales} ·{' '}
                <Money amount={summary.totalSales} size="xs" weight="medium" className="text-current" />
              </p>
            </div>
          </section>
        ) : null}

        <FormField label="Efectivo contado físicamente (COP)" required>
          <NumberInput
            value={counted}
            onChange={setCounted}
            prefix="$"
            min={0}
            placeholder={expectedCash !== null ? String(expectedCash) : '0'}
            disabled={loading || pending}
            autoFocus
            required
          />
        </FormField>

        {expectedCash !== null && counted !== null ? (
          <div
            className={cn(
              'rounded-xl border p-3 text-sm',
              Math.abs(difference) < 1
                ? 'border-success-border bg-success-bg text-success'
                : difference < 0
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-warning-border bg-warning-bg text-warning',
            )}
          >
            <div className="flex items-center justify-between">
              <span>Diferencia (counted − expected)</span>
              <Money
                amount={difference}
                size="lg"
                weight="bold"
                withSign
                className="text-current"
              />
            </div>
            {Math.abs(difference) >= 5000 ? (
              <p className="mt-1 text-[0.6875rem]">
                Descuadre ≥ $5.000 — se registra en audit como anomalía.
              </p>
            ) : null}
          </div>
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

function Row({
  label,
  value,
  bold,
  muted,
  positive,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between',
        muted ? 'text-xs text-muted-foreground' : 'text-foreground',
      )}
    >
      <span>{label}</span>
      <Money
        amount={value}
        size={bold ? 'lg' : 'sm'}
        weight={bold ? 'bold' : 'medium'}
        withSign={positive}
      />
    </div>
  );
}

function computeSummary(sales: Sale[]): ShiftSummary {
  const byMethod: Record<string, { count: number; total: number }> = {};
  let totalSales = 0;
  let countSales = 0;
  for (const s of sales) {
    if (s.status === 'PENDIENTE_PAGO' || s.status === 'VOID' || s.status === 'CANCELADO_NO_PAGO') {
      continue;
    }
    countSales += 1;
    totalSales += s.total;
    const method = s.paymentMethod ?? 'UNKNOWN';
    if (!byMethod[method]) byMethod[method] = { count: 0, total: 0 };
    byMethod[method].count += 1;
    byMethod[method].total += s.total;
  }
  const cashSalesTotal = byMethod.CASH?.total ?? 0;
  return { totalSales, countSales, byMethod, cashSalesTotal };
}
