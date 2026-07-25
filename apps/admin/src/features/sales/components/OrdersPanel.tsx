'use client';

import type { Promotion, Sale } from '@pos-tercos/types';
import { ConfirmDialog, StatusBadge, Money } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { logError } from '../../../lib/client-log';
import { startOfTodayIso } from '../../../lib/dates';
import { usePolling } from '../../../lib/use-polling';
import { notifyCajaChanged, onCajaChanged } from '../../caja-shifts/lib/caja-events';
import { cancelSale } from '../api/cancel';
import { getSale } from '../api/get';
import { listSales } from '../api/list';
import { fetchActivePromotions } from '../api/list-promotions';
import { printComanda, sendTabToKitchen } from '../api/print';
import { notifyOrdersChanged, onOrdersChanged } from '../lib/orders-events';
import { printCheckoutReceipt } from '../lib/print-on-checkout';
import { SALE_STATUS_MAPPING } from '../lib/sale-status-mapping';
import { totalsFromSale } from '../lib/totals';
import { CheckoutModal } from './CheckoutModal';
import { EditSaleModal } from './EditSaleModal';
import { OpenTabCard, anySentToKitchen } from './OpenTabCard';
import { SaleDetailModal } from './SaleDetailModal';

const REFRESH_MS = 15_000;
const RECENT_LIMIT = 12;

/**
 * Panel de pedidos (#2) a la izquierda del catálogo: cuentas abiertas (#3)
 * con sus acciones + últimos pedidos del día con su estado.
 */
export function OrdersPanel() {
  const [tabs, setTabs] = useState<Sale[]>([]);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [payTab, setPayTab] = useState<Sale | null>(null);
  const [editTab, setEditTab] = useState<Sale | null>(null);
  const [cancelTab, setCancelTab] = useState<Sale | null>(null);
  const [detailSale, setDetailSale] = useState<Sale | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [pending, today] = await Promise.all([
        listSales({ status: 'PENDIENTE_PAGO', type: 'COUNTER', limit: 100 }),
        listSales({ type: 'COUNTER', from: startOfTodayIso(), limit: 60 }),
      ]);
      setTabs(pending.filter((s) => s.isOpenTab));
      setRecent(today.filter((s) => !(s.isOpenTab && s.status === 'PENDIENTE_PAGO')).slice(0, RECENT_LIMIT));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudieron cargar los pedidos'));
    }
  }, []);

  usePolling(refresh, REFRESH_MS);
  useEffect(() => {
    const offOrders = onOrdersChanged(() => void refresh());
    const offCaja = onCajaChanged(() => void refresh());
    return () => {
      offOrders();
      offCaja();
    };
  }, [refresh]);

  // Promos: solo para el split "por productos" del cobro de cuenta (los
  // totales de la cuenta ya vienen del backend — acá no se recalculan).
  usePolling(async () => {
    try {
      setPromos(await fetchActivePromotions());
    } catch (e) {
      logError('orders-panel.promos', e);
    }
  }, 60_000);

  // Cobrar/editar SIEMPRE sobre la venta FRESCA: el snapshot de la lista puede
  // tener hasta 15s (u otra terminal pudo editar la cuenta). El backend igual
  // rechaza sumas desactualizadas; esto evita mostrarle al cajero un total viejo.
  const openWithFresh = async (tab: Sale, set: (s: Sale) => void) => {
    setBusyId(tab.id);
    try {
      set(await getSale(tab.id));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar la cuenta'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSendKitchen = async (tab: Sale) => {
    setBusyId(tab.id);
    try {
      await sendTabToKitchen(tab.id);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo enviar a cocina'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async () => {
    const tab = cancelTab;
    if (!tab) return;
    setBusyId(tab.id);
    try {
      await cancelSale(tab.id);
      // #8: si la cocina ya recibió tandas, avisarle con la comanda de
      // ANULACIÓN (número gigante) para que descarte el pedido.
      if (anySentToKitchen(tab)) {
        void printComanda(tab.id, { cancel: true }).catch((e) =>
          logError('orders-panel.cancel-comanda', e, { saleId: tab.id }),
        );
      }
      await refresh();
      setCancelTab(null);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cancelar la cuenta'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <aside className="hidden h-full w-[clamp(230px,22vw,310px)] shrink-0 flex-col overflow-hidden border-r border-border bg-card lg:flex">
      <header className="border-b border-border px-3 py-3">
        <h2 className="font-display text-base font-bold tracking-tight text-foreground">
          Pedidos
        </h2>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {error ? (
          <p role="alert" className="rounded-md border border-warning-border bg-warning-bg px-2 py-1.5 text-xs text-warning">
            {error}
          </p>
        ) : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cuentas abiertas {tabs.length > 0 ? `(${tabs.length})` : ''}
          </h3>
          {tabs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Sin cuentas abiertas. Arma el carrito, escribe el cliente y toca «Cuenta».
            </p>
          ) : (
            <ul className="space-y-2">
              {tabs.map((tab) => (
                <OpenTabCard
                  key={tab.id}
                  tab={tab}
                  busy={busyId === tab.id}
                  onPay={() => void openWithFresh(tab, setPayTab)}
                  onEdit={() => void openWithFresh(tab, setEditTab)}
                  onSendKitchen={() => void handleSendKitchen(tab)}
                  onCancel={() => setCancelTab(tab)}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Últimos pedidos
          </h3>
          {recent.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no hay pedidos hoy.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setDetailSale(s)}
                    className="flex w-full items-center justify-between gap-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        #{s.receiptNumber}
                        {s.customerName ? ` · ${s.customerName}` : ''}
                      </p>
                      <StatusBadge status={s.status} mapping={SALE_STATUS_MAPPING} size="sm" />
                    </div>
                    <Money amount={s.total} size="sm" weight="medium" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CheckoutModal
        open={payTab !== null}
        total={payTab?.total ?? 0}
        items={[]}
        totals={payTab ? totalsFromSale(payTab) : { lines: [], subtotal: 0, discount: 0, orderDiscountAmount: 0, total: 0 }}
        promos={promos}
        sale={payTab}
        onClose={() => setPayTab(null)}
        onSuccess={(s) => {
          setPayTab(null);
          notifyCajaChanged();
          notifyOrdersChanged();
          printCheckoutReceipt(s);
        }}
      />

      <EditSaleModal
        sale={editTab}
        open={editTab !== null}
        onClose={() => setEditTab(null)}
        onSaved={() => {
          setEditTab(null);
          notifyOrdersChanged();
        }}
      />

      <SaleDetailModal sale={detailSale} onClose={() => setDetailSale(null)} />

      <ConfirmDialog
        open={cancelTab !== null}
        title="¿Cancelar la cuenta?"
        description={`La cuenta de ${cancelTab?.customerName ?? `#${cancelTab?.receiptNumber ?? ''}`} se marca como no pagada. Esta acción no se puede deshacer.`}
        confirmLabel="Sí, cancelar cuenta"
        cancelLabel="Volver"
        destructive
        pending={busyId === cancelTab?.id}
        onCancel={() => setCancelTab(null)}
        onConfirm={() => void handleCancel()}
      />
    </aside>
  );
}
