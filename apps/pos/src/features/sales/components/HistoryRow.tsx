'use client';

import type { Sale, SaleStatus } from '@pos-tercos/types';
import { Button, Money, StatusBadge, cn, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { printReceipt } from '../api/print';
import { markKitchenReady } from '../api/kitchen';
import { SALE_STATUS_MAPPING } from '../lib/sale-status-mapping';
import { elapsedTone, isActiveSale, minutesSince } from '../lib/history-filters';

/** Pedido vivo en el local: aún se puede corregir. */
const EDITABLE_STATUSES = new Set<SaleStatus>(['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO']);
const PAYMENT_CHANGE_STATUSES = new Set<SaleStatus>([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
]);

function methodLabel(method: string): string {
  return method === 'CASH' ? 'Efectivo' : method === 'TRANSFER' ? 'Transferencia' : method;
}

export function HistoryRow({
  sale,
  onChanged,
  onEdit,
  onChangePayment,
}: {
  sale: Sale;
  onChanged: () => Promise<void> | void;
  onEdit: () => void;
  onChangePayment: () => void;
}) {
  const [reprint, setReprint] = useState<'idle' | 'pending' | 'ok' | 'error'>(
    'idle',
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = isActiveSale(sale.status);
  const mins = minutesSince(sale.paidAt ?? sale.createdAt);
  const items = sale.items ?? [];

  const runKitchen = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleReprint = async () => {
    setReprint('pending');
    try {
      await printReceipt(sale.id, { fallback: sale, reprint: true });
      setReprint('ok');
      setTimeout(() => setReprint('idle'), 2500);
    } catch {
      setReprint('error');
      setTimeout(() => setReprint('idle'), 2500);
    }
  };

  return (
    <li className="rounded-lg border border-border bg-card p-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Turno = el número con el que se llama al cliente (igual que el
                turnero). El recibo va abajo como referencia de caja. */}
            <span className="shrink-0 font-display text-base font-bold tabular-nums text-foreground">
              {sale.turnNumber !== null ? `Turno ${sale.turnNumber}` : 'Sin turno'}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {sale.customerName ??
                (sale.type === 'WEB_PICKUP' ? 'Pedido web' : 'Mostrador')}
            </span>
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            Recibo #{sale.receiptNumber} · {formatDate(sale.createdAt, 'time-short')}
            {sale.paymentMethod ? ` · ${methodLabel(sale.paymentMethod)}` : ''}
            {` · ${items.length} ít.`}
            {active ? (
              <span className={cn('ml-1 font-semibold', elapsedTone(mins))}>
                · {mins} min
              </span>
            ) : null}
            <span className="ml-1 text-muted-foreground">{open ? '▲' : '▼'}</span>
          </p>
        </div>
        <Money amount={sale.total} weight="semibold" className="shrink-0" />
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusBadge status={sale.status} mapping={SALE_STATUS_MAPPING} />
        <div className="flex items-center gap-1.5">
          {EDITABLE_STATUSES.has(sale.status) ? (
            <Button variant="outline" size="sm" onClick={onEdit} title="Editar productos del pedido">
              Editar
            </Button>
          ) : null}
          {PAYMENT_CHANGE_STATUSES.has(sale.status) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onChangePayment}
              title="Cambiar método de pago registrado"
            >
              Pago
            </Button>
          ) : null}
          {/* El cajero NO inicia pedidos (eso es del KDS); solo puede marcar
              listo cuando la cocina ya lo está preparando. */}
          {sale.status === 'EN_PREPARACION' ? (
            <Button
              variant="success"
              size="sm"
              disabled={busy}
              onClick={() => void runKitchen(() => markKitchenReady(sale.id))}
              title="Marcar listo"
            >
              {busy ? '…' : 'Listo'}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReprint}
            disabled={reprint === 'pending'}
            title="Reimprimir recibo"
          >
            {reprint === 'pending'
              ? '…'
              : reprint === 'ok'
                ? '✓'
                : reprint === 'error'
                  ? 'Error'
                  : 'Recibo'}
          </Button>
        </div>
      </div>

      {sale.status === 'VOID' && sale.voidReason ? (
        <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[0.6875rem] leading-snug text-destructive">
          <span className="font-semibold">Motivo de anulación:</span> {sale.voidReason}
        </p>
      ) : null}

      {open ? (
        <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2">
          {sale.customerPhone ? (
            <p className="text-[0.6875rem] text-muted-foreground">
              Tel: {sale.customerPhone}
            </p>
          ) : null}
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin ítems.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.id} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {it.quantity}× {it.productName ?? 'Producto'}
                      {it.sizeName ? ` · ${it.sizeName}` : ''}
                    </span>
                    <Money amount={it.lineTotal} className="shrink-0 text-xs" />
                  </div>
                  {it.modifiers.length > 0 ? (
                    <p className="text-[0.625rem] text-muted-foreground">
                      + {it.modifiers.map((m) => m.name).join(', ')}
                    </p>
                  ) : null}
                  {it.notes ? (
                    <p className="text-[0.625rem] italic text-muted-foreground">
                      “{it.notes}”
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {sale.discountTotal > 0 ? (
            <p className="border-t border-border pt-1 text-[0.6875rem] text-muted-foreground">
              Descuento: −{Math.round(sale.discountTotal).toLocaleString('es-CO')}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
