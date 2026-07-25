import { describe, expect, it } from 'vitest';
import { CreateInventoryMovementSchema, CreateStockCountSchema } from './inventory';

const A = '33333333-3333-4333-8333-333333333333';
const B = '44444444-4444-4444-8444-444444444444';

function reasons(r: { success: boolean; error?: { issues: { message: string }[] } }) {
  return r.success ? '' : r.error!.issues.map((i) => i.message).join(' | ');
}

describe('CreateInventoryMovementSchema — XOR polimórfico', () => {
  it.each([
    ['INGREDIENT', 'ingredientId'],
    ['PRODUCT', 'productId'],
    ['SUBPRODUCT', 'subproductId'],
  ] as const)('%s acepta solo su propio id', (entityType, key) => {
    const r = CreateInventoryMovementSchema.safeParse({ entityType, [key]: A, delta: 5 });
    expect(r.success).toBe(true);
  });

  it.each(['INGREDIENT', 'PRODUCT', 'SUBPRODUCT'] as const)(
    '%s falla si falta su id',
    (entityType) => {
      const r = CreateInventoryMovementSchema.safeParse({ entityType, delta: 5 });
      expect(r.success).toBe(false);
      expect(reasons(r)).toMatch(/required when entityType/);
    },
  );

  it('rechaza mandar el id de OTRA entidad además del propio', () => {
    const r = CreateInventoryMovementSchema.safeParse({
      entityType: 'INGREDIENT',
      ingredientId: A,
      productId: B,
      delta: 5,
    });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/productId must be omitted/);
  });

  it('rechaza delta = 0 (espeja el CHECK de la DB)', () => {
    const r = CreateInventoryMovementSchema.safeParse({
      entityType: 'INGREDIENT',
      ingredientId: A,
      delta: 0,
    });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/delta must not be zero/);
  });

  it('acepta delta negativo (merma / ajuste a la baja)', () => {
    const r = CreateInventoryMovementSchema.safeParse({
      entityType: 'INGREDIENT',
      ingredientId: A,
      delta: -2.5,
      type: 'WASTE',
    });
    expect(r.success).toBe(true);
  });

  it('el tipo por defecto es MANUAL_ADJUSTMENT', () => {
    const r = CreateInventoryMovementSchema.parse({
      entityType: 'PRODUCT',
      productId: A,
      delta: 1,
    });
    expect(r.type).toBe('MANUAL_ADJUSTMENT');
  });

  it('no acepta tipos que solo genera el sistema (PURCHASE/SALE/PRODUCTION)', () => {
    for (const type of ['PURCHASE', 'SALE', 'PRODUCTION']) {
      const r = CreateInventoryMovementSchema.safeParse({
        entityType: 'PRODUCT',
        productId: A,
        delta: 1,
        type,
      });
      expect(r.success, type).toBe(false);
    }
  });

  it('rechaza unitCost negativo', () => {
    const r = CreateInventoryMovementSchema.safeParse({
      entityType: 'PRODUCT',
      productId: A,
      delta: 1,
      unitCost: -1,
    });
    expect(r.success).toBe(false);
  });
});

describe('CreateStockCountSchema — conteo físico', () => {
  it('exige el id que corresponde al entityType', () => {
    const r = CreateStockCountSchema.safeParse({ entityType: 'SUBPRODUCT', countedQty: 3 });
    expect(r.success).toBe(false);
    expect(reasons(r)).toMatch(/subproductId es requerido/);
  });

  it('acepta contar 0 (se acabó)', () => {
    const r = CreateStockCountSchema.safeParse({
      entityType: 'INGREDIENT',
      ingredientId: A,
      countedQty: 0,
    });
    expect(r.success).toBe(true);
  });

  it('rechaza cantidad negativa', () => {
    const r = CreateStockCountSchema.safeParse({
      entityType: 'INGREDIENT',
      ingredientId: A,
      countedQty: -1,
    });
    expect(r.success).toBe(false);
  });
});
