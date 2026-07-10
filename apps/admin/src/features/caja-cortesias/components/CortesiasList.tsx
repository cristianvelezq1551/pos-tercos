'use client';

import { Button, EmptyState, Money, cn, formatDate } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { ackCortesia, isUnseenObserved } from '../api/client';
import { CORTESIA_STATUS_LABEL, CORTESIA_STATUS_TONE } from '../lib/status';
import { useCortesiaWatch } from './CortesiaWatchProvider';

/** Cortesías del cajero con su estado. Lee del watcher; refresca al abrir. */
export function CortesiasList({ active }: { active: boolean }) {
  const { items: rows, refresh } = useCortesiaWatch();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  const ack = async (id: string) => {
    setBusyId(id);
    try {
      await ackCortesia(id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return <EmptyState title="Sin cortesías registradas hoy" size="sm" />;
  }

  return (
    <ul className="space-y-2">
      {rows.map((c) => {
        const novelty = isUnseenObserved(c);
        return (
          <li
            key={c.id}
            className={cn(
              'rounded-lg border bg-card p-2.5',
              novelty ? 'border-destructive/50 bg-destructive/5' : 'border-border',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {c.quantity}× {c.productName ?? 'Producto'}
                  {c.sizeName ? ` · ${c.sizeName}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.reason}</p>
                <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                  {formatDate(c.createdAt, 'time-short')}
                  {c.salePrice > 0 ? (
                    <>
                      {' · '}
                      <Money amount={c.salePrice} className="text-[0.6875rem]" />
                    </>
                  ) : null}
                </p>
              </div>
              <span className={cn('shrink-0 text-xs font-semibold', CORTESIA_STATUS_TONE[c.status])}>
                {CORTESIA_STATUS_LABEL[c.status]}
              </span>
            </div>

            {c.status === 'REJECTED' && c.resolverNote ? (
              <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[0.6875rem] leading-snug text-destructive">
                <span className="font-semibold">Motivo del rechazo:</span> {c.resolverNote}
              </p>
            ) : null}

            {novelty ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[0.6875rem] font-medium text-destructive">
                  El dueño rechazó esta cortesía.
                </span>
                <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => void ack(c.id)}>
                  {busyId === c.id ? '…' : 'Marcar visto'}
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
