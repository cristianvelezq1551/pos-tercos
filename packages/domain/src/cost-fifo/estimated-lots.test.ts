import { describe, expect, it } from 'vitest';
import { buildLedgerSeed, runLedgerFifo, type LedgerMovement } from './run-ledger';

/**
 * §7.v70: una entrada que llegó SIN precio se valora al escribir (último
 * costo conocido) y queda marcada `unitCostEstimated`. El motor tiene que
 * llevar esa marca hasta la venta o la pérdida que consuma ese lote, para que
 * la pantalla diga "estimado" en vez de cobrarlo como exacto — o, peor, como
 * pasaba antes, a $0. Nada de esto cambia un peso del costo: solo dice cuánto
 * de él es provisional.
 */
const T = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, n));
const base = {
  type: 'MANUAL_ADJUSTMENT',
  sourceType: null,
  sourceId: null,
  entityType: 'INGREDIENT' as const,
  ingredientId: 'pan',
  productId: null,
  subproductId: null,
};
const mov = (m: Partial<LedgerMovement> & { id: string; delta: number; createdAt: Date }): LedgerMovement =>
  ({ ...base, unitCost: null, ...m }) as LedgerMovement;

describe('lotes con costo estimado', () => {
  it('lo vendido desde un lote estimado cuesta lo estimado y se declara estimado', () => {
    const L = runLedgerFifo([
      mov({ id: 'e', delta: 10, unitCost: 100, unitCostEstimated: true, createdAt: T(0) }),
      mov({ id: 'v', delta: -4, type: 'SALE', sourceId: 'venta-1', createdAt: T(1) }),
    ]);
    const c = L.saleIngredientCost.get('venta-1')!.get('pan')!;
    expect(c.cost).toBe(400);
    expect(c.unknownQty).toBe(0);
    expect(c.estimatedQty).toBe(4);
  });

  it('una entrada sin la marca no declara nada estimado (comportamiento de siempre)', () => {
    const L = runLedgerFifo([
      mov({ id: 'e', delta: 10, unitCost: 100, createdAt: T(0) }),
      mov({ id: 'v', delta: -4, type: 'SALE', sourceId: 'venta-1', createdAt: T(1) }),
    ]);
    const c = L.saleIngredientCost.get('venta-1')!.get('pan')!;
    expect(c).toMatchObject({ cost: 400, unknownQty: 0, estimatedQty: 0 });
  });

  it('la merma y el faltante que salen de un lote estimado llevan la parte estimada de su costo', () => {
    const L = runLedgerFifo([
      mov({ id: 'real', delta: 5, unitCost: 100, createdAt: T(0) }),
      mov({ id: 'est', delta: 5, unitCost: 120, unitCostEstimated: true, createdAt: T(1) }),
      // La merma consume 8: 5 del lote real y 3 del estimado.
      mov({ id: 'w', delta: -8, type: 'WASTE', createdAt: T(2) }),
      mov({ id: 'f', delta: -2, sourceType: 'stock_count', sourceId: 'conteo-1', createdAt: T(3) }),
    ]);
    const merma = L.waste[0]!;
    expect(merma.cost).toBe(5 * 100 + 3 * 120);
    expect(merma.estimatedCost).toBe(3 * 120);
    const faltante = L.shrinkage[0]!;
    expect(faltante.cost).toBe(2 * 120);
    expect(faltante.estimatedCost).toBe(2 * 120);
  });

  it('el reverso de una venta devuelve el lote CON su marca', () => {
    const L = runLedgerFifo([
      mov({ id: 'e', delta: 10, unitCost: 100, unitCostEstimated: true, createdAt: T(0) }),
      mov({ id: 'v', delta: -4, type: 'SALE', sourceId: 'venta-1', createdAt: T(1) }),
      mov({ id: 'r', delta: 4, type: 'SALE', sourceId: 'venta-1', createdAt: T(2) }),
      mov({ id: 'v2', delta: -10, type: 'SALE', sourceId: 'venta-2', createdAt: T(3) }),
    ]);
    const c = L.saleIngredientCost.get('venta-2')!.get('pan')!;
    expect(c).toMatchObject({ cost: 1000, estimatedQty: 10 });
  });

  it('la marca sobrevive al snapshot: semilla + incremental = replay completo', () => {
    const historia = [
      mov({ id: 'e', delta: 10, unitCost: 100, unitCostEstimated: true, createdAt: T(0) }),
      mov({ id: 'v', delta: -4, type: 'SALE', sourceId: 'venta-1', createdAt: T(10) }),
    ];
    const completo = runLedgerFifo(historia);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(runLedgerFifo([historia[0]!]), T(5).toISOString())));
    expect(seed.lots['INGREDIENT:pan'][0]).toMatchObject({ estimated: true });
    const incremental = runLedgerFifo([historia[1]!], seed);
    expect(incremental.saleIngredientCost.get('venta-1')!.get('pan')).toEqual(
      completo.saleIngredientCost.get('venta-1')!.get('pan'),
    );
    expect(incremental.saleIngredientCost.get('venta-1')!.get('pan')!.estimatedQty).toBe(4);
  });

  it('un subproducto producido con insumo estimado nace estimado', () => {
    const L = runLedgerFifo([
      mov({ id: 'e', delta: 100, unitCost: 10, unitCostEstimated: true, createdAt: T(0) }),
      mov({ id: 'c', delta: -50, type: 'PRODUCTION', sourceType: 'production', sourceId: 'tanda-1', createdAt: T(1) }),
      mov({ id: 'p', delta: 10, type: 'PRODUCTION', sourceType: 'production', sourceId: 'tanda-1', entityType: 'SUBPRODUCT', ingredientId: null, subproductId: 'salsa', createdAt: T(1) }),
      mov({ id: 'v', delta: -2, type: 'SALE', sourceId: 'venta-1', entityType: 'SUBPRODUCT', ingredientId: null, subproductId: 'salsa', createdAt: T(2) }),
    ]);
    const c = L.saleSubproductCost.get('venta-1')!.get('salsa')!;
    expect(c.cost).toBe(2 * 50); // 50 insumos × $10 / 10 unidades = $50/u
    expect(c.estimatedQty).toBe(2);
  });
});
