'use client';

import type { CortesiaRequest, CortesiaStatus } from '@pos-tercos/types';
import { Badge, Button, Card, EmptyState, Input, Money, cn, formatDate } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { approveCortesia, listCortesias, rejectCortesia } from '../api/client';

const TABS: { key: string; label: string; status?: CortesiaStatus }[] = [
  { key: 'PENDING', label: 'Sin revisar', status: 'PENDING' },
  { key: 'APPROVED', label: 'Autorizadas', status: 'APPROVED' },
  { key: 'REJECTED', label: 'Rechazadas', status: 'REJECTED' },
  { key: 'ALL', label: 'Todas' },
];

const STATUS_TONE: Record<CortesiaStatus, 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};
const STATUS_LABEL: Record<CortesiaStatus, string> = {
  PENDING: 'Sin revisar',
  APPROVED: 'Autorizada',
  REJECTED: 'Rechazada',
};

export function CortesiasPanel({ initial }: { initial: CortesiaRequest[] }) {
  const [tab, setTab] = useState('PENDING');
  const [rows, setRows] = useState<CortesiaRequest[]>(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (key: string) => {
    const status = TABS.find((t) => t.key === key)?.status;
    try {
      setRows(await listCortesias(status));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando solicitudes');
    }
  }, []);

  useEffect(() => {
    void refresh(tab);
  }, [tab, refresh]);

  const resolve = async (id: string, action: 'approve' | 'reject') => {
    const note = notes[id]?.trim() || undefined;
    setBusyId(id);
    try {
      if (action === 'approve') await approveCortesia(id, note);
      else await rejectCortesia(id, note);
      await refresh(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error resolviendo la cortesía');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              tab === t.key
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/40',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Sin cortesías en este filtro" size="sm" />
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <Card key={c.id} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {c.quantity}× {c.productName ?? 'Producto'}
                    {c.sizeName ? ` · ${c.sizeName}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.reason}</p>
                  <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                    {c.requestedByName ?? 'Cajero'} · {formatDate(c.createdAt, 'datetime')}
                    {c.resolvedByName ? ` · revisada por ${c.resolvedByName}` : ''}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
              </div>

              <div className="flex items-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground">
                <span>
                  Costo:{' '}
                  {c.costAmount !== null ? (
                    <Money amount={c.costAmount} className="text-xs" weight="semibold" />
                  ) : (
                    <span>s/d</span>
                  )}
                </span>
                <span>
                  Precio venta: <Money amount={c.salePrice} className="text-xs" />
                </span>
              </div>

              {c.status === 'PENDING' ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="text"
                    value={notes[c.id] ?? ''}
                    onChange={(e) => setNotes((p) => ({ ...p, [c.id]: e.target.value }))}
                    placeholder="Nota (opcional, sobre todo al rechazar)"
                    maxLength={200}
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
                    <Button size="sm" disabled={busyId === c.id} onClick={() => void resolve(c.id, 'approve')}>
                      {busyId === c.id ? '…' : 'Autorizar'}
                    </Button>
                  </span>
                </div>
              ) : c.resolverNote ? (
                <p className="text-[0.6875rem] text-muted-foreground">Nota: {c.resolverNote}</p>
              ) : null}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
