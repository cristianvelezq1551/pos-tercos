'use client';

import type { Promotion, Sale } from '@pos-tercos/types';
import { Button, ConfirmDialog, Money } from '@pos-tercos/ui';
import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../../../lib/errors';
import { logError } from '../../../lib/client-log';
import { notifyCajaChanged } from '../../caja-shifts/lib/caja-events';
import { carryOverOpenTab } from '../api/carry-over';
import { cancelSale } from '../api/cancel';
import { getSale } from '../api/get';
import { listSales } from '../api/list';
import { fetchActivePromotions } from '../api/list-promotions';
import { printComanda } from '../api/print';
import { notifyOrdersChanged } from '../lib/orders-events';
import { printCheckoutReceipt } from '../lib/print-on-checkout';
import { totalsFromSale } from '../lib/totals';
import { CheckoutModal } from './CheckoutModal';
import { anySentToKitchen } from './OpenTabCard';

/**
 * Resolución de cuentas abiertas al cerrar caja: por cada cuenta sin cobrar de
 * ESTA caja, el cajero elige cobrar, cancelar (se fue sin pagar) o traspasar a
 * la próxima caja. El cierre (padre) se destraba cuando no queda ninguna
 * (`onCountChange(0)`) y refresca su arqueo en cada cambio (`onChanged`).
 * Vive en el feature `sales` para reusar el cobro con imports locales.
 */
export function OpenTabsResolver({
  shiftId,
  disabled,
  onCountChange,
  onChanged,
}: {
  shiftId: string;
  disabled: boolean;
  onCountChange: (count: number) => void;
  onChanged: () => void;
}) {
  const [tabs, setTabs] = useState<Sale[]>([]);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [payTab, setPayTab] = useState<Sale | null>(null);
  const [cancelTab, setCancelTab] = useState<Sale | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await listSales({ shiftId, status: 'PENDIENTE_PAGO', limit: 100 });
    const open = rows.filter((s) => s.isOpenTab);
    setTabs(open);
    onCountChange(open.length);
  }, [shiftId, onCountChange]);

  useEffect(() => {
    reload().catch((e) => setError(getErrorMessage(e, 'No se pudieron cargar las cuentas abiertas')));
    fetchActivePromotions()
      .then(setPromos)
      .catch((e) => logError('open-tabs-resolver.promos', e));
  }, [reload]);

  const openPay = async (tab: Sale) => {
    setBusyId(tab.id);
    try {
      // Cobrar sobre la venta FRESCA (el snapshot puede tener segundos).
      setPayTab(await getSale(tab.id));
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo cargar la cuenta'));
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
      // #8: si la cocina ya recibió tandas, avisar con la comanda de anulación.
      if (anySentToKitchen(tab)) {
        void printComanda(tab.id, { cancel: true }).catch((e) =>
          logError('open-tabs-resolver.cancel-comanda', e, { saleId: tab.id }),
        );
      }
      await reload();
      onChanged();
      setCancelTab(null);
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo cancelar la cuenta'));
    } finally {
      setBusyId(null);
    }
  };

  const handleCarryOver = async (tab: Sale) => {
    setBusyId(tab.id);
    try {
      await carryOverOpenTab(tab.id);
      await reload();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e, 'No se pudo traspasar la cuenta'));
    } finally {
      setBusyId(null);
    }
  };

  if (tabs.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-warning-border bg-warning-bg/40 p-3">
      <div>
        <h3 className="text-sm font-semibold text-warning">
          Cuentas abiertas sin cobrar ({tabs.length})
        </h3>
        <p className="text-[0.6875rem] text-muted-foreground">
          Decide qué hacer con cada una antes de cerrar el turno.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="space-y-2">
        {tabs.map((tab) => {
          const busy = busyId === tab.id || disabled;
          return (
            <li key={tab.id} className="rounded-md border border-border bg-card p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                  {tab.customerName ?? `Cuenta #${tab.receiptNumber}`}
                  <span className="ml-1 text-xs text-muted-foreground">#{tab.receiptNumber}</span>
                </p>
                <Money amount={tab.total} weight="semibold" />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <Button size="sm" disabled={busy} onClick={() => void openPay(tab)}>
                  Cobrar
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleCarryOver(tab)}>
                  Traspasar
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCancelTab(tab)}>
                  Cancelar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[0.6875rem] text-muted-foreground">
        <strong className="font-semibold">Traspasar</strong> deja la cuenta viva para cobrarla en la próxima caja
        (sale de este arqueo). <strong className="font-semibold">Cancelar</strong> la marca como no pagada.
      </p>

      <CheckoutModal
        open={payTab !== null}
        total={payTab?.total ?? 0}
        items={[]}
        totals={
          payTab
            ? totalsFromSale(payTab)
            : { lines: [], subtotal: 0, discount: 0, orderDiscountAmount: 0, total: 0 }
        }
        promos={promos}
        sale={payTab}
        onClose={() => setPayTab(null)}
        onSuccess={(s) => {
          setPayTab(null);
          notifyCajaChanged();
          notifyOrdersChanged();
          printCheckoutReceipt(s);
          void reload();
          onChanged();
        }}
      />

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
    </section>
  );
}
