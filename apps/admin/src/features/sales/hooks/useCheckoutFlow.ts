'use client';

import { type PaymentMethod, type Promotion, type Sale } from '@pos-tercos/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { logError } from '../../../lib/client-log';
import { getErrorMessage } from '../../../lib/errors';
import { randomUUID } from '../../../lib/uuid';
import { useOffline } from '../../offline';
import { notifyCajaChanged } from '../../../lib/caja-events';
import { printComanda, sendTabToKitchen } from '../api/print';
import { notifyComandaFailed } from '../lib/comanda-events';
import type { SplitResult } from '../components/split/SplitPaymentSection';
import type { CartLine } from '../lib/cart-types';
import {
  EMPTY_SALE_META,
  runConfirmCheckout,
  type CheckoutSuccess,
  type PaidCheckout,
  type SaleMeta,
} from '../lib/checkout-confirm';
import { validateCheckout } from '../lib/checkout-validation';
import type { CartTotalsResult } from '../lib/totals';
import { useEnabledPaymentMethods } from './useEnabledPaymentMethods';

// Estado + secuencia completa del cobro: confirmar pago → comanda → factura.
// `sale` presente = cobro de una venta EXISTENTE (cuenta abierta): no se crea
// venta nueva y la comanda post-pago solo lleva lo pendiente de enviar.
export function useCheckoutFlow({
  open,
  total,
  items,
  totals,
  promos,
  sale = null,
  meta = EMPTY_SALE_META,
  onClose,
  onSuccess,
}: {
  open: boolean;
  total: number;
  items: readonly CartLine[];
  totals: CartTotalsResult;
  promos: readonly Promotion[];
  sale?: Sale | null;
  meta?: SaleMeta;
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
  // Guard SÍNCRONO contra doble-confirmación: `pending` (estado React) se
  // actualiza async, así que dos clicks rapidísimos podían pasar el check antes
  // de que el primero seteara pending. La ref se marca al instante.
  const submittingRef = useRef(false);

  const enabledMethods = useEnabledPaymentMethods(open, offline);
  // Un método es "digital" (pide verificar comprobante) según el catálogo, no
  // por su code — lo define el admin al crear/editar el método.
  const requiresVerificationCodes = useMemo(
    () => new Set(enabledMethods.filter((m) => m.requiresVerification).map((m) => m.code)),
    [enabledMethods],
  );

  // Si la red cae con la cuenta dividida abierta, el split queda inalcanzable
  // (el toggle se oculta offline) y confirmar intentaría el flujo online →
  // error confuso. Se vuelve a pago único automáticamente.
  useEffect(() => {
    if (offline && splitOpen) {
      setSplitOpen(false);
      setSplitResult(null);
      setSplitReason(null);
    }
  }, [offline, splitOpen]);

  useEffect(() => {
    if (open) {
      setIdempotencyKey(randomUUID());
      setMethod(null);
      setCashReceived(null);
      setDoubleVerified(false);
      setSplitOpen(false);
      setSplitResult(null);
      setSplitReason(null);
      setError(null);
      setPending(false);
      submittingRef.current = false;
    }
  }, [open]);

  // Cerrar el modal: la venta recién se CREA al confirmar el pago (ya no al
  // abrir), así que cerrar sin pagar no deja nada que limpiar ni imprime
  // comandas. Si un cobro fallara a mitad (venta creada, pago no confirmado),
  // queda en PENDIENTE_PAGO y el sweep de ventas huérfanas la cancela.
  const handleClose = () => {
    onClose();
  };

  const isDigital = method !== null && requiresVerificationCodes.has(method);
  const cashNum = cashReceived ?? 0;
  const changeDue = method === 'CASH' ? Math.max(0, cashNum - total) : 0;

  const validation = useMemo(
    () =>
      validateCheckout({
        splitOpen,
        splitResult,
        splitReason,
        method,
        cashNum,
        doubleVerified,
        total,
      }),
    [splitOpen, splitResult, splitReason, method, cashNum, doubleVerified, total],
  );

  const finishPaid = ({ paidSale, success }: PaidCheckout) => {
    notifyCajaChanged();
    // Pago confirmado → la COMANDA a cocina sale acá, una sola vez. La FACTURA
    // NO se imprime acá: la imprime onSuccess → printCheckoutReceipt (que además
    // cubre el caso offline). Imprimirla en ambos lados era el "DUPLICADO".
    // Cuenta abierta: la cocina YA recibió tandas — solo sale lo pendiente.
    // Un fallo NO muere en el log: dispara el aviso persistente con reintento
    // (la plata se cobró pero cocina no vio el pedido — informe A2).
    if (sale) {
      void sendTabToKitchen(paidSale.id).catch((e) => {
        logError('checkout.comanda', e, { saleId: paidSale.id });
        notifyComandaFailed({
          saleId: paidSale.id,
          receiptNumber: paidSale.receiptNumber,
          kind: 'tanda',
        });
      });
    } else {
      void printComanda(paidSale.id).catch((e) => {
        logError('checkout.comanda', e, { saleId: paidSale.id });
        notifyComandaFailed({
          saleId: paidSale.id,
          receiptNumber: paidSale.receiptNumber,
          kind: 'comanda',
        });
      });
    }
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
        meta,
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
