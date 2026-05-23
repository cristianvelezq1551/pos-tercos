'use client';

import { Button, Input } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import type { ReadyToCallOrder } from '@pos-tercos/types';
import {
  callManual,
  callSale,
  deliver,
  getDisplayState,
  getReadyToCall,
  resetTurn,
} from '../api/client';

const POLL_MS = 5000;

/**
 * Contenido del gestor de turnos (sin header propio). Se usa inline en la
 * vista del cajero y dentro del modal de la topbar. `active` controla el
 * polling (false cuando el modal está cerrado para no duplicar requests).
 */
export function TurnPanel({ active = true }: { active?: boolean }) {
  const [currentTurn, setCurrentTurn] = useState<number | null>(null);
  const [orders, setOrders] = useState<ReadyToCallOrder[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [state, ready] = await Promise.all([
        getDisplayState(),
        getReadyToCall(),
      ]);
      setCurrentTurn(state.currentTurn);
      setOrders(ready.orders);
    } catch {
      // La pantalla pública es la fuente de verdad; el POS solo refleja.
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [active, refresh]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const handleManual = () => {
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 1 || value > 9999) {
      setError('Ingresa un número entero entre 1 y 9999.');
      return;
    }
    void run(async () => {
      await callManual(value);
      setDraft('');
    });
  };

  const pendingCount = orders.filter((o) => o.calledAt === null).length;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
        <p className="caps text-[0.625rem] tracking-[0.3em] text-muted-foreground">
          Llamando ahora
        </p>
        <p className="mt-0.5 font-display text-5xl font-extrabold tabular leading-none text-foreground">
          #{currentTurn ?? '—'}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="caps text-[0.6875rem] tracking-[0.2em] text-muted-foreground">
          Listos por llamar ({orders.length})
        </p>
        {pendingCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold text-primary-foreground">
            {pendingCount}
          </span>
        ) : null}
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          Sin pedidos listos. Aparecen cuando la cocina los marca.
        </p>
      ) : (
        <ul className="max-h-[34vh] space-y-2 overflow-y-auto pr-0.5">
          {orders.map((o) => (
            <ReadyRow
              key={o.saleId}
              order={o}
              busy={busy}
              onCall={() => void run(() => callSale(o.saleId))}
              onDeliver={() => void run(() => deliver(o.saleId))}
            />
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            placeholder="Llamar manual (ej: 42)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
          />
          <Button variant="secondary" disabled={busy || !draft} onClick={handleManual}>
            Llamar
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => void run(resetTurn)}
        >
          Limpiar pantalla
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ReadyRow({
  order,
  busy,
  onCall,
  onDeliver,
}: {
  order: ReadyToCallOrder;
  busy: boolean;
  onCall: () => void;
  onDeliver: () => void;
}) {
  const channel = order.type === 'WEB_PICKUP' ? 'Pickup' : 'Mostrador';
  const itemsText = order.items
    .map((i) => `${i.quantity}× ${i.productName}`)
    .join(', ');
  const alreadyCalled = order.calledAt !== null;

  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span className="font-display text-xl font-extrabold tabular text-foreground">
          #{order.turnNumber}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {order.customerName ?? channel}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase text-muted-foreground">
              {channel}
            </span>
          </p>
          {itemsText ? (
            <p className="truncate text-[0.6875rem] text-muted-foreground">{itemsText}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        <Button
          size="sm"
          variant={alreadyCalled ? 'outline' : 'default'}
          className="flex-1"
          disabled={busy}
          onClick={onCall}
        >
          {alreadyCalled ? 'Re-llamar' : 'Llamar'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDeliver}>
          Entregar
        </Button>
      </div>
    </li>
  );
}
