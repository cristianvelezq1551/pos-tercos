'use client';

import { type PaymentMethod, type PublicWebOrder, type Sale } from '@pos-tercos/types';
import { Button, Checkbox, Dialog, FormField, Money } from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { confirmPayment, notifyComandaFailed, sendTabToKitchen, TransferSection } from '../../sales';
import { fetchSaleById } from '../api/get-sale';
import { OrderItemsList } from './OrderItemsList';
import { StockShortageNotice } from './StockShortageNotice';
import { WebPaymentMethodSelector } from './WebPaymentMethodSelector';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';

/** El 409 del backend arranca con este texto (sales-consumption.service). */
const STOCK_SHORTAGE = 'stock insuficiente';

/** Solo a partir de este tiempo sin cobrarse ofrecemos "no avisar". */
const STALE_MIN = 15;

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export function ConfirmWebPaymentModal({
  order,
  open,
  onClose,
  onConfirmed,
}: {
  order: PublicWebOrder | null;
  open: boolean;
  onClose: () => void;
  onConfirmed: (sale: Sale) => void;
}) {
  const [fullSale, setFullSale] = useState<Sale | null>(null);
  const [loadingSale, setLoadingSale] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>('TRANSFER');
  const [doubleVerified, setDoubleVerified] = useState(false);
  const [silent, setSilent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Faltó stock al aprobar: no es un error del sistema, es un rechazo. */
  const shortage = error && error.toLowerCase().includes(STOCK_SHORTAGE) ? error : null;

  useEffect(() => {
    if (!open || !order) return;
    setMethod('TRANSFER');
    setDoubleVerified(false);
    setSilent(false);
    setError(null);
    setPending(false);
    setLoadingSale(true);
    fetchSaleById(order.id)
      .then(setFullSale)
      .catch((err) =>
        setError(getErrorMessage(err, 'Error cargando la venta')),
      )
      .finally(() => setLoadingSale(false));
  }, [open, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Los pedidos web se pagan por transferencia (digital) — nunca efectivo online.
  const isDigital = method !== null && method !== 'CASH';
  const total = order?.total ?? 0;
  // El toggle "no avisar" solo aparece para pedidos viejos (≥15 min sin cobrarse)
  // — cobros retroactivos. Para uno fresco, siempre se avisa (sin ruido en UI).
  const stale = order ? minutesSince(order.createdAt) >= STALE_MIN : false;

  const validation = useMemo(() => {
    if (!order || !method) return { ok: false, reason: 'Elige un método' };
    // Un domicilio se cobra con el envío YA cotizado (el backend lo bloquea si
    // no). fee 0 = sin asignar → avisar y deshabilitar antes de intentar.
    if (order.type === 'WEB_DELIVERY' && order.deliveryFee <= 0) {
      return {
        ok: false,
        reason: 'Asigna el costo del envío en la tarjeta del pedido antes de cobrar.',
      };
    }
    if (method === 'CASH') return { ok: true, reason: null };
    if (!doubleVerified) {
      return { ok: false, reason: 'Confirma que la transferencia llegó' };
    }
    return { ok: true, reason: null };
  }, [order, method, doubleVerified]);

  if (!order) return null;

  const handleConfirm = async () => {
    if (!validation.ok || !method || pending) return;
    setError(null);
    setPending(true);
    try {
      const paid = await confirmPayment(order.id, {
        method,
        amountReceived: total,
        digitalDoubleVerified: isDigital ? true : undefined,
        silent: stale && silent ? true : undefined,
      });
      // Aprobado ⇒ recién ahora la cocina ve el pedido. Antes de esto era una
      // solicitud sin efecto. Fire-and-forget: un fallo de impresión NO puede
      // revertir un cobro ya hecho — `ComandaFailureAlert` (en el layout) avisa
      // y ofrece reintentar, que es lo mismo que hace el mostrador.
      void sendTabToKitchen(order.id).catch((e: unknown) => {
        logError('web-orders.comanda', e);
        notifyComandaFailed({
          saleId: order.id,
          receiptNumber: order.receiptNumber,
          kind: 'comanda',
        });
      });
      onConfirmed(paid);
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido'));
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title={`Confirmar pago · #${order.receiptNumber}`}
      description={`${order.customerName} · ${order.customerPhone}`}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!validation.ok || pending || shortage !== null}>
            {pending ? 'Confirmando…' : <>Confirmar <Money amount={total} weight="bold" className="ml-1 text-current" /></>}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl bg-muted/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {order.type === 'WEB_DELIVERY' ? 'Entrega a domicilio' : 'Recoger en tienda'}
            </span>
            <Money amount={total} size="lg" weight="bold" />
          </div>
          <p className="mt-1 text-xs text-warning">
            Verifica el comprobante en WhatsApp antes de confirmar.
          </p>
          {order.deliveryFee > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Incluye ${order.deliveryFee.toLocaleString('es-CO')} de domicilio.
            </p>
          ) : null}
        </section>

        {order.deliveryAddress ? (
          <section className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Entregar en</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
              {order.deliveryAddress}
            </p>
            {order.deliveryNotes ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{order.deliveryNotes}</p>
            ) : null}
          </section>
        ) : null}

        <OrderItemsList loading={loadingSale} sale={fullSale} />

        <FormField label="Método de pago verificado">
          <WebPaymentMethodSelector selected={method} onSelect={setMethod} />
        </FormField>

        {isDigital ? (
          <TransferSection
            total={total}
            verified={doubleVerified}
            onVerified={setDoubleVerified}
          />
        ) : null}

        {stale ? (
          <div className="rounded-lg border border-warning-border bg-warning-bg/40 px-3 py-2.5">
            <Checkbox
              checked={silent}
              onChange={(e) => setSilent(e.target.checked)}
              label="Modo registro: no avisar al cliente"
              description="Pedido viejo (+15 min). Para cobrarlo retroactivamente sin enviarle WhatsApp."
            />
          </div>
        ) : null}

        {!validation.ok && method ? (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
            {validation.reason}
          </p>
        ) : null}
        {shortage ? (
          <StockShortageNotice
            saleId={order.id}
            message={shortage}
            onRejected={() => {
              setError(null);
              onClose();
            }}
          />
        ) : error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
