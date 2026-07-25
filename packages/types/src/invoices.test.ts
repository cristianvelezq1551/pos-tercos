import { describe, expect, it } from 'vitest';
import {
  ConfirmInvoiceItemSchema,
  ConfirmInvoicePaymentSchema,
  PendingPaymentProofKeySchema,
} from './invoices';

/**
 * Confirmar una factura MUEVE INVENTARIO Y PLATA: crea los movimientos PURCHASE
 * (base del FIFO) y, si trae pago, descuenta del bolsillo de tesorería. Estas
 * validaciones son la última barrera antes de eso.
 */

const UUID = '66666666-6666-4666-8666-666666666666';

function reasons(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? '' : r.error!.issues.map((i) => i.message).join(' | ');
}

const item = {
  descriptionRaw: 'PECHUGA POLLO X 10KG',
  quantity: 2,
  unit: 'caja',
  unitPrice: 48_500,
  total: 97_000,
};

describe('ConfirmInvoiceItemSchema — a qué entidad se le carga el stock', () => {
  it('INGREDIENT exige ingredientId', () => {
    const r = ConfirmInvoiceItemSchema.safeParse({ ...item, entityType: 'INGREDIENT' });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/Falta indicar a qué insumo/);
  });

  it('PRODUCT exige productId', () => {
    const r = ConfirmInvoiceItemSchema.safeParse({ ...item, entityType: 'PRODUCT' });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/Falta indicar a qué producto/);
  });

  it('acepta cada tipo con su id', () => {
    expect(
      ConfirmInvoiceItemSchema.safeParse({ ...item, entityType: 'INGREDIENT', ingredientId: UUID })
        .success,
    ).toBe(true);
    expect(
      ConfirmInvoiceItemSchema.safeParse({ ...item, entityType: 'PRODUCT', productId: UUID })
        .success,
    ).toBe(true);
  });

  it('no acepta SUBPRODUCT (los subproductos se producen, no se compran)', () => {
    const r = ConfirmInvoiceItemSchema.safeParse({
      ...item,
      entityType: 'SUBPRODUCT',
      subproductId: UUID,
    });
    expect(r.success).toBe(false);
  });

  it('rechaza cantidad 0 (una línea sin cantidad no mueve stock)', () => {
    expect(
      ConfirmInvoiceItemSchema.safeParse({
        ...item,
        quantity: 0,
        entityType: 'INGREDIENT',
        ingredientId: UUID,
      }).success,
    ).toBe(false);
  });

  it('acepta precio 0 (bonificación del proveedor) pero no negativo', () => {
    const build = (unitPrice: number) =>
      ConfirmInvoiceItemSchema.safeParse({
        ...item,
        unitPrice,
        entityType: 'INGREDIENT',
        ingredientId: UUID,
      }).success;
    expect(build(0)).toBe(true);
    expect(build(-1)).toBe(false);
  });

  it('rechaza baseFactor 0 (rompería la conversión FIFO)', () => {
    expect(
      ConfirmInvoiceItemSchema.safeParse({
        ...item,
        baseFactor: 0,
        entityType: 'INGREDIENT',
        ingredientId: UUID,
      }).success,
    ).toBe(false);
  });
});

describe('ConfirmInvoicePaymentSchema — el comprobante es obligatorio', () => {
  const proofKey = `invoice-payments/pending/${UUID}.jpg`;
  const pago = { cashAmount: 97_000, bankAmount: 0 };

  it('rechaza pagar SIN comprobante', () => {
    const r = ConfirmInvoicePaymentSchema.safeParse(pago);
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/Falta el comprobante/);
  });

  it('rechaza mandar los DOS comprobantes', () => {
    const r = ConfirmInvoicePaymentSchema.safeParse({
      ...pago,
      proofStorageKey: proofKey,
      useInvoicePhotoAsProof: true,
    });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/no ambas/);
  });

  it('acepta el comprobante subido a mano', () => {
    expect(
      ConfirmInvoicePaymentSchema.safeParse({ ...pago, proofStorageKey: proofKey }).success,
    ).toBe(true);
  });

  it('acepta usar la foto de la factura (flujo IA)', () => {
    expect(
      ConfirmInvoicePaymentSchema.safeParse({ ...pago, useInvoicePhotoAsProof: true }).success,
    ).toBe(true);
  });

  it('useInvoicePhotoAsProof=false NO cuenta como comprobante', () => {
    expect(
      ConfirmInvoicePaymentSchema.safeParse({ ...pago, useInvoicePhotoAsProof: false }).success,
    ).toBe(false);
  });

  it('rechaza montos negativos en cualquier bolsillo', () => {
    expect(
      ConfirmInvoicePaymentSchema.safeParse({
        cashAmount: -1,
        bankAmount: 0,
        useInvoicePhotoAsProof: true,
      }).success,
    ).toBe(false);
  });

  it('exige la fecha en formato YYYY-MM-DD', () => {
    const build = (paidAt: string) =>
      ConfirmInvoicePaymentSchema.safeParse({ ...pago, useInvoicePhotoAsProof: true, paidAt })
        .success;
    expect(build('2026-07-22')).toBe(true);
    expect(build('22/07/2026')).toBe(false);
    expect(build('2026-07-22T10:00:00Z')).toBe(false);
  });
});

describe('PendingPaymentProofKeySchema — no aceptar la key de otro recurso', () => {
  it('acepta una key del prefijo pendiente', () => {
    expect(PendingPaymentProofKeySchema.safeParse(`invoice-payments/pending/${UUID}.jpg`).success).toBe(
      true,
    );
  });

  it.each([
    ['foto de factura', `invoices/${UUID}.jpg`],
    ['comprobante ya asociado', `invoice-payments/${UUID}.jpg`],
    ['escape de directorio', `invoice-payments/pending/../../${UUID}.jpg`],
    ['sin extensión', `invoice-payments/pending/${UUID}`],
    ['id que no es uuid', 'invoice-payments/pending/algo.jpg'],
  ])('rechaza %s', (_label, key) => {
    expect(PendingPaymentProofKeySchema.safeParse(key).success).toBe(false);
  });
});
