'use client';

import { Button, cn } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { ackCortesia, isUnseenResolved } from '../api/client';
import { useCortesiaWatch } from './CortesiaWatchProvider';

const AUTO_DISMISS_MS = 7_000;

/**
 * Aviso al cajero cuando el dueño resuelve una cortesía. Lee del watcher
 * compartido (no poolea por su cuenta). Autorizada: toast verde que se va solo
 * (auto-acuse). Observada: toast rojo que queda hasta "Entendido".
 */
export function CortesiaNotifier() {
  const { items, refresh } = useCortesiaWatch();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => new Set(prev).add(id));
      void ackCortesia(id)
        .then(refresh)
        .catch(() => undefined);
    },
    [refresh],
  );

  const visible = items.filter((c) => isUnseenResolved(c) && !dismissed.has(c.id));

  // Auto-acuse de las autorizadas (no requieren acción del cajero).
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
    <div className="pointer-events-none fixed bottom-4 left-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
      {visible.map((c) => {
        const approved = c.status === 'APPROVED';
        return (
          <div
            key={c.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-lg border-l-4 bg-card px-3 py-2.5 shadow-xl ring-1 ring-border',
              approved ? 'border-l-success' : 'border-l-destructive',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-bold',
                    approved ? 'text-success' : 'text-destructive',
                  )}
                >
                  {approved ? '✓ Cortesía autorizada' : '✕ Cortesía rechazada'}
                </p>
                <p className="mt-0.5 text-xs text-foreground">
                  {c.quantity}× {c.productName ?? 'Producto'}
                  {c.sizeName ? ` · ${c.sizeName}` : ''}
                </p>
                {!approved && c.resolverNote ? (
                  <p className="mt-1 text-[0.6875rem] text-muted-foreground">“{c.resolverNote}”</p>
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
                  className="text-sm font-semibold text-muted-foreground hover:text-foreground"
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
