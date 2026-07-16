'use client';

import { isWebSaleType, type Sale } from '@pos-tercos/types';
import { Dialog, Money, StatusBadge, formatDate } from '@pos-tercos/ui';
import { methodLabel } from '../lib/history-row-config';
import { SALE_STATUS_MAPPING } from '../lib/sale-status-mapping';

/** Modal con el detalle completo de un pedido: ítems, modificadores, notas, pagos y totales. */
export function SaleDetailModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  if (!sale) return null;
  const items = sale.items ?? [];
  const payments = sale.payments ?? [];

  return (
    <Dialog
      open={sale !== null}
      onClose={onClose}
      title={`Pedido #${sale.receiptNumber}`}
      description={sale.customerName ?? (isWebSaleType(sale.type) ? 'Pedido web' : 'Mostrador')}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <StatusBadge status={sale.status} mapping={SALE_STATUS_MAPPING} size="sm" />
          <span>{formatDate(sale.createdAt, 'short')}</span>
          {sale.cashierName ? <span>· Cajero: {sale.cashierName}</span> : null}
          {sale.customerPhone ? <span>· Tel: {sale.customerPhone}</span> : null}
          {sale.customerNit ? <span>· NIT: {sale.customerNit}</span> : null}
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ítems ({items.length})
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ítems.</p>
          ) : (
            <ul className="space-y-2.5">
              {items.map((it) => (
                <li key={it.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {it.quantity}× {it.productName ?? 'Producto'}
                      {it.sizeName ? ` · ${it.sizeName}` : ''}
                    </span>
                    <Money amount={it.lineTotal} className="shrink-0 text-sm" />
                  </div>
                  {it.modifiers.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      + {it.modifiers.map((m) => m.name).join(', ')}
                    </p>
                  ) : null}
                  {it.notes ? (
                    <p className="text-xs italic text-muted-foreground">“{it.notes}”</p>
                  ) : null}
                  {it.appliedPromotionName ? (
                    <p className="text-xs text-success">Promo: {it.appliedPromotionName}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <Money amount={sale.subtotal} className="text-sm" />
          </div>
          {sale.discountTotal > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Descuento{sale.discountReason ? ` · ${sale.discountReason}` : ''}</span>
              <span>−{Math.round(sale.discountTotal).toLocaleString('es-CO')}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-foreground">
            <span>Total</span>
            <Money amount={sale.total} weight="semibold" className="text-base" />
          </div>
        </section>

        {payments.length > 0 ? (
          <section className="border-t border-border pt-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {payments.length > 1 ? `Pagos (cuenta dividida · ${payments.length})` : 'Pago'}
            </h3>
            <ul className="space-y-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between text-foreground">
                  <span>
                    {methodLabel(p.method)}
                    {p.amountReceived != null && p.amountReceived > p.amount
                      ? ` · vuelto ${Math.round(p.amountReceived - p.amount).toLocaleString('es-CO')}`
                      : ''}
                  </span>
                  <Money amount={p.amount} className="text-sm" />
                </li>
              ))}
            </ul>
          </section>
        ) : sale.paymentMethod ? (
          <section className="border-t border-border pt-3 text-sm">
            <div className="flex justify-between text-foreground">
              <span className="text-muted-foreground">Método de pago</span>
              <span>{methodLabel(sale.paymentMethod)}</span>
            </div>
          </section>
        ) : null}

        {sale.notes ? (
          <section className="border-t border-border pt-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notas
            </h3>
            <p className="text-sm text-foreground">{sale.notes}</p>
          </section>
        ) : null}

        {sale.status === 'VOID' && sale.voidReason ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="font-semibold">Motivo de anulación:</span> {sale.voidReason}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
