'use client';

import type { Sale, SaleStatus } from '@pos-tercos/types';
import {
  Button,
  EmptyState,
  LoadingSkeleton,
  Money,
  StatusBadge,
  cn,
  formatDate,
} from '@pos-tercos/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listSales } from '../api/list';
import { printReceipt } from '../api/print';
import { markKitchenReady } from '../api/kitchen';
import { ChangePaymentModal } from './ChangePaymentModal';
import { EditSaleModal } from './EditSaleModal';
import { usePolling } from '../../../lib/use-polling';
import {
  ACTIVE_SALE_STATUSES,
  SALE_STATUS_MAPPING,
  SLOW_ORDER_THRESHOLD_MIN,
} from '../lib/sale-status-mapping';

const POLL_MS = 8_000;
const WARN_MIN = 7;

interface Filter {
  key: string;
  label: string;
  match: (s: SaleStatus) => boolean;
}

const FILTERS: Filter[] = [
  { key: 'todos', label: 'Todos', match: () => true },
  { key: 'pago', label: 'Pend. pago', match: (s) => s === 'PENDIENTE_PAGO' },
  {
    key: 'cocina',
    label: 'En cocina',
    match: (s) => s === 'PAGADO' || s === 'EN_PREPARACION',
  },
  { key: 'listos', label: 'Listos', match: (s) => s === 'LISTO_DESPACHO' },
  { key: 'entregados', label: 'Entregados', match: (s) => s === 'ENTREGADO' },
  {
    key: 'anulados',
    label: 'Anulados',
    match: (s) =>
      s === 'VOID' || s === 'CANCELADO_NO_PAGO' || s === 'CANCELADO_SIN_REEMBOLSO',
  },
];

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function isActive(s: SaleStatus): boolean {
  return ACTIVE_SALE_STATUSES.includes(s);
}

/**
 * Contenido del historial del día (sin header propio). Se usa inline en la
 * vista del cajero y dentro del modal de la topbar. `active` controla el
 * polling.
 */
export function DayHistoryPanel({ active = true }: { active?: boolean }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState('todos');
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [payingSale, setPayingSale] = useState<Sale | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listSales({ from: startOfTodayIso(), limit: 200 });
      const sorted = [...data].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setSales(sorted);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el historial');
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [active, refresh]);
  usePolling(refresh, POLL_MS, { enabled: active, immediate: false });

  const filter = FILTERS.find((f) => f.key === filterKey) ?? FILTERS[0]!;
  const visible = useMemo(
    () => sales.filter((s) => filter.match(s.status)),
    [sales, filter],
  );
  const slowCount = useMemo(
    () =>
      sales.filter(
        (s) =>
          isActive(s.status) &&
          minutesSince(s.paidAt ?? s.createdAt) >= SLOW_ORDER_THRESHOLD_MIN,
      ).length,
    [sales],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = sales.filter((s) => f.match(s.status)).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterKey(f.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors',
                filterKey === f.key
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/40',
              )}
            >
              <span>{f.label}</span>
              <span
                className={cn(
                  'tabular-nums',
                  filterKey === f.key ? 'text-primary' : 'text-muted-foreground/70',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {slowCount > 0 ? (
        <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
          ⚠ {slowCount} pedido{slowCount === 1 ? '' : 's'} llevan más de{' '}
          {SLOW_ORDER_THRESHOLD_MIN} min sin completarse.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {loading && sales.length === 0 ? (
          <LoadingSkeleton shape="table-row" count={6} />
        ) : error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : visible.length === 0 ? (
          <EmptyState title="Sin pedidos en este filtro" size="sm" />
        ) : (
          <ul className="space-y-2">
            {visible.map((s) => (
              <HistoryRow
                key={s.id}
                sale={s}
                onChanged={refresh}
                onEdit={() => setEditingSale(s)}
                onChangePayment={() => setPayingSale(s)}
              />
            ))}
          </ul>
        )}
      </div>

      <EditSaleModal
        sale={editingSale}
        open={editingSale !== null}
        onClose={() => setEditingSale(null)}
        onSaved={() => void refresh()}
      />
      <ChangePaymentModal
        sale={payingSale}
        open={payingSale !== null}
        onClose={() => setPayingSale(null)}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

/** Pedido vivo en el local: aún se puede corregir. */
const EDITABLE_STATUSES = new Set<SaleStatus>(['PAGADO', 'EN_PREPARACION', 'LISTO_DESPACHO']);
const PAYMENT_CHANGE_STATUSES = new Set<SaleStatus>([
  'PAGADO',
  'EN_PREPARACION',
  'LISTO_DESPACHO',
  'ENTREGADO',
]);

function elapsedTone(minutes: number): string {
  if (minutes >= SLOW_ORDER_THRESHOLD_MIN) return 'text-destructive';
  if (minutes >= WARN_MIN) return 'text-warning';
  return 'text-success';
}

function HistoryRow({
  sale,
  onChanged,
  onEdit,
  onChangePayment,
}: {
  sale: Sale;
  onChanged: () => Promise<void> | void;
  onEdit: () => void;
  onChangePayment: () => void;
}) {
  const [reprint, setReprint] = useState<'idle' | 'pending' | 'ok' | 'error'>(
    'idle',
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = isActive(sale.status);
  const mins = minutesSince(sale.paidAt ?? sale.createdAt);
  const items = sale.items ?? [];

  const runKitchen = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleReprint = async () => {
    setReprint('pending');
    try {
      await printReceipt(sale.id, { fallback: sale, reprint: true });
      setReprint('ok');
      setTimeout(() => setReprint('idle'), 2500);
    } catch {
      setReprint('error');
      setTimeout(() => setReprint('idle'), 2500);
    }
  };

  return (
    <li className="rounded-lg border border-border bg-card p-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Turno = el número con el que se llama al cliente (igual que el
                turnero). El recibo va abajo como referencia de caja. */}
            <span className="shrink-0 font-display text-base font-bold tabular-nums text-foreground">
              {sale.turnNumber !== null ? `Turno ${sale.turnNumber}` : 'Sin turno'}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {sale.customerName ??
                (sale.type === 'WEB_PICKUP' ? 'Pedido web' : 'Mostrador')}
            </span>
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            Recibo #{sale.receiptNumber} · {formatDate(sale.createdAt, 'time-short')}
            {sale.paymentMethod ? ` · ${methodLabel(sale.paymentMethod)}` : ''}
            {` · ${items.length} ít.`}
            {active ? (
              <span className={cn('ml-1 font-semibold', elapsedTone(mins))}>
                · {mins} min
              </span>
            ) : null}
            <span className="ml-1 text-muted-foreground">{open ? '▲' : '▼'}</span>
          </p>
        </div>
        <Money amount={sale.total} weight="semibold" className="shrink-0" />
      </button>

      <div className="mt-2 flex items-center justify-between gap-2">
        <StatusBadge status={sale.status} mapping={SALE_STATUS_MAPPING} />
        <div className="flex items-center gap-1.5">
          {EDITABLE_STATUSES.has(sale.status) ? (
            <Button variant="outline" size="sm" onClick={onEdit} title="Editar productos del pedido">
              Editar
            </Button>
          ) : null}
          {PAYMENT_CHANGE_STATUSES.has(sale.status) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onChangePayment}
              title="Cambiar método de pago registrado"
            >
              Pago
            </Button>
          ) : null}
          {/* El cajero NO inicia pedidos (eso es del KDS); solo puede marcar
              listo cuando la cocina ya lo está preparando. */}
          {sale.status === 'EN_PREPARACION' ? (
            <Button
              variant="success"
              size="sm"
              disabled={busy}
              onClick={() => void runKitchen(() => markKitchenReady(sale.id))}
              title="Marcar listo"
            >
              {busy ? '…' : 'Listo'}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReprint}
            disabled={reprint === 'pending'}
            title="Reimprimir recibo"
          >
            {reprint === 'pending'
              ? '…'
              : reprint === 'ok'
                ? '✓'
                : reprint === 'error'
                  ? 'Error'
                  : 'Recibo'}
          </Button>
        </div>
      </div>

      {sale.status === 'VOID' && sale.voidReason ? (
        <p className="mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[0.6875rem] leading-snug text-destructive">
          <span className="font-semibold">Motivo de anulación:</span> {sale.voidReason}
        </p>
      ) : null}

      {open ? (
        <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2">
          {sale.customerPhone ? (
            <p className="text-[0.6875rem] text-muted-foreground">
              Tel: {sale.customerPhone}
            </p>
          ) : null}
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin ítems.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.id} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {it.quantity}× {it.productName ?? 'Producto'}
                      {it.sizeName ? ` · ${it.sizeName}` : ''}
                    </span>
                    <Money amount={it.lineTotal} className="shrink-0 text-xs" />
                  </div>
                  {it.modifiers.length > 0 ? (
                    <p className="text-[0.625rem] text-muted-foreground">
                      + {it.modifiers.map((m) => m.name).join(', ')}
                    </p>
                  ) : null}
                  {it.notes ? (
                    <p className="text-[0.625rem] italic text-muted-foreground">
                      “{it.notes}”
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {sale.discountTotal > 0 ? (
            <p className="border-t border-border pt-1 text-[0.6875rem] text-muted-foreground">
              Descuento: −{Math.round(sale.discountTotal).toLocaleString('es-CO')}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function methodLabel(method: string): string {
  return method === 'CASH' ? 'Efectivo' : method === 'TRANSFER' ? 'Transferencia' : method;
}
