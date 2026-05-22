'use client';

import {
  DIGITAL_PAYMENT_METHODS,
  type PaymentMethod,
  type PublicWebOrder,
  type Sale,
} from '@pos-tercos/types';
import {
  Button,
  Dialog,
  FormField,
  Money,
  formatCop,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { confirmPayment } from '../../sales';
import { fetchSaleById } from '../api/get-sale';
import { openWhatsAppForSale } from '../lib/whatsapp';
import { OrderItemsList } from './OrderItemsList';
import { WebDigitalDoubleValidation } from './WebDigitalDoubleValidation';
import { WebPaymentMethodSelector } from './WebPaymentMethodSelector';

const DIGITAL_SET = new Set<PaymentMethod>(DIGITAL_PAYMENT_METHODS);

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
  const [method, setMethod] = useState<PaymentMethod | null>('NEQUI');
  const [digital1, setDigital1] = useState<number | null>(null);
  const [digital2, setDigital2] = useState<number | null>(null);
  const [doubleVerified, setDoubleVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !order) return;
    setMethod('NEQUI');
    setDigital1(null);
    setDigital2(null);
    setDoubleVerified(false);
    setError(null);
    setPending(false);
    setLoadingSale(true);
    fetchSaleById(order.id)
      .then(setFullSale)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Error cargando la venta'),
      )
      .finally(() => setLoadingSale(false));
  }, [open, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDigital = method !== null && DIGITAL_SET.has(method);
  const total = order?.total ?? 0;
  const d1 = digital1 ?? 0;
  const d2 = digital2 ?? 0;

  const validation = useMemo(() => {
    if (!order || !method) return { ok: false, reason: 'Elegí un método' };
    if (method === 'CASH') return { ok: true, reason: null };
    if (d1 !== total) return { ok: false, reason: `Monto 1 debe ser ${formatCop(total)}` };
    if (d2 !== total) return { ok: false, reason: `Monto 2 debe ser ${formatCop(total)}` };
    if (d1 !== d2) return { ok: false, reason: 'Los dos montos no coinciden' };
    if (!doubleVerified) return { ok: false, reason: 'Confirma doble verificación' };
    return { ok: true, reason: null };
  }, [order, method, d1, d2, doubleVerified, total]);

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
      });
      openWhatsAppForSale(paid, 'confirmed');
      onConfirmed(paid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
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
          <Button onClick={handleConfirm} disabled={!validation.ok || pending}>
            {pending ? 'Confirmando…' : <>Confirmar <Money amount={total} weight="bold" className="ml-1 text-current" /></>}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl bg-muted/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Recoger en tienda</span>
            <Money amount={total} size="lg" weight="bold" />
          </div>
          <p className="mt-1 text-xs text-warning">
            Verifica el comprobante en WhatsApp antes de confirmar.
          </p>
        </section>

        <OrderItemsList loading={loadingSale} sale={fullSale} />

        <FormField label="Método de pago verificado">
          <WebPaymentMethodSelector selected={method} onSelect={setMethod} />
        </FormField>

        {isDigital ? (
          <WebDigitalDoubleValidation
            digital1={digital1}
            digital2={digital2}
            doubleVerified={doubleVerified}
            onDigital1={setDigital1}
            onDigital2={setDigital2}
            onDoubleVerified={setDoubleVerified}
          />
        ) : null}

        {!validation.ok && method ? (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
            {validation.reason}
          </p>
        ) : null}
        {error ? (
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
