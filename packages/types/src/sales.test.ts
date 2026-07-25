import { describe, expect, it } from 'vitest';
import {
  ChangeSalePaymentSchema,
  ConfirmPaymentSchema,
  CreateSaleSchema,
  EditSaleItemsSchema,
  ManualDiscountSchema,
  MAX_SPLIT_PARTS,
  SalePaymentInputSchema,
  isWebSaleType,
} from './sales';

const UUID = '11111111-1111-4111-8111-111111111111';
const line = (extra: Record<string, unknown> = {}) => ({
  productId: UUID,
  quantity: 1,
  ...extra,
});

/** Mensajes de todos los issues, para asertar el motivo del rechazo. */
function errorsOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : result.error!.issues.map((i) => i.message).join(' | ');
}

describe('isWebSaleType', () => {
  it('reconoce los dos tipos de pedido web y excluye mostrador', () => {
    expect(isWebSaleType('WEB_PICKUP')).toBe(true);
    expect(isWebSaleType('WEB_DELIVERY')).toBe(true);
    expect(isWebSaleType('COUNTER')).toBe(false);
  });
});

describe('ManualDiscountSchema', () => {
  it('acepta un porcentaje dentro de rango', () => {
    expect(ManualDiscountSchema.parse({ kind: 'PERCENT', value: 100 })).toEqual({
      kind: 'PERCENT',
      value: 100,
    });
  });

  it('rechaza un porcentaje mayor a 100', () => {
    const r = ManualDiscountSchema.safeParse({ kind: 'PERCENT', value: 100.01 });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/no puede superar 100/);
  });

  it('acepta un monto fijo alto (el tope real lo pone el total de la venta)', () => {
    expect(ManualDiscountSchema.safeParse({ kind: 'FIXED', value: 999_999 }).success).toBe(true);
  });

  it('rechaza valor 0 o negativo en cualquier tipo', () => {
    expect(ManualDiscountSchema.safeParse({ kind: 'FIXED', value: 0 }).success).toBe(false);
    expect(ManualDiscountSchema.safeParse({ kind: 'PERCENT', value: -5 }).success).toBe(false);
  });
});

describe('CreateSaleSchema — descuento manual exige motivo', () => {
  it('rechaza descuento sobre el total sin discountReason', () => {
    const r = CreateSaleSchema.safeParse({
      items: [line()],
      orderDiscount: { kind: 'PERCENT', value: 10 },
    });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/motivo/i);
  });

  it('rechaza descuento por LÍNEA sin discountReason', () => {
    const r = CreateSaleSchema.safeParse({
      items: [line({ manualDiscount: { kind: 'FIXED', value: 500 } })],
    });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/motivo/i);
  });

  it('acepta el descuento cuando viene con motivo', () => {
    const r = CreateSaleSchema.safeParse({
      items: [line()],
      orderDiscount: { kind: 'FIXED', value: 1000 },
      discountReason: 'Cliente frecuente',
    });
    expect(r.success).toBe(true);
  });

  it('una venta sin descuentos no necesita motivo', () => {
    const r = CreateSaleSchema.safeParse({ items: [line()] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.type).toBe('COUNTER');
  });
});

describe('CreateSaleSchema — cuenta abierta (#3)', () => {
  it('exige nombre del cliente', () => {
    const r = CreateSaleSchema.safeParse({ items: [line()], openTab: true });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/nombre del cliente/i);
  });

  it('solo la permite en mostrador', () => {
    const r = CreateSaleSchema.safeParse({
      type: 'WEB_PICKUP',
      items: [line()],
      openTab: true,
      customerName: 'Ana',
      customerPhone: '+573001112233',
    });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/mostrador/i);
  });

  it('acepta cuenta abierta de mostrador con cliente', () => {
    const r = CreateSaleSchema.safeParse({
      items: [line()],
      openTab: true,
      customerName: 'Ana',
    });
    expect(r.success).toBe(true);
  });
});

describe('CreateSaleSchema — validación de líneas', () => {
  it('exige al menos una línea', () => {
    expect(CreateSaleSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it('rechaza cantidad no entera o no positiva', () => {
    expect(CreateSaleSchema.safeParse({ items: [line({ quantity: 1.5 })] }).success).toBe(false);
    expect(CreateSaleSchema.safeParse({ items: [line({ quantity: 0 })] }).success).toBe(false);
  });
});

describe('ConfirmPaymentSchema — simple XOR dividido', () => {
  it('rechaza mandar los dos modos a la vez', () => {
    const r = ConfirmPaymentSchema.safeParse({
      method: 'CASH',
      amountReceived: 10_000,
      payments: [
        { method: 'CASH', amount: 5000, amountReceived: 5000 },
        { method: 'TRANSFER', amount: 5000 },
      ],
    });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/no ambos/i);
  });

  it('rechaza no mandar ninguno', () => {
    const r = ConfirmPaymentSchema.safeParse({});
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/no ambos/i);
  });

  it('el pago simple exige amountReceived', () => {
    const r = ConfirmPaymentSchema.safeParse({ method: 'CASH' });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/amountReceived/);
  });

  it('acepta pago simple completo', () => {
    expect(
      ConfirmPaymentSchema.safeParse({ method: 'CASH', amountReceived: 20_000 }).success,
    ).toBe(true);
  });

  it('la cuenta dividida exige al menos 2 partes', () => {
    const r = ConfirmPaymentSchema.safeParse({
      payments: [{ method: 'CASH', amount: 5000, amountReceived: 5000 }],
    });
    expect(r.success).toBe(false);
  });

  it(`la cuenta dividida topa en ${MAX_SPLIT_PARTS} partes`, () => {
    const part = { method: 'TRANSFER' as const, amount: 1000, digitalVerified: true };
    const ok = ConfirmPaymentSchema.safeParse({
      payments: Array.from({ length: MAX_SPLIT_PARTS }, () => ({ ...part })),
    });
    const tooMany = ConfirmPaymentSchema.safeParse({
      payments: Array.from({ length: MAX_SPLIT_PARTS + 1 }, () => ({ ...part })),
    });
    expect(ok.success).toBe(true);
    expect(tooMany.success).toBe(false);
  });
});

describe('SalePaymentInputSchema — parte de una cuenta dividida', () => {
  it('rechaza efectivo recibido menor que la parte a cubrir', () => {
    const r = SalePaymentInputSchema.safeParse({
      method: 'CASH',
      amount: 10_000,
      amountReceived: 9_999,
    });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/no puede ser menor/i);
  });

  it('acepta efectivo recibido mayor (hay vuelto)', () => {
    expect(
      SalePaymentInputSchema.safeParse({
        method: 'CASH',
        amount: 10_000,
        amountReceived: 20_000,
      }).success,
    ).toBe(true);
  });

  it('rechaza monto 0 o negativo', () => {
    expect(SalePaymentInputSchema.safeParse({ method: 'CASH', amount: 0 }).success).toBe(false);
    expect(SalePaymentInputSchema.safeParse({ method: 'CASH', amount: -1 }).success).toBe(false);
  });
});

describe('ChangeSalePaymentSchema — reclasificar el pago', () => {
  it('rechaza ambos modos y ninguno', () => {
    expect(ChangeSalePaymentSchema.safeParse({}).success).toBe(false);
    expect(
      ChangeSalePaymentSchema.safeParse({
        method: 'CASH',
        payments: [
          { method: 'CASH', amount: 1 },
          { method: 'CASH', amount: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('acepta el modo simple', () => {
    expect(ChangeSalePaymentSchema.safeParse({ method: 'TRANSFER' }).success).toBe(true);
  });
});

describe('EditSaleItemsSchema', () => {
  it('exige motivo cuando la edición AGREGA un descuento manual', () => {
    const r = EditSaleItemsSchema.safeParse({
      items: [line()],
      orderDiscount: { kind: 'PERCENT', value: 10 },
    });
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toMatch(/motivo/i);
  });

  it('QUITAR el descuento (null) no exige motivo', () => {
    const r = EditSaleItemsSchema.safeParse({ items: [line()], orderDiscount: null });
    expect(r.success).toBe(true);
  });

  it('conservar el descuento actual (ausente) no exige motivo', () => {
    expect(EditSaleItemsSchema.safeParse({ items: [line()] }).success).toBe(true);
  });
});
