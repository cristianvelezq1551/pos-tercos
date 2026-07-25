import type { ManualDiscount, PaymentMethod, Promotion, Sale } from '@pos-tercos/types';
import { enqueueOfflineSale, getCachedCashierName } from '../../offline';
import { confirmPayment } from '../api/confirm-payment';
import { createSale } from '../api/create';
import type { SplitResult } from '../components/split/SplitPaymentSection';
import { cartLinesToCreateItems } from '../store/cart-store';
import type { ReceiptDataInput } from './build-receipt-data';
import { buildOfflinePayload, buildOfflineReceiptInput } from './build-receipt-data';
import type { CartLine } from './cart-types';
import type { CartTotalsResult } from './totals';

/** Datos del pedido más allá de las líneas (#1 nombre + #5b descuentos). */
export interface SaleMeta {
  customerName: string | null;
  lineDiscounts: Record<string, ManualDiscount>;
  orderDiscount: ManualDiscount | null;
  discountReason: string | null;
}

export const EMPTY_SALE_META: SaleMeta = {
  customerName: null,
  lineDiscounts: {},
  orderDiscount: null,
  discountReason: null,
};

export interface CheckoutSuccess {
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

export interface PaidCheckout {
  paidSale: Sale;
  success: CheckoutSuccess;
}

// `sale` presente = cobro de una venta existente (cuenta abierta); si no,
// la venta se crea acá con el idempotency-key del modal (reintentos seguros).
function ensureSale(
  sale: Sale | null,
  items: readonly CartLine[],
  idempotencyKey: string,
  meta: SaleMeta,
): Promise<Sale> {
  if (sale) return Promise.resolve(sale);
  const hasManualDiscount =
    meta.orderDiscount !== null || items.some((it) => meta.lineDiscounts[it.lineId]);
  return createSale(
    {
      type: 'COUNTER',
      items: cartLinesToCreateItems(items, meta.lineDiscounts),
      customerName: meta.customerName?.trim() ? meta.customerName.trim() : undefined,
      orderDiscount: meta.orderDiscount ?? undefined,
      discountReason:
        hasManualDiscount && meta.discountReason ? meta.discountReason : undefined,
    },
    idempotencyKey,
  );
}

async function confirmSplitCheckout(args: {
  sale: Sale | null;
  items: readonly CartLine[];
  idempotencyKey: string;
  splitResult: SplitResult;
  meta: SaleMeta;
}): Promise<PaidCheckout> {
  const created = await ensureSale(args.sale, args.items, args.idempotencyKey, args.meta);
  const paidSale = await confirmPayment(created.id, { payments: args.splitResult.payments });
  return {
    paidSale,
    success: {
      saleId: paidSale.id,
      receiptNumber: paidSale.receiptNumber,
      total: paidSale.total,
      paymentMethod: `Dividido (${args.splitResult.payments.length} pagos)`,
      changeDue: args.splitResult.changeDue,
      sale: paidSale,
    },
  };
}

async function confirmOfflineCheckout(args: {
  items: readonly CartLine[];
  totals: CartTotalsResult;
  promos: readonly Promotion[];
  method: PaymentMethod;
  amountReceived: number;
  isDigital: boolean;
  total: number;
  changeDue: number;
}): Promise<CheckoutSuccess> {
  const enqueued = await enqueueOfflineSale({
    payload: buildOfflinePayload(args.items, args.totals),
    payment: {
      method: args.method,
      amountReceived: args.amountReceived,
      offlineVerified: args.isDigital,
    },
  });
  const cashierName = await getCachedCashierName();
  const receipt = buildOfflineReceiptInput(args.items, args.totals, args.promos, {
    provisionalNumber: enqueued.provisionalNumber,
    cashierName,
    paymentMethod: args.method,
  });
  return {
    total: args.total,
    paymentMethod: args.method,
    changeDue: args.changeDue,
    provisionalNumber: enqueued.provisionalNumber,
    receipt,
  };
}

async function confirmOnlineCheckout(args: {
  sale: Sale | null;
  items: readonly CartLine[];
  idempotencyKey: string;
  method: PaymentMethod;
  amountReceived: number;
  isDigital: boolean;
  changeDue: number;
  meta: SaleMeta;
}): Promise<PaidCheckout> {
  const created = await ensureSale(args.sale, args.items, args.idempotencyKey, args.meta);
  const paidSale = await confirmPayment(created.id, {
    method: args.method,
    amountReceived: args.amountReceived,
    digitalDoubleVerified: args.isDigital ? true : undefined,
  });
  return {
    paidSale,
    success: {
      saleId: paidSale.id,
      receiptNumber: paidSale.receiptNumber,
      total: paidSale.total,
      paymentMethod: args.method,
      changeDue: args.changeDue,
      sale: paidSale,
    },
  };
}

export interface ConfirmCheckoutDeps {
  splitOpen: boolean;
  splitResult: SplitResult | null;
  method: PaymentMethod | null;
  cashNum: number;
  total: number;
  offline: boolean;
  isDigital: boolean;
  changeDue: number;
  sale: Sale | null;
  items: readonly CartLine[];
  totals: CartTotalsResult;
  promos: readonly Promotion[];
  idempotencyKey: string;
  /** Cliente + descuentos manuales del carrito (ignorado si `sale` existe). */
  meta: SaleMeta;
  refreshPending: () => void;
  finishPaid: (r: PaidCheckout) => void;
  onSuccess: (s: CheckoutSuccess) => void;
}

// Despacha al flujo de cobro correspondiente. Los side-effects post-pago
// (caja → factura → onSuccess) los ordena finishPaid en el caller.
export async function runConfirmCheckout(d: ConfirmCheckoutDeps): Promise<void> {
  // Una CUENTA ABIERTA vive en el backend: sin red no se puede cobrar (el
  // flujo offline encolaría una venta NUEVA vacía y la cuenta seguiría viva
  // → descuadre). Se rechaza con mensaje claro; el cajero reintenta con red.
  if (d.offline && d.sale) {
    throw new Error(
      'Sin conexión no se puede cobrar una cuenta abierta. Espera a que vuelva la red e intenta de nuevo.',
    );
  }
  // CUENTA DIVIDIDA (solo online): N partes en una sola confirmación atómica.
  if (d.splitOpen && d.splitResult) {
    d.finishPaid(
      await confirmSplitCheckout({
        sale: d.sale,
        items: d.items,
        idempotencyKey: d.idempotencyKey,
        splitResult: d.splitResult,
        meta: d.meta,
      }),
    );
    return;
  }

  const amountReceived = d.method === 'CASH' ? d.cashNum : d.total;

  // OFFLINE: encolar la venta + imprimir recibo provisional (sin backend).
  if (d.offline) {
    const success = await confirmOfflineCheckout({
      items: d.items,
      totals: d.totals,
      promos: d.promos,
      method: d.method!,
      amountReceived,
      isDigital: d.isDigital,
      total: d.total,
      changeDue: d.changeDue,
    });
    d.refreshPending();
    d.onSuccess(success);
    return;
  }

  d.finishPaid(
    await confirmOnlineCheckout({
      sale: d.sale,
      items: d.items,
      idempotencyKey: d.idempotencyKey,
      method: d.method!,
      amountReceived,
      isDigital: d.isDigital,
      changeDue: d.changeDue,
      meta: d.meta,
    }),
  );
}
