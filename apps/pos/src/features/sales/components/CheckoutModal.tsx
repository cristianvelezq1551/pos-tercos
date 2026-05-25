'use client';

import { DIGITAL_PAYMENT_METHODS, type PaymentMethod, type Sale } from '@pos-tercos/types';
import {
  Button,
  Dialog,
  FormField,
  Money,
  formatCop,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { confirmPayment } from '../api/confirm-payment';
import { createSale } from '../api/create';
import type { CartLine } from '../lib/cart-types';
import { cartLinesToCreateItems } from '../store/cart-store';
import { CashSection } from './CashSection';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { TransferSection } from './TransferSection';

const DIGITAL_SET = new Set<PaymentMethod>(DIGITAL_PAYMENT_METHODS);

export interface CheckoutSuccess {
  saleId: string;
  receiptNumber: number;
  turnNumber: number | null;
  total: number;
  paymentMethod: PaymentMethod;
  changeDue: number;
  /** Venta completa — para imprimir el recibo offline si el backend cae. */
  sale: Sale;
}

export function CheckoutModal({
  open,
  total,
  items,
  onClose,
  onSuccess,
}: {
  open: boolean;
  total: number;
  items: readonly CartLine[];
  onClose: () => void;
  onSuccess: (s: CheckoutSuccess) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [doubleVerified, setDoubleVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setMethod(null);
      setCashReceived(null);
      setDoubleVerified(false);
      setError(null);
      setPending(false);
    }
  }, [open]);

  const isDigital = method !== null && DIGITAL_SET.has(method);
  const cashNum = cashReceived ?? 0;

  const changeDue = method === 'CASH' ? Math.max(0, cashNum - total) : 0;

  const validation = useMemo(() => {
    if (!method) return { ok: false, reason: 'Elegí un método de pago' };
    if (method === 'CASH') {
      if (cashNum < total) {
        return {
          ok: false,
          reason: `Faltan ${formatCop(total - cashNum)} para completar el pago`,
        };
      }
      return { ok: true, reason: null };
    }
    // Transferencia: solo confirmar que llegó (monto = total exacto).
    if (!doubleVerified) {
      return {
        ok: false,
        reason: 'Confirmá que la transferencia llegó a la cuenta',
      };
    }
    return { ok: true, reason: null };
  }, [method, cashNum, doubleVerified, total]);

  const handleConfirm = async () => {
    if (!validation.ok || !method || pending) return;
    setError(null);
    setPending(true);
    try {
      const sale = await createSale(
        { type: 'COUNTER', items: cartLinesToCreateItems(items) },
        idempotencyKey,
      );
      const amountReceived = method === 'CASH' ? cashNum : total;
      const paid = await confirmPayment(sale.id, {
        method,
        amountReceived,
        digitalDoubleVerified: isDigital ? true : undefined,
      });
      onSuccess({
        saleId: paid.id,
        receiptNumber: paid.receiptNumber,
        turnNumber: paid.turnNumber,
        total: paid.total,
        paymentMethod: method,
        changeDue,
        sale: paid,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? () => {} : onClose}
      title="Cobrar venta"
      description={`Total ${formatCop(total)} · ${items.length} ${
        items.length === 1 ? 'línea' : 'líneas'
      }`}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button size="lg" onClick={handleConfirm} disabled={!validation.ok || pending}>
            {pending ? 'Cobrando…' : <>Confirmar <Money amount={total} weight="bold" className="ml-1 text-current" /></>}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground">
          📋 Repasá el pedido en voz alta con el cliente antes de cobrar.
        </p>
        <FormField label="Método de pago">
          <PaymentMethodSelector selected={method} onSelect={setMethod} />
        </FormField>

        {method === 'CASH' ? (
          <CashSection
            total={total}
            cashReceived={cashReceived}
            onChange={setCashReceived}
          />
        ) : null}

        {isDigital ? (
          <TransferSection
            total={total}
            verified={doubleVerified}
            onVerified={setDoubleVerified}
          />
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {!validation.ok && method ? (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
            {validation.reason}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
