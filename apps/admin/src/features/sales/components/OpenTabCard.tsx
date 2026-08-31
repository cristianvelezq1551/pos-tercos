'use client';

import type { Sale } from '@pos-tercos/types';
import { Button, Money } from '@pos-tercos/ui';

/** Unidades aún no enviadas a cocina (suma de todas las líneas). */
export function pendingKitchenUnits(sale: Sale): number {
  return (sale.items ?? []).reduce(
    (acc, it) => acc + Math.max(0, it.quantity - (it.sentToKitchenQty ?? 0)),
    0,
  );
}

/** Alguna unidad YA llegó a cocina (para la comanda de anulación #8). */
export function anySentToKitchen(sale: Sale): boolean {
  return (sale.items ?? []).some((it) => (it.sentToKitchenQty ?? 0) > 0);
}

/** Card de una cuenta abierta (#3) con sus 4 acciones. */
export function OpenTabCard({
  tab,
  busy,
  onPay,
  onEdit,
  onSendKitchen,
  onCancel,
}: {
  tab: Sale;
  busy: boolean;
  onPay: () => void;
  onEdit: () => void;
  onSendKitchen: () => void;
  onCancel: () => void;
}) {
  const pending = pendingKitchenUnits(tab);
  const itemsCount = (tab.items ?? []).reduce((a, it) => a + it.quantity, 0);
  return (
    <li className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {tab.customerName ?? `Cuenta #${tab.receiptNumber}`}
          </p>
          <p className="text-xs text-muted-foreground">
            #{tab.receiptNumber} · {itemsCount} ítem{itemsCount === 1 ? '' : 's'}
            {pending > 0 ? (
              <span className="ml-1 font-semibold text-warning">· {pending} sin enviar</span>
            ) : null}
          </p>
        </div>
        <Money amount={tab.total} weight="semibold" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button size="sm" disabled={busy} onClick={onPay}>
          Cobrar
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
          Agregar / editar
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || pending === 0}
          onClick={onSendKitchen}
        >
          {pending > 0 ? `A cocina (${pending})` : 'A cocina'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </li>
  );
}
