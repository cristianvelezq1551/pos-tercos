'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { NON_REVENUE_SALE_STATUSES, type ShiftSessionOrder } from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../lib/format';
import { METHOD_LABEL, TYPE_LABEL } from './shift-session-labels';

const SALE_STATUS_LABEL: Record<string, string> = {
  PENDIENTE_PAGO: 'Pendiente pago',
  PAGADO: 'Pagado',
  EN_PREPARACION: 'En preparación',
  LISTO_DESPACHO: 'Listo',
  ENTREGADO: 'Entregado',
  CANCELADO_NO_PAGO: 'Cancelado',
  CANCELADO_SIN_REEMBOLSO: 'Cancelado',
  VOID: 'Anulada',
};

// Color del badge de estado. Verde = generó ingreso; ámbar = pendiente; rojo =
// cancelado/anulado. Neutro para el resto.
const SALE_STATUS_TONE: Record<string, string> = {
  PENDIENTE_PAGO: 'bg-warning-bg text-warning ring-warning-border',
  PAGADO: 'bg-success-bg text-success ring-success-border',
  EN_PREPARACION: 'bg-success-bg text-success ring-success-border',
  LISTO_DESPACHO: 'bg-success-bg text-success ring-success-border',
  ENTREGADO: 'bg-success-bg text-success ring-success-border',
  CANCELADO_NO_PAGO: 'bg-destructive/15 text-destructive ring-destructive/30',
  CANCELADO_SIN_REEMBOLSO: 'bg-destructive/15 text-destructive ring-destructive/30',
  VOID: 'bg-destructive/15 text-destructive ring-destructive/30',
};

const NON_REVENUE_SET = new Set<string>(NON_REVENUE_SALE_STATUSES);

// Cuántas columnas cubre la fila de detalle. En teléfono se esconden cuatro
// (tipo, cliente, método y hora), así que el detalle abarca las cuatro que
// quedan; un colSpan de más deja una celda fantasma que corre la tabla.
const COLSPAN = 8;
const COLSPAN_MOVIL = 4;

function StatusBadge({ status }: { status: string }) {
  const tone = SALE_STATUS_TONE[status] ?? 'bg-muted text-muted-foreground ring-border';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {SALE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Fracción (0..1) → "42%". */
function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Color del margen: sano (verde) / ajustado (ámbar) / en pérdida (rojo). */
function marginTone(fraction: number): string {
  if (fraction >= 0.4) return 'text-success';
  if (fraction >= 0.15) return 'text-warning';
  return 'text-destructive';
}

export function ShiftSessionOrdersTable({ orders }: { orders: ShiftSessionOrder[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center text-sm text-muted-foreground">
        No hay pedidos en esta sesión.
      </div>
    );
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th aria-label="Expandir" />
            <Th>Recibo</Th>
            <Th soloAncho>Tipo</Th>
            <Th soloAncho>Cliente</Th>
            <Th soloAncho>Método</Th>
            <Th align="right">Total</Th>
            <Th>Estado</Th>
            <Th soloAncho>Hora</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((o) => {
            const isOpen = expanded.has(o.id);
            const hasDiscount = o.discountTotal > 0;
            // No generó ingreso (cancelado/anulado/pendiente): se atenúa para que
            // NO se lea como venta con ganancia.
            const isNonRevenue = NON_REVENUE_SET.has(o.status);
            return (
              <Fragment key={o.id}>
                <tr
                  onClick={() => toggle(o.id)}
                  className={`cursor-pointer transition-colors hover:bg-muted/40 ${
                    isNonRevenue ? 'opacity-60' : ''
                  }`}
                >
                  <Td>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Td>
                  <Td>
                    <span className="font-medium tabular-nums text-foreground">
                      #{o.receiptNumber}
                    </span>
                  </Td>
                  <Td soloAncho>{TYPE_LABEL[o.type] ?? o.type}</Td>
                  <Td soloAncho>{o.customerName ?? '—'}</Td>
                  <Td soloAncho>
                    {o.payments.length > 1
                      ? 'Dividido'
                      : o.paymentMethod
                        ? METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod
                        : '—'}
                  </Td>
                  <Td align="right" mono>
                    <span
                      className={
                        isNonRevenue ? 'text-muted-foreground line-through' : 'text-foreground'
                      }
                    >
                      {formatCop(o.total)}
                    </span>
                    {hasDiscount ? (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-warning/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-warning">
                        −{formatCop(o.discountTotal)}
                      </span>
                    ) : null}
                    {o.marginPct !== null ? (
                      <span
                        className={`ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium ${marginTone(o.marginPct)}`}
                        title="Ganancia estimada del pedido"
                      >
                        {formatPct(o.marginPct)}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td soloAncho>{formatDate(o.createdAt, 'datetime')}</Td>
                </tr>
                {isOpen ? (
                  <tr className="bg-muted/20">
                    <td colSpan={COLSPAN_MOVIL} className="px-4 py-4 sm:hidden">
                      <OrderDetail order={o} />
                    </td>
                    <td colSpan={COLSPAN} className="hidden px-4 py-4 sm:table-cell">
                      <OrderDetail order={o} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrderDetail({ order }: { order: ShiftSessionOrder }) {
  const showMargin = order.items.some((i) => i.lineMarginPct !== null);
  const isNonRevenue = NON_REVENUE_SET.has(order.status);
  return (
    <div className="space-y-3">
      {/* Aviso: el pedido no generó ingreso → no hay ganancia que mostrar. */}
      {isNonRevenue ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <StatusBadge status={order.status} />
          <span>Este pedido no generó ingreso — no cuenta como venta ni ganancia.</span>
        </div>
      ) : null}

      {/* Líneas del pedido */}
      {order.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin productos registrados.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <DetailTh>Producto</DetailTh>
                <DetailTh align="right">Cant.</DetailTh>
                <DetailTh align="right">P. unit.</DetailTh>
                <DetailTh align="right">Descuento</DetailTh>
                <DetailTh align="right">Total</DetailTh>
                {showMargin ? <DetailTh align="right">Ganancia</DetailTh> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((it, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-foreground">{it.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {it.quantity}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatCop(it.unitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.lineDiscount > 0 ? (
                      <span className="text-warning">
                        −{formatCop(it.lineDiscount)}
                        <span className="ml-1 text-[0.625rem] text-muted-foreground">
                          {it.hasPromotion ? 'promo' : 'manual'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">
                    {formatCop(it.lineTotal)}
                  </td>
                  {showMargin ? (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.lineMargin !== null && it.lineMarginPct !== null ? (
                        <span className={marginTone(it.lineMarginPct)}>
                          {formatCop(it.lineMargin)}
                          <span className="ml-1 text-[0.625rem]">
                            {formatPct(it.lineMarginPct)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground" title="Costo desconocido">
                          —
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ganancia estimada del pedido */}
      {order.marginTotal !== null && order.marginPct !== null ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Costo estimado:{' '}
            <span className="font-medium tabular-nums text-foreground">
              {order.costTotal !== null ? formatCop(order.costTotal) : '—'}
            </span>
          </span>
          <span className="text-muted-foreground">
            Ganancia estimada:{' '}
            <span className={`font-semibold tabular-nums ${marginTone(order.marginPct)}`}>
              {formatCop(order.marginTotal)} ({formatPct(order.marginPct)})
            </span>
          </span>
          <span
            className="text-[0.6875rem] text-muted-foreground"
            title="Se costea la variante que se vendió, con el último precio de compra de cada insumo. Lo que costó DE VERDAD sale por FIFO (del lote del que salió) y puede diferir si todavía se vende de un lote comprado a otro precio."
          >
            aprox. — receta de la variante, al último precio de compra
          </span>
        </div>
      ) : null}

      {/* Descuento sobre el total + motivo */}
      {order.orderDiscountAmount > 0 || order.discountReason ? (
        <div className="rounded-md bg-warning/10 px-3 py-2 text-sm">
          {order.orderDiscountAmount > 0 ? (
            <p className="font-medium text-warning">
              Descuento sobre el total: −{formatCop(order.orderDiscountAmount)}
            </p>
          ) : null}
          {order.discountReason ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Motivo: </span>
              {order.discountReason}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Pagos (si la cuenta se dividió) */}
      {order.payments.length > 1 ? (
        <div className="text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pagos (cuenta dividida)
          </p>
          <ul className="space-y-0.5">
            {order.payments.map((p, idx) => (
              <li key={idx} className="flex justify-between gap-4 tabular-nums">
                <span className="text-foreground">
                  {METHOD_LABEL[p.method] ?? p.method}
                </span>
                <span className="text-muted-foreground">{formatCop(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Th({
  children,
  align,
  soloAncho,
  ...rest
}: {
  children?: React.ReactNode;
  align?: 'right';
  /** Se esconde en teléfono: el dato vive igual en el detalle de la fila. */
  soloAncho?: boolean;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${soloAncho ? 'hidden sm:table-cell' : ''}`}
      {...rest}
    >
      {children}
    </th>
  );
}

function DetailTh({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
  soloAncho,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
  /** Par de su `Th soloAncho`: se esconde en teléfono. */
  soloAncho?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      } ${soloAncho ? 'hidden sm:table-cell' : ''}`}
    >
      {children}
    </td>
  );
}
