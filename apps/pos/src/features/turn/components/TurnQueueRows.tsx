'use client';

import { Button } from '@pos-tercos/ui';
import type { ReadyToCallOrder } from '@pos-tercos/types';

function channelLabel(type: ReadyToCallOrder['type']): string {
  return type === 'WEB_PICKUP' ? 'Pickup' : 'Mostrador';
}

function itemsText(order: ReadyToCallOrder): string {
  return order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ');
}

export function ReadyRow({
  order,
  busy,
  onCall,
}: {
  order: ReadyToCallOrder;
  busy: boolean;
  onCall: () => void;
}) {
  const items = itemsText(order);
  return (
    <li className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-start gap-2.5">
        <span className="font-display text-2xl font-extrabold leading-none tabular text-foreground">
          #{order.turnNumber}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">
              {order.customerName ?? channelLabel(order.type)}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase text-muted-foreground">
              {channelLabel(order.type)}
            </span>
          </div>
          {/* Ítems completos (sin truncar) para que el cajero los lea al llamar. */}
          {items ? (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{items}</p>
          ) : null}
        </div>
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={onCall}
        className="mt-2 w-full"
      >
        Llamar #{order.turnNumber}
      </Button>
    </li>
  );
}

export function CalledRow({
  order,
  busy,
  onRecall,
  onDeliver,
}: {
  order: ReadyToCallOrder;
  busy: boolean;
  onRecall: () => void;
  onDeliver: () => void;
}) {
  const items = itemsText(order);
  return (
    <li className="rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-start gap-2">
        <span className="font-display text-lg font-bold leading-none tabular text-muted-foreground">
          #{order.turnNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">
            {order.customerName ?? channelLabel(order.type)}
          </p>
          {/* Info del pedido también aquí: el cajero re-llama sin ir al historial. */}
          {items ? (
            <p className="mt-0.5 text-[0.6875rem] leading-snug text-muted-foreground">
              {items}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onRecall}
          className="flex-1"
        >
          Re-llamar #{order.turnNumber}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onDeliver}
          title="Marcar entregado (el cliente lo retiró)"
          className="shrink-0 text-success"
        >
          ✓ Entregado
        </Button>
      </div>
    </li>
  );
}
