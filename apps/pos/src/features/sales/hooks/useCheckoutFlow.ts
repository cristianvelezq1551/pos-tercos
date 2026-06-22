'use client';

import {
  DIGITAL_PAYMENT_METHODS,
  type PaymentMethod,
  type Promotion,
} from '@pos-tercos/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';
import { useOffline } from '../../offline';
import { notifyCajaChanged } from '../../shifts/lib/caja-events';
import { cancelSale } from '../api/cancel';
import { printComanda } from '../api/print';
import type { SplitResult } from '../components/split/SplitPaymentSection';
import type { CartLine } from '../lib/cart-types';
import {
  autoPrintReceipt,
  runConfirmCheckout,
  type CheckoutSuccess,
  type PaidCheckout,
} from '../lib/checkout-confirm';
import { validateCheckout } from '../lib/checkout-validation';
import type { CartTotalsResult } from '../lib/totals';
import { useCheckoutSale } from './useCheckoutSale';
import { useEnabledPaymentMethods } from './useEnabledPaymentMethods';

const DIGITAL_SET = new Set<PaymentMethod>(DIGITAL_PAYMENT_METHODS);

// Estado + secuencia completa del cobro: crear venta al abrir → comanda →
// confirmar pago → factura → cancelar si se cierra sin pagar.
export function useCheckoutFlow({
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
  const [paid, setPaid] = useState(false);
  // Guard SÍNCRONO contra doble-confirmación: `pending` (estado React) se
  // actualiza async, así que dos clicks rapidísimos podían pasar el check antes
  // de que el primero seteara pending. La ref se marca al instante.
  const submittingRef = useRef(false);

  const enabledMethods = useEnabledPaymentMethods(open, offline);
  const { sale, comandaState } = useCheckoutSale({
    open,
    offline,
    idempotencyKey,
    items,
    onError: setError,
  });

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
      setPaid(false);
      submittingRef.current = false;
    }
  }, [open]);

  // Cerrar SIN pagar → cancelar la venta creada (no queda colgada en
  // PENDIENTE_PAGO). Si la comanda YA salió a cocina, imprimir un ticket de
  // ANULACIÓN para que descarten el pedido (no preparen comida muerta).
  const handleClose = () => {
    if (sale && !paid) {
      const id = sale.id;
      // El ticket de anulación se imprime ANTES de cancelar: el endpoint lee la
      // venta en PENDIENTE_PAGO; si cancelSale corre primero, el status ya no
      // genera comanda. onClose no espera (la UI cierra al instante).
      if (comandaState === 'ok') {
        void printComanda(id, { cancel: true })
          .catch((e) => logError('checkout.cancel-comanda', e, { saleId: id }))
          .finally(() =>
            void cancelSale(id).catch((e) => logError('checkout.cancel-sale', e, { saleId: id })),
          );
      } else {
        void cancelSale(id).catch((e) => logError('checkout.cancel-sale', e, { saleId: id }));
      }
    }
    onClose();
  };

  const isDigital = method !== null && DIGITAL_SET.has(method);
  const cashNum = cashReceived ?? 0;
  const changeDue = method === 'CASH' ? Math.max(0, cashNum - total) : 0;

  const validation = useMemo(
    () =>
      validateCheckout({ splitOpen, splitResult, splitReason, method, cashNum, doubleVerified, total }),
    [splitOpen, splitResult, splitReason, method, cashNum, doubleVerified, total],
  );

  const finishPaid = ({ paidSale, success }: PaidCheckout) => {
    setPaid(true);
    notifyCajaChanged();
    autoPrintReceipt(paidSale);
    onSuccess(success);
  };

  const toggleSplit = () => {
    setSplitOpen((v) => !v);
    setSplitResult(null);
    setSplitReason(null);
  };

  const handleSplitChange = (result: SplitResult | null, reason: string | null) => {
    setSplitResult(result);
    setSplitReason(reason);
  };

  const handleConfirm = async () => {
    if (!validation.ok || submittingRef.current) return;
    if (!splitOpen && !method) return;
    submittingRef.current = true;
    setError(null);
    setPending(true);
    try {
      await runConfirmCheckout({
        splitOpen,
        splitResult,
        method,
        cashNum,
        total,
        offline,
        isDigital,
        changeDue,
        sale,
        items,
        totals,
        promos,
        idempotencyKey,
        refreshPending,
        finishPaid,
        onSuccess,
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Error desconocido'));
      setPending(false);
      submittingRef.current = false; // liberar para permitir reintento
    }
  };

  return {
    offline,
    enabledMethods,
    comandaState,
    method,
    setMethod,
    cashReceived,
    setCashReceived,
    doubleVerified,
    setDoubleVerified,
    isDigital,
    splitOpen,
    toggleSplit,
    handleSplitChange,
    error,
    pending,
    validation,
    handleClose,
    handleConfirm,
  };
}
