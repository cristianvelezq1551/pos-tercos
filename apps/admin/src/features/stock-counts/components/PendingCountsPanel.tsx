'use client';

import type { StockCount } from '@pos-tercos/types';
import { Badge, Button, Card, EmptyState, Input, Quantity, formatDate } from '@pos-tercos/ui';
import { useState } from 'react';
import { approveCount, fetchPendingCounts, rejectCount } from '../api/client';
import { getErrorMessage } from '../../../lib/errors';

/**
 * Conteos del cocinero pendientes de aprobación (#7). El conteo es CIEGO para el
 * cocinero, pero el admin sí ve lo esperado (ledger) y la diferencia detectada.
 * Aprobar aplica el ajuste de stock; rechazar lo descarta.
 */
export function PendingCountsPanel({ initial }: { initial: StockCount[] }) {
  const [rows, setRows] = useState<StockCount[]>(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    const note = notes[id]?.trim() || undefined;
    setBusyId(id);
    setError(null);
    try {
      if (action === 'approve') await approveCount(id, note);
      else await rejectCount(id, note);
      setRows(await fetchPendingCounts());
    } catch (e) {
      setError(getErrorMessage(e, 'Error resolviendo el conteo'));
    } finally {
      setBusyId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Sin conteos por aprobar"
        description="Cuando el cocinero registre un conteo físico, aparecerá aquí para que lo valides."
        size="sm"
      />
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((c) => {
          const diff = c.difference;
          const diffTone = Math.abs(diff) < 0.0001 ? 'neutral' : diff < 0 ? 'danger' : 'success';
          return (
            <Card key={c.id} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.userName ?? 'Cocinero'} · {formatDate(c.createdAt, 'datetime')}
                  </p>
                </div>
                <Badge tone={diffTone as 'neutral' | 'danger' | 'success'}>
                  Dif. {diff >= 0 ? '+' : ''}
                  <Quantity value={diff} maxDecimals={4} className="text-current" />
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4 border-t border-border pt-2 text-xs text-muted-foreground">
                <span>
                  Contó:{' '}
                  <b className="text-foreground">
                    <Quantity
                      value={c.countedQty}
                      unit={c.unit}
                      maxDecimals={4}
                      className="text-current"
                    />
                  </b>
                </span>
                <span>
                  Sistema: <Quantity value={c.ledgerQty} maxDecimals={4} className="text-current" />
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  type="text"
                  value={notes[c.id] ?? ''}
                  onChange={(e) => setNotes((p) => ({ ...p, [c.id]: e.target.value }))}
                  placeholder="Nota (opcional)"
                  maxLength={300}
                  className="flex-1"
                />
                <span className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => void resolve(c.id, 'reject')}
                  >
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === c.id}
                    onClick={() => void resolve(c.id, 'approve')}
                  >
                    {busyId === c.id ? '…' : 'Aprobar y ajustar'}
                  </Button>
                </span>
              </div>
            </Card>
          );
        })}
      </ul>
    </div>
  );
}
