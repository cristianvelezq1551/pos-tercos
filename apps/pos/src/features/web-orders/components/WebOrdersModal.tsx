'use client';

import type { PublicWebOrder, Sale } from '@pos-tercos/types';
import { Button, Dialog, EmptyState, LoadingSkeleton, cn } from '@pos-tercos/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listSales } from '../../sales';
import { useKdsLiveRefresh } from '../hooks/useKdsLiveRefresh';
import { saleToPublicWebOrder } from '../lib/project';
import { FILTERS } from '../lib/order-filters';
import { ConfirmWebPaymentModal } from './ConfirmWebPaymentModal';
import { WebOrderCard } from './WebOrderCard';
import { startOfTodayIso } from '../../../lib/dates';
import { usePolling } from '../../../lib/use-polling';
import { getErrorMessage } from '../../../lib/errors';

const POLL_MS = 12_000;

/**
 * Pedidos web activos (pendientes de pago + pagados + en cocina). El cajero
 * confirma pagos, rechaza, y puede avanzar a "listo" cuando el cocinero está
 * ocupado. El "modo registro: no avisar" NO está siempre visible: aparece solo
 * al confirmar/marcar listo un pedido viejo (≥15 min), para no hacer ruido.
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
  const [confirming, setConfirming] = useState<PublicWebOrder | null>(null);
  const [filterKey, setFilterKey] = useState('pago');

  const refresh = useCallback(async () => {
    try {
      // Todos los pedidos web de hoy → permite el selector por estado con conteos.
      const all = await listSales({
        type: 'WEB_PICKUP',
        from: startOfTodayIso(),
        limit: 200,
      });
      all.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setOrders(all);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e, 'Error cargando pedidos web'));
    }
  }, []);

  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;
  const visible = useMemo(
    () => orders.filter((o) => filter.match(o.status)),
    [orders, filter],
  );
  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === 'PENDIENTE_PAGO').length,
    [orders],
  );

  // Tiempo real: mismo estado que el KDS (cuando cocina inicia/marca listo).
  useKdsLiveRefresh(wsToken, open, refresh);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [open, refresh]);
  usePolling(refresh, POLL_MS, { enabled: open, immediate: false });

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Pedidos web"
        description={`${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} por confirmar pago`}
        maxWidth="max-w-xl"
        footer={
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Selector por estado con conteos */}
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const count = orders.filter((o) => f.match(o.status)).length;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterKey(f.key)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    filterKey === f.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/40',
                  )}
                >
                  {f.label} ({count})
                </button>
              );
            })}
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
          ) : visible.length === 0 ? (
            <EmptyState
              title="Sin pedidos en este filtro"
              description="Cuando entre un pedido aparece aquí."
              size="sm"
            />
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((o) => (
                <li key={o.id} className="py-4 first:pt-0 last:pb-0">
                  <WebOrderCard
                    sale={o}
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
        onClose={() => setConfirming(null)}
        onConfirmed={() => {
          setConfirming(null);
          void refresh();
        }}
      />
    </>
  );
}
