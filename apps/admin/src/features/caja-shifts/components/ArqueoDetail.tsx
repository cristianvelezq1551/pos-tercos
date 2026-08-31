'use client';

import type { ShiftSessionDetail } from '@pos-tercos/types';
import { LoadingSkeleton, Money, formatDate } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { getShiftDetail } from '../api/list';
import { PAID_STATUSES } from '../lib/sale-statuses';
import { MethodRow, SectionRow, type MethodOrderEntry } from './ArqueoBreakdown';
import { ArqueoCountedSection } from './ArqueoCountedSection';
import { getErrorMessage } from '../../../lib/errors';

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
        if (!cancelled) setError(getErrorMessage(e, 'Error'));
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
        (a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime(),
      );

  // Lo COBRADO por método = ventas (sale_payments) + entradas de caja.
  // Egresos por método = salidas de caja.
  //
  // Se llama "cobrado" y no "ingresos" a propósito: acá se arquea contra plata
  // física, así que el número tiene que ser BRUTO (el domicilio pagado por
  // transferencia sí entró a la cuenta). Lo que NO puede pasar es leerse como
  // venta — para eso está la línea de domicilios de abajo.
  //
  // `byMethod` YA viene neto de domicilios (§7.v30): esa plata se le paga al
  // repartidor en el momento, así que al cerrar no está en ningún medio. Acá no
  // se descuenta nada ni se muestra línea aparte — el dato vive en
  // Finanzas → Domicilios del mes.
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

      <SectionRow title="Cobrado" amount={ingresosTotal} />
      {inRows.map((r) => (
        <MethodRow
          key={`in-${r.method}`}
          method={r.method}
          amount={r.amount}
          count={entriesFor(r.method).length}
          href={`/caja/arqueos/${shiftId}/metodo/${encodeURIComponent(r.method)}`}
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

      <ArqueoCountedSection shift={shift} />

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
