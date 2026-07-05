import type { ShiftSessionOrder } from '@pos-tercos/types';
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

export function ShiftSessionOrdersTable({ orders }: { orders: ShiftSessionOrder[] }) {
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
