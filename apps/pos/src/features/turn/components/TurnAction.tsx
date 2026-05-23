'use client';

import { Button, Dialog, Input } from '@pos-tercos/ui';
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

export function TurnAction() {
  const [open, setOpen] = useState(false);
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
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

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
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="Turnos: llamar pedidos listos a la pantalla pública"
      >
        Turnos · #{currentTurn ?? '—'}
        {pendingCount > 0 ? (
          <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold text-primary-foreground">
            {pendingCount}
          </span>
        ) : null}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Turnos en pantalla"
        description="Llama a la pantalla pública los pedidos que la cocina marcó listos."
        maxWidth="max-w-lg"
      >
        <div className="space-y-5 px-6 py-5">
          <div className="rounded-2xl border border-border bg-card px-5 py-5 text-center">
            <p className="caps text-[0.625rem] tracking-[0.3em] text-muted-foreground">
              Llamando ahora
            </p>
            <p className="mt-1 font-display text-6xl font-extrabold tabular text-foreground">
              #{currentTurn ?? '—'}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="caps text-[0.6875rem] tracking-[0.2em] text-muted-foreground">
                Listos por llamar ({orders.length})
              </p>
            </div>
            {orders.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
                No hay pedidos listos. Aparecen cuando la cocina los marca listos.
              </p>
            ) : (
              <ul className="space-y-2">
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
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <label className="caps text-[0.6875rem] tracking-[0.2em] text-muted-foreground">
              Llamar manual (desfase)
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                placeholder="Ej: 42"
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
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
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
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <span className="font-display text-2xl font-extrabold tabular text-foreground">
        #{order.turnNumber}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {order.customerName ?? channel}
          <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase text-muted-foreground">
            {channel}
          </span>
        </p>
        {itemsText ? (
          <p className="truncate text-xs text-muted-foreground">{itemsText}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          size="sm"
          variant={alreadyCalled ? 'outline' : 'default'}
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
