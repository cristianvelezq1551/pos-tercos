'use client';

import type { PublicWebOrder, Sale } from '@pos-tercos/types';
import {
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  LoadingSkeleton,
  Money,
  StatusBadge,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { ACTIVE_SALE_STATUSES, SALE_STATUS_MAPPING, listSales } from '../../sales';
import { cancelWebOrder, markWebOrderReady, startWebOrder } from '../api';
import { useKdsLiveRefresh } from '../hooks/useKdsLiveRefresh';
import { saleToPublicWebOrder } from '../lib/project';
import { ConfirmWebPaymentModal } from './ConfirmWebPaymentModal';

const POLL_MS = 12_000;

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

/** Color del tiempo: verde <7 min, ámbar 7-10, rojo >10 (igual que el KDS). */
function elapsedTone(sale: Sale): string {
  const m = minutesSince(sale.paidAt ?? sale.createdAt);
  if (m >= 10) return 'text-destructive';
  if (m >= 7) return 'text-warning';
  return 'text-success';
}

/**
 * Pedidos web activos (pendientes de pago + pagados + en cocina). El cajero
 * confirma pagos, rechaza, y puede avanzar a "listo" cuando el cocinero está
 * ocupado. "Modo registro" actualiza sin avisar al cliente (offline retroactivo).
 * Polling REST: resiliente a caídas de conexión (se recupera al volver).
 */
export function WebOrdersModal({
  open,
  onClose,
  wsToken,
}: {
  open: boolean;
  onClose: () => void;
  wsToken: string | null;
}) {
  const [orders, setOrders] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [silent, setSilent] = useState(false);
  const [confirming, setConfirming] = useState<PublicWebOrder | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await listSales({ type: 'WEB_PICKUP', limit: 100 });
      const active = all
        .filter((s) => ACTIVE_SALE_STATUSES.includes(s.status))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      setOrders(active);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando pedidos web');
    }
  }, []);

  // Tiempo real: mismo estado que el KDS (cuando cocina inicia/marca listo).
  useKdsLiveRefresh(wsToken, open, refresh);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [open, refresh]);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Pedidos web"
        description={`${orders.length} activo${orders.length === 1 ? '' : 's'}`}
        maxWidth="max-w-xl"
        footer={
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-warning-border bg-warning-bg/40 px-3 py-2.5">
            <Checkbox
              checked={silent}
              onChange={(e) => setSilent(e.target.checked)}
              label="Modo registro: no avisar al cliente"
              description="Para actualizar pedidos viejos (ej. tras estar sin internet) sin mandarles WhatsApp."
            />
          </div>

          {loading && orders.length === 0 ? (
            <LoadingSkeleton shape="table-row" count={3} />
          ) : error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : orders.length === 0 ? (
            <EmptyState
              title="Sin pedidos web activos"
              description="Cuando entre un pedido aparece acá."
              size="sm"
            />
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id} className="py-4 first:pt-0 last:pb-0">
                  <WebOrderRow
                    sale={o}
                    silent={silent}
                    onConfirm={() => {
                      const projected = saleToPublicWebOrder(o);
                      if (projected) setConfirming(projected);
                    }}
                    onChanged={refresh}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>

      <ConfirmWebPaymentModal
        order={confirming}
        open={confirming !== null}
        silent={silent}
        onClose={() => setConfirming(null)}
        onConfirmed={() => {
          setConfirming(null);
          void refresh();
        }}
      />
    </>
  );
}

function WebOrderRow({
  sale,
  silent,
  onConfirm,
  onChanged,
}: {
  sale: Sale;
  silent: boolean;
  onConfirm: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          #{sale.receiptNumber}
        </span>
        <StatusBadge status={sale.status} mapping={SALE_STATUS_MAPPING} />
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {sale.customerName ?? 'Pedido web'}
      </p>
      <p className="text-xs text-muted-foreground">
        {sale.customerPhone ?? ''} · {formatDate(sale.createdAt, 'time-short')}
        <span className={cn('ml-1 font-semibold', elapsedTone(sale))}>
          · {minutesSince(sale.paidAt ?? sale.createdAt)} min
        </span>
      </p>
      <Money amount={sale.total} size="lg" weight="bold" className="mt-2" />

      <div className="mt-3">
        {sale.status === 'PENDIENTE_PAGO' ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="success" size="sm" onClick={onConfirm} disabled={busy}>
              Confirmar pago
            </Button>
            {confirmReject ? (
              <div className="flex gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => run(() => cancelWebOrder(sale.id))}
                >
                  {busy ? '…' : 'Sí, rechazar'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmReject(false)}
                >
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmReject(true)}
              >
                Rechazar
              </Button>
            )}
          </div>
        ) : (
          <Button
            variant="success"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() =>
              run(async () => {
                // El cajero solo marca listo. Si aún no inició en cocina,
                // lo arranca y lo marca listo de una.
                if (sale.status === 'PAGADO') await startWebOrder(sale.id);
                await markWebOrderReady(sale.id, silent);
              })
            }
          >
            {busy ? 'Marcando…' : 'Marcar listo'}
          </Button>
        )}
      </div>
      {err ? (
        <p className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[0.6875rem] text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
}
