import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sale } from '@pos-tercos/types';
import type { CartLine } from './cart-types';
import type { CartTotalsResult } from './totals';

/**
 * Mutantes de plata que estos tests matan:
 * - cobrar una CUENTA ABIERTA sin red → encolaría una venta nueva vacía y la
 *   cuenta seguiría viva (doble venta + descuadre).
 * - `amountReceived` mal derivado: en digital debe ir el TOTAL, no lo tecleado
 *   en el campo de efectivo (que puede quedar sucio de un cobro anterior).
 * - una venta que YA existe (cuenta abierta) no debe re-crearse al cobrarla.
 * - el idempotency-key debe llegar al POST /sales — sin él, un reintento por
 *   red intermitente crea dos ventas.
 */

const createSale = vi.fn();
const confirmPayment = vi.fn();
const enqueueOfflineSale = vi.fn();
const getCachedCashierName = vi.fn();

vi.mock('../api/create', () => ({ createSale: (...a: unknown[]) => createSale(...a) }));
vi.mock('../api/confirm-payment', () => ({
  confirmPayment: (...a: unknown[]) => confirmPayment(...a),
}));
vi.mock('../../offline', () => ({
  enqueueOfflineSale: (...a: unknown[]) => enqueueOfflineSale(...a),
  getCachedCashierName: (...a: unknown[]) => getCachedCashierName(...a),
}));

const { runConfirmCheckout, EMPTY_SALE_META } = await import('./checkout-confirm');

const SALE_ID = 'sale-1';
const sale = (over: Partial<Sale> = {}) =>
  ({ id: SALE_ID, receiptNumber: 42, total: 20_000, ...over }) as Sale;

const items: CartLine[] = [
  {
    lineId: 'l1',
    productId: 'p1',
    productName: 'Hamburguesa',
    sizeId: null,
    sizeName: null,
    modifiers: [],
    quantity: 1,
    unitPrice: 20_000,
    notes: null,
  } as unknown as CartLine,
];

const totals = { subtotal: 20_000, discount: 0, total: 20_000, lines: [] } as unknown as CartTotalsResult;

/** Deps base; cada test sobreescribe lo que le importa. */
function deps(over: Record<string, unknown> = {}) {
  return {
    splitOpen: false,
    splitResult: null,
    method: 'CASH' as const,
    cashNum: 50_000,
    total: 20_000,
    offline: false,
    isDigital: false,
    changeDue: 30_000,
    sale: null,
    items,
    totals,
    promos: [],
    idempotencyKey: 'idem-key-1',
    meta: EMPTY_SALE_META,
    refreshPending: vi.fn(),
    finishPaid: vi.fn(),
    onSuccess: vi.fn(),
    ...over,
  } as Parameters<typeof runConfirmCheckout>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  createSale.mockResolvedValue(sale());
  confirmPayment.mockResolvedValue(sale({ total: 20_000 }));
  enqueueOfflineSale.mockResolvedValue({ provisionalNumber: 'OFF-7' });
  getCachedCashierName.mockResolvedValue('Cajero Dev');
});

describe('runConfirmCheckout — cuenta abierta sin conexión', () => {
  it('se rechaza con mensaje claro y NO encola nada', async () => {
    const d = deps({ offline: true, sale: sale() });
    await expect(runConfirmCheckout(d)).rejects.toThrow(/Sin conexión.*cuenta abierta/s);
    expect(enqueueOfflineSale).not.toHaveBeenCalled();
    expect(createSale).not.toHaveBeenCalled();
  });
});

describe('runConfirmCheckout — cobro ONLINE simple', () => {
  it('crea la venta con el idempotency-key y la cobra', async () => {
    const d = deps();
    await runConfirmCheckout(d);
    expect(createSale).toHaveBeenCalledWith(expect.objectContaining({ type: 'COUNTER' }), 'idem-key-1');
    expect(confirmPayment).toHaveBeenCalledWith(SALE_ID, {
      method: 'CASH',
      amountReceived: 50_000,
      digitalDoubleVerified: undefined,
    });
    expect(d.finishPaid).toHaveBeenCalledTimes(1);
    expect(d.onSuccess).not.toHaveBeenCalled();
  });

  it('en efectivo manda lo RECIBIDO y reporta el vuelto', async () => {
    const d = deps({ cashNum: 50_000, total: 20_000, changeDue: 30_000 });
    await runConfirmCheckout(d);
    const { success } = (d.finishPaid as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(success.changeDue).toBe(30_000);
    expect(success.paymentMethod).toBe('CASH');
    expect(success.receiptNumber).toBe(42);
  });

  it('en digital manda el TOTAL (ignora el campo de efectivo) y marca la doble verificación', async () => {
    const d = deps({ method: 'TRANSFER', isDigital: true, cashNum: 999_999, changeDue: 0 });
    await runConfirmCheckout(d);
    expect(confirmPayment).toHaveBeenCalledWith(SALE_ID, {
      method: 'TRANSFER',
      amountReceived: 20_000,
      digitalDoubleVerified: true,
    });
  });

  it('una venta que YA existe (cuenta abierta) se cobra sin re-crearla', async () => {
    const d = deps({ sale: sale({ id: 'tab-9' }) });
    await runConfirmCheckout(d);
    expect(createSale).not.toHaveBeenCalled();
    expect(confirmPayment).toHaveBeenCalledWith('tab-9', expect.anything());
  });

  it('propaga el fallo del cobro (el caller decide si reintenta)', async () => {
    confirmPayment.mockRejectedValue(new Error('Stock insuficiente'));
    const d = deps();
    await expect(runConfirmCheckout(d)).rejects.toThrow('Stock insuficiente');
    expect(d.finishPaid).not.toHaveBeenCalled();
  });
});

describe('runConfirmCheckout — descuentos manuales (#5b)', () => {
  it('manda el motivo solo cuando hay descuento manual', async () => {
    const d = deps({
      meta: {
        customerName: '  Ana  ',
        lineDiscounts: {},
        orderDiscount: { kind: 'PERCENT', value: 10 },
        discountReason: 'Cliente frecuente',
      },
    });
    await runConfirmCheckout(d);
    expect(createSale).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Ana',
        orderDiscount: { kind: 'PERCENT', value: 10 },
        discountReason: 'Cliente frecuente',
      }),
      'idem-key-1',
    );
  });

  it('sin descuento manual NO viaja discountReason (aunque quede texto viejo en el estado)', async () => {
    const d = deps({
      meta: {
        customerName: null,
        lineDiscounts: {},
        orderDiscount: null,
        discountReason: 'motivo huérfano',
      },
    });
    await runConfirmCheckout(d);
    expect(createSale.mock.calls[0][0].discountReason).toBeUndefined();
  });

  it('un nombre de cliente en blanco no viaja como string vacío', async () => {
    const d = deps({ meta: { ...EMPTY_SALE_META, customerName: '   ' } });
    await runConfirmCheckout(d);
    expect(createSale.mock.calls[0][0].customerName).toBeUndefined();
  });
});

describe('runConfirmCheckout — cuenta dividida', () => {
  it('confirma las N partes en UNA sola llamada atómica', async () => {
    const payments = [
      { method: 'CASH', amount: 10_000, amountReceived: 10_000 },
      { method: 'TRANSFER', amount: 10_000, digitalVerified: true },
    ];
    const d = deps({ splitOpen: true, splitResult: { payments, changeDue: 0 } });
    await runConfirmCheckout(d);
    expect(confirmPayment).toHaveBeenCalledTimes(1);
    expect(confirmPayment).toHaveBeenCalledWith(SALE_ID, { payments });
    const { success } = (d.finishPaid as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(success.paymentMethod).toBe('Dividido (2 pagos)');
  });

  it('el flag splitOpen sin resultado cae al cobro simple (no cobra a medias)', async () => {
    const d = deps({ splitOpen: true, splitResult: null });
    await runConfirmCheckout(d);
    expect(confirmPayment).toHaveBeenCalledWith(SALE_ID, expect.objectContaining({ method: 'CASH' }));
  });
});

describe('runConfirmCheckout — venta OFFLINE', () => {
  it('encola la venta y devuelve el recibo provisional sin tocar el backend', async () => {
    const d = deps({ offline: true });
    await runConfirmCheckout(d);
    expect(createSale).not.toHaveBeenCalled();
    expect(confirmPayment).not.toHaveBeenCalled();
    expect(enqueueOfflineSale).toHaveBeenCalledTimes(1);
    const success = (d.onSuccess as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(success.provisionalNumber).toBe('OFF-7');
    expect(success.receipt).toBeDefined();
    expect(success.saleId).toBeUndefined();
  });

  it('refresca la bandeja de pendientes tras encolar', async () => {
    const d = deps({ offline: true });
    await runConfirmCheckout(d);
    expect(d.refreshPending).toHaveBeenCalledTimes(1);
    expect(d.finishPaid).not.toHaveBeenCalled();
  });

  it('marca la parte digital como verificada offline', async () => {
    const d = deps({ offline: true, method: 'TRANSFER', isDigital: true });
    await runConfirmCheckout(d);
    expect(enqueueOfflineSale.mock.calls[0][0].payment).toMatchObject({
      method: 'TRANSFER',
      amountReceived: 20_000,
      offlineVerified: true,
    });
  });
});
