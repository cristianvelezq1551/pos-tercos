import type { PaymentMethod, Promotion, Sale } from '@pos-tercos/types';
import { enqueueOfflineSale, getCachedCashierName } from '../../offline';
import { confirmPayment } from '../api/confirm-payment';
import { createSale } from '../api/create';
import { printReceipt } from '../api/print';
import type { SplitResult } from '../components/split/SplitPaymentSection';
import { cartLinesToCreateItems } from '../store/cart-store';
import type { ReceiptDataInput } from './build-receipt-data';
import { buildOfflinePayload, buildOfflineReceiptInput } from './build-receipt-data';
import type { CartLine } from './cart-types';
import type { CartTotalsResult } from './totals';

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

export interface PaidCheckout {
  paidSale: Sale;
  success: CheckoutSuccess;
}

// Factura automática post-pago: best-effort — si la impresora falla, el
// banner de la venta conserva el botón "Imprimir recibo" para reintentar.
export function autoPrintReceipt(paidSale: Sale): void {
  void printReceipt(paidSale.id, { fallback: paidSale }).catch(() => {});
}

// La venta normalmente ya se creó al abrir el modal (con su comanda);
// si esa creación falló, se reintenta acá con el mismo idempotency-key.
function ensureSale(
  sale: Sale | null,
  items: readonly CartLine[],
  idempotencyKey: string,
): Promise<Sale> {
  if (sale) return Promise.resolve(sale);
  return createSale({ type: 'COUNTER', items: cartLinesToCreateItems(items) }, idempotencyKey);
}

async function confirmSplitCheckout(args: {
  sale: Sale | null;
  items: readonly CartLine[];
  idempotencyKey: string;
  splitResult: SplitResult;
}): Promise<PaidCheckout> {
  const created = await ensureSale(args.sale, args.items, args.idempotencyKey);
  const paidSale = await confirmPayment(created.id, { payments: args.splitResult.payments });
  return {
    paidSale,
    success: {
      saleId: paidSale.id,
      receiptNumber: paidSale.receiptNumber,
      turnNumber: paidSale.turnNumber,
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
    turnNumber: null,
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
}): Promise<PaidCheckout> {
  const created = await ensureSale(args.sale, args.items, args.idempotencyKey);
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
      turnNumber: paidSale.turnNumber,
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
  refreshPending: () => void;
  finishPaid: (r: PaidCheckout) => void;
  onSuccess: (s: CheckoutSuccess) => void;
}

// Despacha al flujo de cobro correspondiente. Los side-effects post-pago
// (caja → factura → onSuccess) los ordena finishPaid en el caller.
export async function runConfirmCheckout(d: ConfirmCheckoutDeps): Promise<void> {
  // CUENTA DIVIDIDA (solo online): N partes en una sola confirmación atómica.
  if (d.splitOpen && d.splitResult) {
    d.finishPaid(
      await confirmSplitCheckout({
        sale: d.sale,
        items: d.items,
        idempotencyKey: d.idempotencyKey,
        splitResult: d.splitResult,
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
    }),
  );
}
