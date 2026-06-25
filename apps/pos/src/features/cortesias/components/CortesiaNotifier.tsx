'use client';

import type { CortesiaRequest } from '@pos-tercos/types';
import { Button, cn } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../../../lib/use-polling';
import { ackCortesia, isUnseenResolved, listMyCortesias } from '../api/client';

const AUTO_DISMISS_MS = 7_000;

/**
 * Aviso proactivo al cajero cuando el dueño resuelve una cortesía. Polling
 * (~15s) — sin socket. Autorizada: toast verde que se va solo (auto-acuse).
 * Observada: toast rojo que queda hasta que el cajero toca "Entendido".
 * Montado en el layout → avisa en cualquier pantalla del POS.
 */
export function CortesiaNotifier() {
  const [items, setItems] = useState<CortesiaRequest[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const all = await listMyCortesias();
      setItems(all.filter(isUnseenResolved));
    } catch {
      // sin red: no romper.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  usePolling(refresh, 15_000, { enabled: true, immediate: false });

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
    void ackCortesia(id).catch(() => undefined);
  }, []);

  const visible = items.filter((c) => !dismissed.has(c.id));

  // Auto-acuse de las autorizadas tras unos segundos (no requieren acción).
  const approvedKey = visible
    .filter((c) => c.status === 'APPROVED')
    .map((c) => c.id)
    .join(',');
  useEffect(() => {
    if (!approvedKey) return;
    const t = setTimeout(() => approvedKey.split(',').forEach((id) => dismiss(id)), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [approvedKey, dismiss]);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      {visible.map((c) => {
        const approved = c.status === 'APPROVED';
        return (
          <div
            key={c.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-lg border px-3 py-2.5 shadow-lg',
              approved
                ? 'border-success-border bg-success-bg text-success'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {approved ? '✓ Cortesía autorizada' : '⚠ Cortesía observada'}
                </p>
                <p className="mt-0.5 text-xs opacity-90">
                  {c.quantity}× {c.productName ?? 'Producto'}
                  {c.sizeName ? ` · ${c.sizeName}` : ''}
                </p>
                {!approved && c.resolverNote ? (
                  <p className="mt-1 text-[0.6875rem] opacity-90">“{c.resolverNote}”</p>
                ) : null}
              </div>
              {!approved ? (
                <Button size="sm" variant="outline" onClick={() => dismiss(c.id)}>
                  Entendido
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={() => dismiss(c.id)}
                  className="text-sm font-semibold opacity-70 hover:opacity-100"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
