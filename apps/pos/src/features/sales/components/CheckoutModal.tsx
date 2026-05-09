'use client';

import { DIGITAL_PAYMENT_METHODS, type PaymentMethod } from '@pos-tercos/types';
import {
  Button,
  Checkbox,
  Dialog,
  FormField,
  Money,
  NumberInput,
  cn,
  formatCop,
} from '@pos-tercos/ui';
import { useEffect, useMemo, useState } from 'react';
import { confirmPayment } from '../api/confirm-payment';
import { createSale } from '../api/create';
import type { CartLine } from '../lib/cart-types';
import { cartLinesToCreateItems } from '../store/cart-store';

const METHODS: { method: PaymentMethod; label: string }[] = [
  { method: 'CASH', label: 'Efectivo' },
  { method: 'NEQUI', label: 'Nequi' },
  { method: 'DAVIPLATA', label: 'DaviPlata' },
  { method: 'QR_BANCOLOMBIA', label: 'QR Bancolombia' },
  { method: 'TRANSFER', label: 'Transferencia' },
];

const DIGITAL_SET = new Set<PaymentMethod>(DIGITAL_PAYMENT_METHODS);

export interface CheckoutSuccess {
  saleId: string;
  receiptNumber: number;
  total: number;
  paymentMethod: PaymentMethod;
  changeDue: number;
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
  const [digital1, setDigital1] = useState<number | null>(null);
  const [digital2, setDigital2] = useState<number | null>(null);
  const [doubleVerified, setDoubleVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setMethod(null);
      setCashReceived(null);
      setDigital1(null);
      setDigital2(null);
      setDoubleVerified(false);
      setError(null);
      setPending(false);
    }
  }, [open]);

  const isDigital = method !== null && DIGITAL_SET.has(method);
  const cashNum = cashReceived ?? 0;
  const d1 = digital1 ?? 0;
  const d2 = digital2 ?? 0;

  const changeDue = method === 'CASH' ? Math.max(0, cashNum - total) : 0;

  const validation = useMemo(() => {
    if (!method) return { ok: false, reason: 'Elegí un método de pago' };
    if (method === 'CASH') {
      if (cashNum < total) {
        return {
          ok: false,
          reason: `Recibido < total (faltan ${formatCop(total - cashNum)})`,
        };
      }
      return { ok: true, reason: null };
    }
    if (d1 !== total) return { ok: false, reason: `Monto 1 debe ser igual a ${formatCop(total)}` };
    if (d2 !== total) return { ok: false, reason: `Monto 2 debe ser igual a ${formatCop(total)}` };
    if (d1 !== d2) return { ok: false, reason: 'Los dos montos no coinciden' };
    if (!doubleVerified) {
      return {
        ok: false,
        reason: 'Confirma que verificaste app del negocio + comprobante del cliente',
      };
    }
    return { ok: true, reason: null };
  }, [method, cashNum, d1, d2, doubleVerified, total]);

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
        total: paid.total,
        paymentMethod: method,
        changeDue,
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
        <FormField label="Método de pago">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button
                key={m.method}
                type="button"
                onClick={() => setMethod(m.method)}
                className={cn(
                  'rounded-lg border px-3 py-3 text-sm font-semibold transition-[background-color,border-color,box-shadow] duration-150 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  method === m.method
                    ? 'border-primary bg-destructive/10 text-primary shadow-xs'
                    : 'border-border bg-card text-foreground hover:border-ink-300 hover:bg-muted/40',
                  'motion-reduce:transition-none',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </FormField>

        {method === 'CASH' ? (
          <div className="space-y-3 rounded-xl bg-muted/40 p-4">
            <FormField label="Recibido">
              <NumberInput
                value={cashReceived}
                onChange={setCashReceived}
                prefix="$"
                min={0}
                placeholder={total.toString()}
                autoFocus
              />
            </FormField>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Cambio</span>
              <Money
                amount={changeDue}
                size="xl"
                weight="bold"
                className={cashNum >= total ? 'text-success' : 'text-ink-300'}
              />
            </div>
          </div>
        ) : null}

        {isDigital ? (
          <div className="space-y-3 rounded-xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">
              Doble validación: ingresa el monto cobrado <strong>dos veces</strong>. El total
              debe coincidir exactamente con la venta.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Monto 1">
                <NumberInput
                  value={digital1}
                  onChange={setDigital1}
                  prefix="$"
                  min={0}
                  autoFocus
                />
              </FormField>
              <FormField label="Monto 2 (verificación)">
                <NumberInput value={digital2} onChange={setDigital2} prefix="$" min={0} />
              </FormField>
            </div>
            {d1 > 0 && d2 > 0 ? (
              <p
                className={cn(
                  'text-xs font-medium',
                  d1 === d2 && d1 === total ? 'text-success' : 'text-warning',
                )}
              >
                {d1 === d2 && d1 === total
                  ? '✓ Montos coinciden y matchean el total'
                  : d1 !== d2
                    ? '✗ No coinciden entre sí'
                    : `✗ No matchean total ${formatCop(total)}`}
              </p>
            ) : null}
            <Checkbox
              checked={doubleVerified}
              onChange={(e) => setDoubleVerified(e.target.checked)}
              label="Verifiqué el monto en la app del negocio y en el comprobante del cliente"
              description="Nequi / DaviPlata / Bancolombia"
            />
          </div>
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
