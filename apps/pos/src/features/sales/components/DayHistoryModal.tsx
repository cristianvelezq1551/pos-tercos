'use client';

import type { Sale, SaleStatus } from '@pos-tercos/types';
import {
  Button,
  Dialog,
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
  { key: 'pago', label: 'Pendiente pago', match: (s) => s === 'PENDIENTE_PAGO' },
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

export function DayHistoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterKey, setFilterKey] = useState('todos');

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
    if (!open) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [open, refresh]);

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
    <Dialog
      open={open}
      onClose={onClose}
      title="Pedidos del día"
      description={`${sales.length} pedido${sales.length === 1 ? '' : 's'} hoy`}
      maxWidth="max-w-2xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-3">
        {/* Tags de filtro */}
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count = sales.filter((s) => f.match(s.status)).length;
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

        {slowCount > 0 ? (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm font-medium text-warning">
            ⚠ {slowCount} pedido{slowCount === 1 ? '' : 's'} llevan más de{' '}
            {SLOW_ORDER_THRESHOLD_MIN} min sin completarse.
          </p>
        ) : null}

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
          <ul className="divide-y divide-border">
            {visible.map((s) => (
              <HistoryRow key={s.id} sale={s} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function elapsedTone(minutes: number): string {
  if (minutes >= SLOW_ORDER_THRESHOLD_MIN) return 'text-destructive';
  if (minutes >= WARN_MIN) return 'text-warning';
  return 'text-success';
}

function HistoryRow({ sale }: { sale: Sale }) {
  const [reprint, setReprint] = useState<'idle' | 'pending' | 'ok' | 'error'>(
    'idle',
  );
  const active = isActive(sale.status);
  const mins = minutesSince(sale.paidAt ?? sale.createdAt);

  const handleReprint = async () => {
    setReprint('pending');
    try {
      await printReceipt(sale.id);
      setReprint('ok');
      setTimeout(() => setReprint('idle'), 2500);
    } catch {
      setReprint('error');
      setTimeout(() => setReprint('idle'), 2500);
    }
  };

  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <span className="w-12 shrink-0 font-display text-lg font-bold tabular-nums text-foreground">
        #{sale.receiptNumber}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {sale.customerName ??
            (sale.type === 'WEB_PICKUP' ? 'Pedido web' : 'Mostrador')}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(sale.createdAt, 'time-short')}
          {sale.paymentMethod ? ` · ${methodLabel(sale.paymentMethod)}` : ''}
          {active ? (
            <span className={cn('ml-1 font-semibold', elapsedTone(mins))}>
              · {mins} min
            </span>
          ) : null}
        </p>
      </div>
      <Money amount={sale.total} weight="semibold" className="shrink-0" />
      <StatusBadge
        status={sale.status}
        mapping={SALE_STATUS_MAPPING}
        className="shrink-0"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleReprint}
        disabled={reprint === 'pending'}
        title="Reimprimir recibo"
        className="shrink-0"
      >
        {reprint === 'pending'
          ? '…'
          : reprint === 'ok'
            ? '✓'
            : reprint === 'error'
              ? 'Error'
              : 'Recibo'}
      </Button>
    </li>
  );
}

function methodLabel(method: string): string {
  return method === 'CASH' ? 'Efectivo' : method === 'TRANSFER' ? 'Transferencia' : method;
}
