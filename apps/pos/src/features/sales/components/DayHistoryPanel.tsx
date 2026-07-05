'use client';

import type { Sale } from '@pos-tercos/types';
import { EmptyState, LoadingSkeleton, cn } from '@pos-tercos/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listSales } from '../api/list';
import { printReceipt } from '../api/print';
import { useFacturaPrint } from '../hooks/useFacturaPrint';
import { logError } from '../../../lib/client-log';
import { ChangePaymentModal } from './ChangePaymentModal';
import { EditSaleModal } from './EditSaleModal';
import { RefundModal } from './RefundModal';
import { HistoryRow } from './HistoryRow';
import { CortesiasList, useUnseenCortesias } from '../../cortesias';

const CORTESIAS_KEY = '__cortesias__';
import { startOfTodayIso } from '../../../lib/dates';
import { usePolling } from '../../../lib/use-polling';
import { getErrorMessage } from '../../../lib/errors';
import { SLOW_ORDER_THRESHOLD_MIN } from '../lib/sale-status-mapping';
import {
  HISTORY_FILTERS,
  isActiveSale,
  minutesSince,
} from '../lib/history-filters';

const POLL_MS = 8_000;

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
  const [refundingSale, setRefundingSale] = useState<Sale | null>(null);
  const unseenCortesias = useUnseenCortesias();
  const cortesiasView = filterKey === CORTESIAS_KEY;
  const { requestFactura, facturaModal } = useFacturaPrint();

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
      setError(getErrorMessage(e, 'Error cargando el historial'));
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [active, refresh]);
  usePolling(refresh, POLL_MS, { enabled: active, immediate: false });

  // Tras editar: la comanda corregida ya se reimprimió (en EditSaleModal). La
  // FACTURA corregida se imprime igual que en el cobro — modal si comparte
  // impresora con la comanda, directo si no.
  const handleEdited = (updated: Sale) => {
    void refresh();
    requestFactura({
      receiptNumber: updated.receiptNumber,
      total: updated.total,
      print: () =>
        void printReceipt(updated.id, { fallback: updated, reprint: true }).catch((e) =>
          logError('print-factura-edit', e, { saleId: updated.id }),
        ),
    });
  };

  const filter =
    HISTORY_FILTERS.find((f) => f.key === filterKey) ?? HISTORY_FILTERS[0]!;
  const visible = useMemo(
    () => sales.filter((s) => filter.match(s.status)),
    [sales, filter],
  );
  const slowCount = useMemo(
    () =>
      sales.filter(
        (s) =>
          isActiveSale(s.status) &&
          minutesSince(s.paidAt ?? s.createdAt) >= SLOW_ORDER_THRESHOLD_MIN,
      ).length,
    [sales],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {HISTORY_FILTERS.map((f) => {
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
        <button
          type="button"
          onClick={() => setFilterKey(CORTESIAS_KEY)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors',
            cortesiasView
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted/40',
          )}
        >
          <span>Cortesías</span>
          {unseenCortesias > 0 ? (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-bold text-destructive-foreground">
              {unseenCortesias}
            </span>
          ) : null}
        </button>
      </div>

      {slowCount > 0 && !cortesiasView ? (
        <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
          ⚠ {slowCount} pedido{slowCount === 1 ? '' : 's'} llevan más de{' '}
          {SLOW_ORDER_THRESHOLD_MIN} min sin completarse.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {cortesiasView ? (
          <CortesiasList active={active} />
        ) : loading && sales.length === 0 ? (
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
                onRefund={() => setRefundingSale(s)}
              />
            ))}
          </ul>
        )}
      </div>

      <EditSaleModal
        sale={editingSale}
        open={editingSale !== null}
        onClose={() => setEditingSale(null)}
        onSaved={handleEdited}
      />
      {facturaModal}
      <ChangePaymentModal
        sale={payingSale}
        open={payingSale !== null}
        onClose={() => setPayingSale(null)}
        onSaved={() => void refresh()}
      />
      <RefundModal
        sale={refundingSale}
        open={refundingSale !== null}
        onClose={() => setRefundingSale(null)}
        onRefunded={() => void refresh()}
      />
    </div>
  );
}
