'use client';

import {
  PAYMENT_METHOD_LABELS,
  type ShiftSessionDetail,
} from '@pos-tercos/types';
import { LoadingSkeleton, Money, cn, formatDate } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getShiftDetail } from '../api/list';
import { MethodRow, SectionRow, type MethodOrderEntry } from './ArqueoBreakdown';

const label = (m: string): string =>
  PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m;

/** Ventas que cuentan plata (excluye pendientes, canceladas sin pago y VOID). */
const PAID_STATUSES = new Set([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
  'CANCELADO_SIN_REEMBOLSO',
]);

/**
 * Detalle de un arqueo, estilo reporte de caja: monto inicial → ingresos y
 * egresos por método (expandibles con cada venta/movimiento) → total
 * esperado → lo contado por el cajero → diferencia.
 */
export function ArqueoDetail({ shiftId }: { shiftId: string }) {
  const [detail, setDetail] = useState<ShiftSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShiftDetail(shiftId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  if (error) return <p className="px-3 pb-3 text-sm text-destructive">{error}</p>;
  if (!detail) {
    return (
      <div className="px-3 pb-3">
        <LoadingSkeleton shape="text" count={4} />
      </div>
    );
  }

  const { shift, summary, cashMovements, orders } = detail;
  const paidOrders = orders.filter((o) => PAID_STATUSES.has(o.status));

  // Ventas por método desde sale_payments: una cuenta dividida aparece bajo
  // CADA método con la parte que le corresponde (marcada como tal).
  const entriesFor = (method: string): MethodOrderEntry[] =>
    paidOrders
      .flatMap((o) => {
        const part = o.payments
          .filter((p) => p.method === method)
          .reduce((a, p) => a + p.amount, 0);
        if (part <= 0) return [];
        return [{ order: o, amount: part, isPart: o.payments.length > 1 }];
      })
      .sort(
        (a, b) =>
          new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime(),
      );

  // Ingresos por método = ventas (sale_payments) + entradas de caja.
  // Egresos por método = salidas de caja.
  const methods = new Set<string>([
    ...summary.byMethod.map((m) => m.method),
    ...cashMovements.map((m) => m.method),
  ]);
  const inRows: Array<{ method: string; amount: number }> = [];
  const outRows: Array<{ method: string; amount: number }> = [];
  for (const m of methods) {
    const sales = summary.byMethod.find((x) => x.method === m)?.total ?? 0;
    const movIn = cashMovements
      .filter((x) => x.method === m && x.type === 'IN')
      .reduce((a, x) => a + x.amount, 0);
    const movOut = cashMovements
      .filter((x) => x.method === m && x.type === 'OUT')
      .reduce((a, x) => a + x.amount, 0);
    if (sales + movIn > 0) inRows.push({ method: m, amount: sales + movIn });
    if (movOut > 0) outRows.push({ method: m, amount: movOut });
  }
  const ingresosTotal = inRows.reduce((a, r) => a + r.amount, 0);
  const egresosTotal = outRows.reduce((a, r) => a + r.amount, 0);
  const expectedTotal = shift.openingCash + ingresosTotal - egresosTotal;

  // Según usuario: efectivo contado + arqueo digital por método.
  const digital = shift.digitalCountBreakdown ?? [];
  const countedRows: Array<{ method: string; amount: number | null }> = [
    { method: 'CASH', amount: shift.countedCash },
    ...digital.map((d) => ({ method: d.method as string, amount: d.counted })),
  ];
  const countedTotal = countedRows.reduce((a, r) => a + (r.amount ?? 0), 0);
  const diffTotal =
    (shift.difference ?? 0) + digital.reduce((a, d) => a + (d.difference ?? 0), 0);

  return (
    <div className="border-t border-border text-sm">
      {/* Cabecera del arqueo */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2.5 text-xs sm:grid-cols-4">
        <Info label="Apertura" value={formatDate(shift.openedAt, 'datetime')} />
        <Info
          label="Cierre"
          value={shift.closedAt ? formatDate(shift.closedAt, 'datetime') : '—'}
        />
        <Info label="Cajero" value={shift.cashierName ?? '—'} />
        <Info label="Estado" value={shift.status === 'CLOSED' ? 'Cerrado' : shift.status} />
      </dl>

      <SectionRow title="Monto inicial" amount={shift.openingCash} />

      <SectionRow title="Ingresos" amount={ingresosTotal} />
      {inRows.map((r) => (
        <MethodRow
          key={`in-${r.method}`}
          method={r.method}
          amount={r.amount}
          entries={entriesFor(r.method)}
          movements={cashMovements.filter((m) => m.method === r.method && m.type === 'IN')}
        />
      ))}

      <SectionRow title="Egreso" amount={egresosTotal} negative />
      {outRows.map((r) => (
        <MethodRow
          key={`out-${r.method}`}
          method={r.method}
          amount={r.amount}
          movements={cashMovements.filter((m) => m.method === r.method && m.type === 'OUT')}
        />
      ))}

      <SectionRow title="Total" amount={expectedTotal} strong />

      {/* Lo que el cajero contó al cerrar */}
      <p className="caps border-t border-border bg-muted/50 px-3 py-1.5 text-[0.625rem] font-bold tracking-[0.2em] text-muted-foreground">
        Según usuario
      </p>
      {countedRows.map((r) => (
        <div
          key={`counted-${r.method}`}
          className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-sm"
        >
          <span className="text-muted-foreground">{label(r.method)}</span>
          {r.amount !== null ? (
            <Money amount={r.amount} size="sm" weight="medium" />
          ) : (
            <span className="text-xs text-muted-foreground">sin arquear</span>
          )}
        </div>
      ))}
      <SectionRow title="Total" amount={countedTotal} strong />

      <div
        className={cn(
          'flex items-center justify-between px-3 py-2.5',
          diffTotal === 0
            ? 'bg-success/15'
            : diffTotal < 0
              ? 'bg-destructive/15'
              : 'bg-success/15',
        )}
      >
        <span className="text-sm font-bold uppercase tracking-wide text-foreground">
          Diferencia
        </span>
        <span
          className={cn(
            'text-base font-bold tabular-nums',
            diffTotal === 0 ? 'text-success' : diffTotal < 0 ? 'text-destructive' : 'text-success',
          )}
        >
          {diffTotal === 0 ? 'Cuadró ✓' : (
            <>
              {diffTotal > 0 ? '+' : ''}
              <Money amount={diffTotal} weight="bold" className="text-current" />
            </>
          )}
        </span>
      </div>

      {shift.tipsCollected !== null && shift.tipsCollected !== undefined ? (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Propinas (bote aparte)</span>
          <Money amount={shift.tipsCollected} weight="medium" />
        </div>
      ) : null}

      {shift.notes ? (
        <p className="border-t border-border px-3 py-2 text-xs italic text-muted-foreground">
          “{shift.notes}”
        </p>
      ) : null}
    </div>
  );
}

function Info({ label: l, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="caps text-[0.5625rem] text-muted-foreground">{l}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
