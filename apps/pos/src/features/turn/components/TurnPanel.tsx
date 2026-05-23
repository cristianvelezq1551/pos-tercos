'use client';

import { Button, Input } from '@pos-tercos/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReadyToCallOrder } from '@pos-tercos/types';
import {
  callManual,
  callSale,
  deliver,
  getDisplayState,
  getReadyToCall,
  resetTurn,
} from '../api/client';
import { playReadyChime } from '../lib/ready-chime';

const POLL_MS = 5000;
/** Cuántos llamados recientes mostrar para re-llamar. */
const RECENT_CALLED = 6;

/**
 * Gestor de turnos en 2 zonas (sin "Entregar"):
 *  - "Por llamar": listos que aún no se llamaron → botón Llamar. Al llamar,
 *    salen solos de esta zona.
 *  - "Llamados": los últimos re-llamables (por si el cliente no apareció).
 * Se auto-gestiona; el cajero da un solo toque por pedido.
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

  const pending = useMemo(
    () =>
      orders
        .filter((o) => o.calledAt === null)
        .sort((a, b) => a.readyAt.localeCompare(b.readyAt)),
    [orders],
  );
  const called = useMemo(
    () =>
      orders
        .filter((o) => o.calledAt !== null)
        .sort((a, b) => (b.calledAt ?? '').localeCompare(a.calledAt ?? ''))
        .slice(0, RECENT_CALLED),
    [orders],
  );

  // Campana cuando entra un pedido nuevo a "Por llamar" (la cocina marcó listo).
  // Así el cajero se entera aunque esté mirando el Historial, no solo Turnos.
  const prevPending = useRef<number | null>(null);
  useEffect(() => {
    const count = pending.length;
    if (prevPending.current !== null && count > prevPending.current) {
      playReadyChime();
    }
    prevPending.current = count;
  }, [pending.length]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
      <div className="shrink-0 rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
        <p className="caps text-[0.625rem] tracking-[0.3em] text-muted-foreground">
          Llamando ahora
        </p>
        <p className="mt-0.5 font-display text-5xl font-extrabold tabular leading-none text-foreground">
          #{currentTurn ?? '—'}
        </p>
      </div>

      {/* Por llamar */}
      <div className="flex items-center justify-between">
        <p className="caps text-[0.6875rem] tracking-[0.2em] text-muted-foreground">
          Por llamar
        </p>
        {pending.length > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold text-primary-foreground">
            {pending.length}
          </span>
        ) : null}
      </div>
      {pending.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
          Nada por llamar. Aparecen cuando la cocina marca un pedido listo.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.map((o) => (
            <ReadyRow
              key={o.saleId}
              order={o}
              busy={busy}
              onCall={() => void run(() => callSale(o.saleId))}
            />
          ))}
        </ul>
      )}

      {/* Llamados recientes (re-llamar) */}
      {called.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="caps text-[0.6875rem] tracking-[0.2em] text-muted-foreground">
            Llamados recientes
          </p>
          <ul className="space-y-1.5">
            {called.map((o) => (
              <CalledRow
                key={o.saleId}
                order={o}
                busy={busy}
                onRecall={() => void run(() => callSale(o.saleId))}
                onDeliver={() => void run(() => deliver(o.saleId))}
              />
            ))}
          </ul>
        </div>
      ) : null}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border pt-3">
        <p className="caps text-[0.625rem] tracking-[0.2em] text-muted-foreground">
          Llamar turno manual
        </p>
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
            className="flex-1"
          />
          <Button
            variant="secondary"
            disabled={busy || !draft}
            onClick={handleManual}
            className="shrink-0"
          >
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

function channelLabel(type: ReadyToCallOrder['type']): string {
  return type === 'WEB_PICKUP' ? 'Pickup' : 'Mostrador';
}

function itemsText(order: ReadyToCallOrder): string {
  return order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ');
}

function ReadyRow({
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

function CalledRow({
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
          {/* Info del pedido también acá: el cajero re-llama sin ir al historial. */}
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
