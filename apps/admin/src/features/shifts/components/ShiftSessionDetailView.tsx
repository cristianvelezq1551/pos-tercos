import type { ShiftSessionDetail, ShiftSessionOrder } from '@pos-tercos/types';
import { formatCop, formatDate } from '../../../lib/format';
import { ShiftCloseAiButton } from '../../ai-insights';
import { ReopenShiftButton } from './ReopenShiftButton';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
  RECONCILED: 'Reconciliada',
};

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

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Efectivo',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  QR_BANCOLOMBIA: 'QR Bancolombia',
  TRANSFER: 'Transferencia',
};

const TYPE_LABEL: Record<string, string> = {
  COUNTER: 'Mostrador',
  WEB_PICKUP: 'Web (retiro)',
};

/** Duración legible de la caja (cierre − apertura, o tiempo en curso). */
function formatDuration(openedAt: string, closedAt: string | null): string {
  const start = new Date(openedAt).getTime();
  const end = (closedAt ? new Date(closedAt) : new Date()).getTime();
  const mins = Math.max(0, Math.round((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ShiftSessionDetailView({ detail }: { detail: ShiftSessionDetail }) {
  const { shift, summary, orders } = detail;
  const isClosed = shift.status === 'CLOSED';

  return (
    <div className="space-y-6">
      {/* Cabecera de la sesión */}
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="caps text-xs text-muted-foreground">Cajero</p>
            <p className="text-lg font-semibold text-foreground">
              {shift.cashierName ?? '—'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Apertura {formatDate(shift.openedAt, 'datetime')}
              {shift.closedAt
                ? ` · Cierre ${formatDate(shift.closedAt, 'datetime')}`
                : ' · sin cerrar'}
              {' · '}
              <span className={shift.closedAt ? '' : 'text-warning'}>
                {shift.closedAt ? 'Duración' : 'Lleva abierta'}{' '}
                {formatDuration(shift.openedAt, shift.closedAt)}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset ring-border">
              {STATUS_LABEL[shift.status] ?? shift.status}
            </span>
            {isClosed ? <ReopenShiftButton shiftId={shift.id} /> : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CashStat label="Apertura" value={shift.openingCash} />
          <CashStat label="Esperado" value={shift.expectedCash} />
          <CashStat label="Contado" value={shift.countedCash} />
          <DiffStat value={shift.difference} />
        </div>
        {shift.notes ? (
          <p className="mt-4 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Notas: </span>
            {shift.notes}
          </p>
        ) : null}
      </section>

      {/* Asistente de cierre (IA) — solo para cajas cerradas. */}
      {isClosed ? <ShiftCloseAiButton shiftId={shift.id} /> : null}

      {/* Resumen de ventas */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Pedidos" value={String(summary.orderCount)} />
        <SummaryCard label="Pagados" value={String(summary.paidCount)} />
        <SummaryCard label="Anulados" value={String(summary.voidCount)} />
        <SummaryCard label="Ingresos" value={formatCop(summary.totalRevenue)} wide />
        <SummaryCard label="Efectivo" value={formatCop(summary.cashRevenue)} wide />
        <SummaryCard label="Digital" value={formatCop(summary.transferRevenue)} wide />
      </section>

      {/* Breakdowns */}
      <section className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="Por método de pago"
          rows={summary.byMethod.map((m) => ({
            label: METHOD_LABEL[m.method] ?? m.method,
            count: m.count,
            total: m.total,
          }))}
        />
        <BreakdownTable
          title="Por tipo de venta"
          rows={summary.byType.map((t) => ({
            label: TYPE_LABEL[t.type] ?? t.type,
            count: t.count,
            total: t.total,
          }))}
        />
      </section>

      {/* Movimientos de efectivo + arqueo por denominación */}
      {detail.cashMovements.length > 0 || detail.cashCountBreakdown ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {detail.cashMovements.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Movimientos de efectivo
                </h3>
              </div>
              <table className="min-w-full divide-y divide-border text-sm">
                <tbody className="divide-y divide-border">
                  {detail.cashMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5">
                        <span
                          className={
                            m.type === 'IN' ? 'font-medium text-success' : 'font-medium text-destructive'
                          }
                        >
                          {m.type === 'IN' ? 'Entrada' : 'Salida'}
                        </span>
                        <span className="text-muted-foreground"> · {m.reason}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">
                        {m.type === 'IN' ? '' : '−'}
                        {formatCop(m.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {detail.cashCountBreakdown && detail.cashCountBreakdown.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Arqueo por denominación
                </h3>
              </div>
              <table className="min-w-full divide-y divide-border text-sm">
                <tbody className="divide-y divide-border">
                  {detail.cashCountBreakdown.map((b) => (
                    <tr key={b.denomination}>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {formatCop(b.denomination)} × {b.count}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-foreground">
                        {formatCop(b.denomination * b.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Histórico de pedidos */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Pedidos de la sesión ({orders.length})
        </h2>
        <OrdersTable orders={orders} />
      </section>
    </div>
  );
}

function CashStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums text-foreground">
        {value !== null ? formatCop(value) : '—'}
      </p>
    </div>
  );
}

function DiffStat({ value }: { value: number | null }) {
  const tone =
    value === null || Math.abs(value) < 1
      ? 'text-foreground'
      : Math.abs(value) >= 5000
        ? value < 0
          ? 'text-destructive'
          : 'text-warning'
        : value < 0
          ? 'text-destructive'
          : 'text-warning';
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="caps text-[0.625rem] text-muted-foreground">Diferencia</p>
      <p className={`text-base font-semibold tabular-nums ${tone}`}>
        {value === null
          ? '—'
          : `${value > 0 ? '+' : ''}${formatCop(value)}`}
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3">
      <p className="caps text-[0.625rem] text-muted-foreground">{label}</p>
      <p
        className={`font-semibold tabular-nums text-foreground ${wide ? 'text-base' : 'text-xl'}`}
      >
        {value}
      </p>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; total: number }[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Sin datos.</p>
      ) : (
        <table className="min-w-full divide-y divide-border text-sm">
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-4 py-2.5 text-foreground">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {r.count}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">
                  {formatCop(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OrdersTable({ orders }: { orders: ShiftSessionOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-8 text-center text-sm text-muted-foreground">
        No hay pedidos en esta sesión.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th>Recibo</Th>
            <Th>Turno</Th>
            <Th>Tipo</Th>
            <Th>Cliente</Th>
            <Th>Método</Th>
            <Th align="right">Total</Th>
            <Th>Estado</Th>
            <Th>Hora</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((o) => (
            <tr key={o.id} className="transition-colors hover:bg-muted/40">
              <Td>
                <span className="font-medium tabular-nums text-foreground">
                  #{o.receiptNumber}
                </span>
              </Td>
              <Td>{o.turnNumber !== null ? o.turnNumber : '—'}</Td>
              <Td>{TYPE_LABEL[o.type] ?? o.type}</Td>
              <Td>{o.customerName ?? '—'}</Td>
              <Td>{o.paymentMethod ? METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod : '—'}</Td>
              <Td align="right" mono>
                {formatCop(o.total)}
              </Td>
              <Td>{SALE_STATUS_LABEL[o.status] ?? o.status}</Td>
              <Td>{formatDate(o.createdAt, 'datetime')}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
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
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 text-foreground ${align === 'right' ? 'text-right' : 'text-left'} ${
        mono ? 'tabular-nums' : ''
      }`}
    >
      {children}
    </td>
  );
}
