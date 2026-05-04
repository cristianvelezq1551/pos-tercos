'use client';

import type { Sale, Shift } from '@pos-tercos/types';
import { Button, Dialog, Input, Label } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { COP } from '../../catalog/lib/format';
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
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open || !shift) return;
    setSummary(null);
    setCounted('');
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

  const countedNum = Number(counted) || 0;
  const difference = expectedCash !== null ? countedNum - expectedCash : 0;
  const canConfirm = summary !== null && counted.length > 0 && countedNum >= 0 && !pending;

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
  const opened = new Date(shift.openedAt).toLocaleString('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Cerrar turno"
      description={`Apertura ${opened} · Cajero ${shift.cashierName ?? '—'}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
        {loading ? (
          <p className="text-sm text-gray-500">Calculando Z-report…</p>
        ) : summary ? (
          <section className="rounded-md bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Z-report del turno
            </p>
            <div className="mt-3 space-y-1 text-sm">
              <Row label="Apertura (efectivo inicial)" value={COP.format(shift.openingCash)} />
              <Row label={`Ventas en efectivo (${summary.byMethod.CASH?.count ?? 0})`} value={`+ ${COP.format(summary.cashSalesTotal)}`} />
              {Object.entries(summary.byMethod)
                .filter(([m]) => m !== 'CASH')
                .map(([method, v]) => (
                  <Row
                    key={method}
                    muted
                    label={`${method} (${v.count})`}
                    value={COP.format(v.total)}
                  />
                ))}
              <div className="border-t border-gray-300 pt-2">
                <Row
                  label="Esperado en caja"
                  value={COP.format(expectedCash ?? 0)}
                  bold
                />
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                Total ventas del turno: {summary.countSales} · {COP.format(summary.totalSales)}
              </p>
            </div>
          </section>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="counted">Efectivo contado físicamente (COP)</Label>
          <Input
            id="counted"
            type="number"
            min="0"
            step="100"
            inputMode="decimal"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder={expectedCash !== null ? String(expectedCash) : '0'}
            disabled={loading || pending}
            autoFocus
            required
          />
        </div>

        {expectedCash !== null && counted.length > 0 ? (
          <div
            className={`rounded-md p-3 text-sm ${
              Math.abs(difference) < 1
                ? 'bg-emerald-50 text-emerald-900'
                : difference < 0
                  ? 'bg-red-50 text-red-900'
                  : 'bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>Diferencia (counted − expected)</span>
              <span className="font-bold tabular-nums">
                {difference > 0 ? '+' : ''}
                {COP.format(difference)}
              </span>
            </div>
            {Math.abs(difference) >= 5000 ? (
              <p className="mt-1 text-[11px]">
                ⚠ Descuadre &gt;= $5.000 — se registra en audit como anomalía.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Input
            id="notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej. faltan $5k del cambio del cliente Pedro"
            maxLength={500}
            disabled={pending}
          />
        </div>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {pending ? 'Cerrando…' : 'Cerrar turno'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${muted ? 'text-xs text-gray-500' : ''}`}
    >
      <span className={muted ? '' : 'text-gray-600'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'text-base font-bold text-gray-900' : ''}`}>
        {value}
      </span>
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
