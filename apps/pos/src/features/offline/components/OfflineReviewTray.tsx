'use client';

import { Button, Dialog, formatCop } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';
import { offlineDb } from '../lib/db';
import { drainOfflineQueue } from '../lib/sync-engine';
import type { OfflineSale } from '../lib/types';

const STATUS_LABEL: Record<OfflineSale['status'], string> = {
  queued: 'En cola',
  syncing: 'Sincronizando…',
  failed: 'Falló',
  synced: 'OK',
};

/**
 * Bandeja de revisión de ventas offline sin sincronizar (Fase B.5). Permite
 * reintentar la sincronización y, como último recurso, descartar una venta que
 * falla de forma permanente (con confirmación: la plata quedó en el cajón pero
 * la venta NO se registrará → descuadre que el dueño debe conciliar).
 */
export function OfflineReviewTray({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [sales, setSales] = useState<OfflineSale[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  const reload = (): void => {
    void offlineDb.listUnsynced().then(setSales);
  };

  useEffect(() => {
    if (open) {
      reload();
      setConfirmDiscard(null);
    }
  }, [open]);

  const retry = async (): Promise<void> => {
    setBusy(true);
    try {
      await drainOfflineQueue(onChanged);
    } finally {
      setBusy(false);
      reload();
      onChanged();
    }
  };

  const discard = async (localId: string): Promise<void> => {
    await offlineDb.deleteSale(localId);
    setConfirmDiscard(null);
    reload();
    onChanged();
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Ventas offline por sincronizar"
      description="Estas ventas se cobraron sin conexión y todavía no llegaron al backend."
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cerrar
          </Button>
          <Button onClick={retry} disabled={busy || sales.length === 0}>
            {busy ? 'Reintentando…' : 'Reintentar sincronización'}
          </Button>
        </>
      }
    >
      {sales.length === 0 ? (
        <p className="rounded-md border border-success-border bg-success-bg px-3 py-3 text-sm text-success">
          No hay ventas pendientes — todo sincronizado. ✅
        </p>
      ) : (
        <ul className="space-y-2">
          {sales.map((s) => (
            <li
              key={s.localId}
              className="rounded-lg border border-border bg-card p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {s.provisionalNumber} · {formatCop(s.payload.total)}
                </span>
                <span
                  className={
                    s.status === 'failed'
                      ? 'text-xs font-semibold text-destructive'
                      : 'text-xs font-medium text-muted-foreground'
                  }
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.payment.method} · {new Date(s.soldOfflineAt).toLocaleString('es-CO')}
              </p>
              {s.status === 'failed' && s.failReason ? (
                <p className="mt-1 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  {s.failReason}
                </p>
              ) : null}

              {s.status === 'failed' ? (
                confirmDiscard === s.localId ? (
                  <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2">
                    <p className="text-xs text-destructive">
                      La plata quedó en el cajón pero esta venta <strong>NO se registrará</strong>.
                      Va a quedar un descuadre que el dueño debe conciliar. ¿Descartar igual?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void discard(s.localId)}
                        disabled={busy}
                      >
                        Sí, descartar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDiscard(null)}
                        disabled={busy}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(s.localId)}
                    disabled={busy}
                    className="mt-2 text-xs font-medium text-destructive underline-offset-2 hover:underline"
                  >
                    Descartar (último recurso)
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
