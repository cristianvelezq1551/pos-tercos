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
import type { SaleStatus } from '@pos-tercos/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SALE_STATUS_MAPPING, listSales } from '../../sales';
import { cancelWebOrder, markWebOrderReady } from '../api';
import { useKdsLiveRefresh } from '../hooks/useKdsLiveRefresh';
import { saleToPublicWebOrder } from '../lib/project';
import { ConfirmWebPaymentModal } from './ConfirmWebPaymentModal';

const POLL_MS = 12_000;
/** Solo a partir de este tiempo ofrecemos "no avisar" (actualización retroactiva). */
const STALE_MIN = 15;

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

interface WebFilter {
  key: string;
  label: string;
  match: (s: SaleStatus) => boolean;
}

const FILTERS: WebFilter[] = [
  { key: 'pago', label: 'Pend. pago', match: (s) => s === 'PENDIENTE_PAGO' },
  { key: 'cocina', label: 'En cocina', match: (s) => s === 'PAGADO' || s === 'EN_PREPARACION' },
  { key: 'listos', label: 'Listos', match: (s) => s === 'LISTO_DESPACHO' },
  { key: 'entregados', label: 'Entregados', match: (s) => s === 'ENTREGADO' },
  { key: 'todos', label: 'Todos', match: () => true },
];

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
      setError(e instanceof Error ? e.message : 'Error cargando pedidos web');
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
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [open, refresh]);

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
                  <WebOrderRow
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

function WebOrderRow({
  sale,
  onConfirm,
  onChanged,
}: {
  sale: Sale;
  onConfirm: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [silent, setSilent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // "No avisar" solo para pedidos viejos (≥15 min en su estado actual).
  const stale = minutesSince(sale.paidAt ?? sale.createdAt) >= STALE_MIN;

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
        ) : sale.status === 'PAGADO' ? (
          // Pagado, en cola de cocina. El cajero NO inicia pedidos (eso es del
          // KDS); solo espera a que la cocina lo tome.
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
            En cola de cocina — la cocina lo inicia
          </p>
        ) : sale.status === 'EN_PREPARACION' ? (
          // Solo se marca listo cuando ya está iniciado en cocina.
          <div className="space-y-2">
            {stale ? (
              <div className="rounded-lg border border-warning-border bg-warning-bg/40 px-3 py-2">
                <Checkbox
                  checked={silent}
                  onChange={(e) => setSilent(e.target.checked)}
                  label="No avisar al cliente"
                  description="Pedido viejo (+15 min) — actualización retroactiva sin WhatsApp."
                />
              </div>
            ) : null}
            <Button
              variant="success"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => run(() => markWebOrderReady(sale.id, stale && silent))}
            >
              {busy ? 'Marcando…' : 'Marcar listo'}
            </Button>
          </div>
        ) : null}
      </div>
      {err ? (
        <p className="mt-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[0.6875rem] text-destructive">
          {err}
        </p>
      ) : null}
    </div>
  );
}
