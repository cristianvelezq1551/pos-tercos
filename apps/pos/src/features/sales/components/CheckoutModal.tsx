'use client';

import {
  DIGITAL_PAYMENT_METHODS,
  type PaymentMethod,
  type Promotion,
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
import {
  enqueueOfflineSale,
  getCachedCashierName,
  useOffline,
} from '../../offline';
import type { ReceiptDataInput } from '../lib/build-receipt-data';
import { buildOfflinePayload, buildOfflineReceiptInput } from '../lib/build-receipt-data';
import { confirmPayment } from '../api/confirm-payment';
import { notifyCajaChanged } from '../../shifts/lib/caja-events';
import { FALLBACK_METHODS, fetchEnabledMethods } from '../api/payment-methods';
import { createSale } from '../api/create';
import type { CartLine } from '../lib/cart-types';
import type { CartTotalsResult } from '../lib/totals';
import { cartLinesToCreateItems } from '../store/cart-store';
import { CashSection } from './CashSection';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { TransferSection } from './TransferSection';
import { SplitPaymentSection, type SplitResult } from './split/SplitPaymentSection';

const DIGITAL_SET = new Set<PaymentMethod>(DIGITAL_PAYMENT_METHODS);

export interface CheckoutSuccess {
  turnNumber: number | null;
  total: number;
  /** Método único, o etiqueta "Dividido (N pagos)" en cuenta separada. */
  paymentMethod: string;
  changeDue: number;
  // ── Venta ONLINE ──
  saleId?: string;
  receiptNumber?: number;
  /** Venta completa — para imprimir el recibo offline si el backend cae. */
  sale?: Sale;
  // ── Venta OFFLINE (encolada) ──
  provisionalNumber?: string;
  /** Recibo provisional ya armado — CartPanel lo manda al print-agent. */
  receipt?: ReceiptDataInput;
}

export function CheckoutModal({
  open,
  total,
  items,
  totals,
  promos,
  onClose,
  onSuccess,
}: {
  open: boolean;
  total: number;
  items: readonly CartLine[];
  totals: CartTotalsResult;
  promos: readonly Promotion[];
  onClose: () => void;
  onSuccess: (s: CheckoutSuccess) => void;
}) {
  const { status, refreshPending } = useOffline();
  const offline = status === 'offline';
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [doubleVerified, setDoubleVerified] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [splitReason, setSplitReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [enabledMethods, setEnabledMethods] = useState<PaymentMethod[]>(FALLBACK_METHODS);

  // Métodos habilitados por el admin (offline cae al fallback).
  useEffect(() => {
    if (!open) return;
    if (offline) {
      setEnabledMethods(FALLBACK_METHODS);
      return;
    }
    let cancelled = false;
    void fetchEnabledMethods().then((m) => {
      if (!cancelled) setEnabledMethods(m);
    });
    return () => {
      cancelled = true;
    };
  }, [open, offline]);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      setMethod(null);
      setCashReceived(null);
      setDoubleVerified(false);
      setSplitOpen(false);
      setSplitResult(null);
      setSplitReason(null);
      setError(null);
      setPending(false);
    }
  }, [open]);

  const isDigital = method !== null && DIGITAL_SET.has(method);
  const cashNum = cashReceived ?? 0;

  const changeDue = method === 'CASH' ? Math.max(0, cashNum - total) : 0;

  const validation = useMemo(() => {
    if (splitOpen) {
      if (splitResult) return { ok: true, reason: null };
      return { ok: false, reason: splitReason ?? 'Completá la división de la cuenta' };
    }
    if (!method) return { ok: false, reason: 'Elige un método de pago' };
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
        reason: 'Confirma que la transferencia llegó a la cuenta',
      };
    }
    return { ok: true, reason: null };
  }, [splitOpen, splitResult, splitReason, method, cashNum, doubleVerified, total]);

  const handleConfirm = async () => {
    if (!validation.ok || pending) return;
    if (!splitOpen && !method) return;
    setError(null);
    setPending(true);
    try {
      // CUENTA DIVIDIDA (solo online): N partes en una sola confirmación atómica.
      if (splitOpen && splitResult) {
        const sale = await createSale(
          { type: 'COUNTER', items: cartLinesToCreateItems(items) },
          idempotencyKey,
        );
        const paid = await confirmPayment(sale.id, { payments: splitResult.payments });
        notifyCajaChanged();
        onSuccess({
          saleId: paid.id,
          receiptNumber: paid.receiptNumber,
          turnNumber: paid.turnNumber,
          total: paid.total,
          paymentMethod: `Dividido (${splitResult.payments.length} pagos)`,
          changeDue: splitResult.changeDue,
          sale: paid,
        });
        return;
      }

      const amountReceived = method === 'CASH' ? cashNum : total;

      // OFFLINE: encolar la venta + imprimir recibo provisional (sin backend).
      if (offline) {
        const enqueued = await enqueueOfflineSale({
          payload: buildOfflinePayload(items, totals),
          payment: { method: method!, amountReceived, offlineVerified: isDigital },
        });
        const cashierName = await getCachedCashierName();
        const receipt = buildOfflineReceiptInput(items, totals, promos, {
          provisionalNumber: enqueued.provisionalNumber,
          cashierName,
          paymentMethod: method!,
        });
        refreshPending();
        onSuccess({
          turnNumber: null,
          total,
          paymentMethod: method!,
          changeDue,
          provisionalNumber: enqueued.provisionalNumber,
          receipt,
        });
        return;
      }

      // ONLINE: crear + confirmar contra el backend (camino de siempre).
      const sale = await createSale(
        { type: 'COUNTER', items: cartLinesToCreateItems(items) },
        idempotencyKey,
      );
      const paid = await confirmPayment(sale.id, {
        method: method!,
        amountReceived,
        digitalDoubleVerified: isDigital ? true : undefined,
      });
      notifyCajaChanged();
      onSuccess({
        saleId: paid.id,
        receiptNumber: paid.receiptNumber,
        turnNumber: paid.turnNumber,
        total: paid.total,
        paymentMethod: method!,
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
            {pending ? (
              'Cobrando…'
            ) : (
              <>
                {offline ? 'Cobrar offline' : 'Confirmar'}{' '}
                <Money amount={total} weight="bold" className="ml-1 text-current" />
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {offline ? (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm font-semibold text-warning">
            Sin conexión — esta venta se cobra <strong>offline</strong> y se sincroniza
            sola al volver la red. El recibo sale con número provisional (OFF-N).
          </p>
        ) : null}
        <p className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground">
          📋 Repasá el pedido en voz alta con el cliente antes de cobrar.
        </p>
        {!offline ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              {splitOpen ? 'Cuenta dividida' : 'Pago único'}
            </span>
            <Button
              type="button"
              variant={splitOpen ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSplitOpen((v) => !v);
                setSplitResult(null);
                setSplitReason(null);
              }}
            >
              {splitOpen ? '← Pago único' : 'Dividir cuenta'}
            </Button>
          </div>
        ) : null}

        {splitOpen ? (
          <SplitPaymentSection
            total={total}
            totals={totals}
            methods={enabledMethods}
            onChange={(result, reason) => {
              setSplitResult(result);
              setSplitReason(reason);
            }}
          />
        ) : (
          <>
            <FormField label="Método de pago">
              <PaymentMethodSelector methods={enabledMethods} selected={method} onSelect={setMethod} />
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
          </>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {!validation.ok && (method || splitOpen) ? (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
            {validation.reason}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
