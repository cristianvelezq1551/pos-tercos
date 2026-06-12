'use client';

import {
  PAYMENT_METHOD_LABELS,
  type Sale,
  type ShiftSessionDetail,
  type ShiftSessionOrder,
} from '@pos-tercos/types';
import { Button, EmptyState, LoadingSkeleton, Money, formatDate } from '@pos-tercos/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChangePaymentModal, getSale } from '../../sales';
import { getShiftDetail } from '../api/list';

const label = (m: string): string =>
  PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m;

const PAID_STATUSES = new Set([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
  'CANCELADO_SIN_REEMBOLSO',
]);

/**
 * Ventas de UN método de pago dentro de una caja: cada venta con sus
 * productos (cantidad, nombre, valor) y sus partes de pago. Desde acá se
 * corrige el método de una venta mal registrada — solo mientras la caja
 * siga abierta (cerrada es histórica; el admin puede reabrirla).
 */
export function MethodSalesView({ shiftId, method }: { shiftId: string; method: string }) {
  const [detail, setDetail] = useState<ShiftSessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<Sale | null>(null);
  const [loadingSale, setLoadingSale] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await getShiftDetail(shiftId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando la caja');
    }
  }, [shiftId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!detail) return <LoadingSkeleton shape="text" count={6} />;

  const { shift } = detail;
  const shiftOpen = shift.status === 'OPEN';
  const entries = detail.orders
    .filter((o) => PAID_STATUSES.has(o.status))
    .flatMap((o) => {
      const part = o.payments
        .filter((p) => p.method === method)
        .reduce((a, p) => a + p.amount, 0);
      return part > 0 ? [{ order: o, amount: part }] : [];
    })
    .sort(
      (a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime(),
    );
  const total = entries.reduce((a, e) => a + e.amount, 0);

  const openChangePayment = async (orderId: string) => {
    setLoadingSale(orderId);
    try {
      setChanging(await getSale(orderId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando la venta');
    } finally {
      setLoadingSale(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/arqueos"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Arqueos
        </Link>
        <div>
          <h1 className="text-base font-bold text-foreground">
            {label(method)} · {formatDate(shift.openedAt, 'short')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {entries.length} venta{entries.length === 1 ? '' : 's'} ·{' '}
            {shiftOpen ? 'Caja abierta' : 'Caja cerrada'} · Cajero {shift.cashierName ?? '—'}
          </p>
        </div>
        <span className="ml-auto text-lg font-bold tabular-nums text-foreground">
          <Money amount={total} weight="bold" />
        </span>
      </div>

      {!shiftOpen ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          La caja ya cerró: el arqueo es histórico y los pagos no se pueden cambiar.
          Si hay un error, un admin puede reabrir la caja desde el dashboard y ahí sí corregirlo.
        </p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState title={`Sin ventas en ${label(method)} en esta caja`} size="sm" />
      ) : (
        <ul className="space-y-2">
          {entries.map(({ order: o, amount }) => (
            <li key={o.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {o.turnNumber !== null ? `Turno ${o.turnNumber}` : `Recibo #${o.receiptNumber}`}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {formatDate(o.createdAt, 'time')}
                      {o.customerName ? ` · ${o.customerName}` : ''}
                    </span>
                  </p>
                  <PaymentTags order={o} highlight={method} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Money amount={amount} weight="semibold" />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!shiftOpen || loadingSale === o.id}
                    onClick={() => void openChangePayment(o.id)}
                    title={
                      shiftOpen
                        ? 'Corregir el método o la división de pago'
                        : 'Caja cerrada — no se puede cambiar'
                    }
                  >
                    {loadingSale === o.id ? '…' : 'Cambiar pago'}
                  </Button>
                </div>
              </div>

              <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
                {o.items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2 text-xs tabular-nums">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {it.quantity}× {it.name}
                    </span>
                    <Money amount={it.lineTotal} size="xs" className="shrink-0" />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <MethodMovements detail={detail} method={method} />

      <ChangePaymentModal
        sale={changing}
        open={changing !== null}
        onClose={() => setChanging(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

/** Movimientos de caja (entradas/salidas) registrados en este método. */
function MethodMovements({
  detail,
  method,
}: {
  detail: ShiftSessionDetail;
  method: string;
}) {
  const movements = detail.cashMovements.filter((m) => m.method === method);
  if (movements.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="caps mb-1.5 text-[0.625rem] text-muted-foreground">
        Movimientos de caja · {label(method)}
      </p>
      <ul className="space-y-0.5">
        {movements.map((m) => (
          <li key={m.id} className="flex justify-between gap-2 text-xs tabular-nums">
            <span className="min-w-0 truncate text-muted-foreground">
              {m.type === 'IN' ? '↑ Entrada' : '↓ Salida'} · {m.reason}
            </span>
            <Money
              amount={m.type === 'IN' ? m.amount : -m.amount}
              size="xs"
              withSign
              className="shrink-0"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Partes de pago de la venta; resalta el método de esta vista. */
function PaymentTags({ order, highlight }: { order: ShiftSessionOrder; highlight: string }) {
  if (order.payments.length <= 1) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-1">
      {order.payments.map((p, i) => (
        <span
          key={i}
          className={
            p.method === highlight
              ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-[0.625rem] font-semibold text-primary'
              : 'rounded-full bg-muted/60 px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground'
          }
        >
          {label(p.method)} {Math.round(p.amount).toLocaleString('es-CO')}
        </span>
      ))}
    </p>
  );
}
