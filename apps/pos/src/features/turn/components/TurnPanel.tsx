'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ReadyToCallOrder } from '@pos-tercos/types';
import { usePolling } from '../../../lib/use-polling';
import { getErrorMessage } from '../../../lib/errors';
import {
  callManual,
  callSale,
  deliver,
  getDisplayState,
  getReadyToCall,
  resetTurn,
} from '../api/client';
import { CalledRow, ReadyRow } from './TurnQueueRows';
import { ManualCallSection } from './ManualCallSection';

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

  usePolling(refresh, POLL_MS, { enabled: active });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(getErrorMessage(e, 'Error'));
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

  // La campana de "pedido listo" es GLOBAL (ReadyChimeWatcher en el layout)
  // — acá solo se muestra la cola.

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

      <ManualCallSection
        draft={draft}
        busy={busy}
        onDraftChange={setDraft}
        onSubmit={handleManual}
        onReset={() => void run(resetTurn)}
      />

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
