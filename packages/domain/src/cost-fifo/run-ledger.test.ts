import { describe, expect, it } from 'vitest';
import { runLedgerFifo, type LedgerMovement } from './run-ledger';

let seq = 0;
function mov(p: Partial<LedgerMovement> & { delta: number }): LedgerMovement {
  seq += 1;
  const entityType = p.entityType ?? 'INGREDIENT';
  return {
    id: p.id ?? `m${seq}`,
    createdAt: p.createdAt ?? new Date(2026, 0, 1, 0, seq),
    type: p.type ?? (p.delta > 0 ? 'PURCHASE' : 'SALE'),
    unitCost: p.unitCost ?? null,
    sourceType: p.sourceType ?? (p.type === 'SALE' || (!p.type && p.delta < 0) ? 'sale' : null),
    sourceId: p.sourceId ?? null,
    entityType,
    ingredientId: entityType === 'INGREDIENT' ? (p.ingredientId ?? 'ing1') : null,
    productId: entityType === 'PRODUCT' ? (p.productId ?? 'prod1') : null,
    subproductId: entityType === 'SUBPRODUCT' ? (p.subproductId ?? 'sub1') : null,
    delta: p.delta,
  };
}

describe('runLedgerFifo · consumo básico', () => {
  it('costea una venta contra un único lote', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 8000 }),
      mov({ delta: -2, type: 'SALE', sourceId: 'sale1' }),
    ]);
    const cq = r.saleIngredientCost.get('sale1')?.get('ing1');
    expect(cq).toEqual({ cost: 16000, qty: 2, unknownQty: 0 });
  });

  it('cruza lotes en orden FIFO (el viejo primero)', () => {
    const r = runLedgerFifo([
      mov({ delta: 5, unitCost: 10 }),
      mov({ delta: 5, unitCost: 20 }),
      mov({ delta: -7, type: 'SALE', sourceId: 'sale1' }),
    ]);
    // 5×10 + 2×20 = 90
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')?.cost).toBe(90);
  });

  it('lote sin costo → unknownQty, nunca $0 asumido', () => {
    const r = runLedgerFifo([
      mov({ delta: 5, unitCost: null }),
      mov({ delta: -3, type: 'SALE', sourceId: 'sale1' }),
    ]);
    const cq = r.saleIngredientCost.get('sale1')?.get('ing1');
    expect(cq?.cost).toBe(0);
    expect(cq?.unknownQty).toBe(3);
  });

  it('consumo sin stock disponible → todo unknownQty', () => {
    const r = runLedgerFifo([mov({ delta: -4, type: 'SALE', sourceId: 'sale1' })]);
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')?.unknownQty).toBe(4);
  });

  it('reventa directa se atribuye en saleProductCost', () => {
    const r = runLedgerFifo([
      mov({ delta: 24, unitCost: 1500, entityType: 'PRODUCT' }),
      mov({ delta: -3, type: 'SALE', sourceId: 'sale1', entityType: 'PRODUCT' }),
    ]);
    expect(r.saleProductCost.get('sale1')?.get('prod1')?.cost).toBe(4500);
  });

  it('WASTE se valoriza con timestamp y no se atribuye a ventas', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 30 }),
      mov({ delta: -2, type: 'WASTE', sourceType: null }),
    ]);
    expect(r.waste).toHaveLength(1);
    expect(r.waste[0]!.cost).toBe(60);
    expect(r.saleIngredientCost.size).toBe(0);
  });

  it('MANUAL_ADJUSTMENT negativo consume del libro sin atribuirse', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 30 }),
      mov({ delta: -4, type: 'MANUAL_ADJUSTMENT', sourceType: 'stock_count', sourceId: 'c1' }),
    ]);
    expect(r.saleIngredientCost.size).toBe(0);
    expect(r.waste).toHaveLength(0);
    expect(r.cortesia).toHaveLength(0);
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(6);
  });

  it('cortesía: consumo a costo FIFO en su bucket, NO en COGS de venta ni merma', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 50 }),
      mov({ delta: 5, unitCost: 80 }),
      // cortesía aprobada consume 3 (cruza lotes): 3×50 = 150
      mov({ delta: -3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor1' }),
    ]);
    expect(r.cortesia).toHaveLength(1);
    expect(r.cortesia[0]!.cost).toBe(150);
    expect(r.cortesia[0]!.unknownQty).toBe(0);
    expect(r.cortesiaCostBySource.get('cor1')).toEqual({ cost: 150, unknownQty: 0 });
    expect(r.saleIngredientCost.size).toBe(0); // no es venta
    expect(r.waste).toHaveLength(0); // no es merma
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(12); // 15 − 3
  });

  it('cortesía: el costo por solicitud suma todos sus movimientos (insumos + sub)', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 100, ingredientId: 'pan' }),
      mov({ delta: 10, unitCost: 200, entityType: 'SUBPRODUCT', subproductId: 'carne' }),
      // una cortesía consume 1 pan + 1 carne (mismo sourceId)
      mov({ delta: -1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor9', ingredientId: 'pan' }),
      mov({ delta: -1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor9', entityType: 'SUBPRODUCT', subproductId: 'carne' }),
    ]);
    expect(r.cortesiaCostBySource.get('cor9')).toEqual({ cost: 300, unknownQty: 0 });
  });

  it('cortesía sin stock suficiente → unknownQty (nunca asume $0)', () => {
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 50 }),
      mov({ delta: -3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor1' }),
    ]);
    expect(r.cortesia[0]!.cost).toBe(50);
    expect(r.cortesia[0]!.unknownQty).toBe(2);
  });
});

describe('runLedgerFifo · anulaciones', () => {
  it('el reverso re-inyecta los lotes y deja la venta con costo neto cero', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 10 }),
      mov({ delta: -3, type: 'SALE', sourceId: 'sale1' }),
      // void: reverso compensatorio
      mov({ delta: 3, type: 'SALE', sourceId: 'sale1' }),
      // otra venta consume — debe costear como si la primera nunca pasó
      mov({ delta: -10, type: 'SALE', sourceId: 'sale2' }),
    ]);
    const voided = r.saleIngredientCost.get('sale1')?.get('ing1');
    expect(voided?.cost).toBe(0); // 30 − 30
    const next = r.saleIngredientCost.get('sale2')?.get('ing1');
    expect(next).toEqual({ cost: 100, qty: 10, unknownQty: 0 });
  });
});

describe('runLedgerFifo · producción (cruce de stockables)', () => {
  const PROD = { sourceType: 'production', sourceId: 'run1' };

  it('la tanda crea el lote del subproducto con costo = insumos / cantidad', () => {
    const r = runLedgerFifo([
      mov({ delta: 1000, unitCost: 2 }), // 1000g a $2/g
      mov({ delta: -500, type: 'PRODUCTION', ...PROD }), // consume 500g = $1000
      mov({ delta: 10, type: 'PRODUCTION', entityType: 'SUBPRODUCT', ...PROD }), // produce 10 uds
    ]);
    // lote del subproducto: $1000 / 10 = $100/u
    expect(r.remaining.get('SUBPRODUCT:sub1')).toEqual({ qty: 10, value: 1000, unknownQty: 0 });
  });

  it('una venta posterior consume el lote producido con su costo FIFO', () => {
    const r = runLedgerFifo([
      mov({ delta: 1000, unitCost: 2 }),
      mov({ delta: -500, type: 'PRODUCTION', ...PROD }),
      mov({ delta: 10, type: 'PRODUCTION', entityType: 'SUBPRODUCT', ...PROD }),
      mov({ delta: -2, type: 'SALE', sourceId: 'sale1', entityType: 'SUBPRODUCT' }),
    ]);
    expect(r.saleSubproductCost.get('sale1')?.get('sub1')?.cost).toBe(200); // 2 × $100
  });

  it('sub-subproducto: el costo de B se propaga al lote de A', () => {
    const r = runLedgerFifo([
      mov({ delta: 1000, unitCost: 1 }),
      // Producir B: 200g de insumo → 4 uds de B ($50/u)
      mov({ delta: -200, type: 'PRODUCTION', sourceType: 'production', sourceId: 'runB' }),
      mov({ delta: 4, type: 'PRODUCTION', entityType: 'SUBPRODUCT', subproductId: 'B', sourceType: 'production', sourceId: 'runB' }),
      // Producir A: consume 2 uds de B → 1 ud de A ($100/u)
      mov({ delta: -2, type: 'PRODUCTION', entityType: 'SUBPRODUCT', subproductId: 'B', sourceType: 'production', sourceId: 'runA' }),
      mov({ delta: 1, type: 'PRODUCTION', entityType: 'SUBPRODUCT', subproductId: 'A', sourceType: 'production', sourceId: 'runA' }),
    ]);
    expect(r.remaining.get('SUBPRODUCT:A')).toEqual({ qty: 1, value: 100, unknownQty: 0 });
  });

  it('si los insumos no tienen costo, el lote producido queda sin costo (no $0)', () => {
    const r = runLedgerFifo([
      mov({ delta: 500, unitCost: null }),
      mov({ delta: -500, type: 'PRODUCTION', ...PROD }),
      mov({ delta: 10, type: 'PRODUCTION', entityType: 'SUBPRODUCT', ...PROD }),
      mov({ delta: -2, type: 'SALE', sourceId: 'sale1', entityType: 'SUBPRODUCT' }),
    ]);
    expect(r.saleSubproductCost.get('sale1')?.get('sub1')?.unknownQty).toBe(2);
    expect(r.remaining.get('SUBPRODUCT:sub1')?.unknownQty).toBe(8);
  });
});

describe('runLedgerFifo · desempate por timestamp idéntico (causalidad)', () => {
  // Dos transacciones distintas (producción vs venta/compra) pueden caer en el
  // MISMO milisegundo (now() de Postgres). El orden en el array entonces lo
  // decide el UUID (arbitrario). El replay debe respetar la causalidad física:
  // las ENTRADAS y las PRODUCCIONES materializan stock ANTES de que un consumo
  // del mismo instante lo tome. Sin esto, una venta podía costear contra un lote
  // inexistente → unknownQty espurio.

  it('venta en el MISMO ms que su producción: la venta ve el lote producido', () => {
    const T0 = new Date(2026, 5, 1, 10, 0, 0); // compra del insumo, antes
    const T = new Date(2026, 5, 1, 12, 0, 0); // producción + venta, mismo instante
    const PROD = { sourceType: 'production', sourceId: 'runX' };
    // La VENTA aparece ANTES que la producción en el array (peor caso de UUID).
    const r = runLedgerFifo([
      mov({ delta: 1000, unitCost: 2, createdAt: T0 }),
      mov({ delta: -2, type: 'SALE', sourceId: 'sale1', entityType: 'SUBPRODUCT', createdAt: T }),
      mov({ delta: -500, type: 'PRODUCTION', ...PROD, createdAt: T }),
      mov({ delta: 10, type: 'PRODUCTION', entityType: 'SUBPRODUCT', ...PROD, createdAt: T }),
    ]);
    // 2 uds × ($1000/10) = $200, nada desconocido.
    expect(r.saleSubproductCost.get('sale1')?.get('sub1')).toEqual({
      cost: 200,
      qty: 2,
      unknownQty: 0,
    });
  });

  it('compra del insumo en el MISMO ms que la producción que lo consume', () => {
    const T = new Date(2026, 5, 1, 12, 0, 0);
    const PROD = { sourceType: 'production', sourceId: 'runY' };
    // La PRODUCCIÓN aparece ANTES que la compra en el array (peor caso).
    const r = runLedgerFifo([
      mov({ delta: -500, type: 'PRODUCTION', ...PROD, createdAt: T }),
      mov({ delta: 10, type: 'PRODUCTION', entityType: 'SUBPRODUCT', ...PROD, createdAt: T }),
      mov({ delta: 1000, unitCost: 2, createdAt: T }),
    ]);
    // El lote producido toma el costo del insumo comprado en el mismo instante.
    expect(r.remaining.get('SUBPRODUCT:sub1')).toEqual({ qty: 10, value: 1000, unknownQty: 0 });
  });
});

describe('runLedgerFifo · remaining', () => {
  it('valoriza lo que queda por lote', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 10 }),
      mov({ delta: 10, unitCost: 20 }),
      mov({ delta: -12, type: 'SALE', sourceId: 's1' }),
    ]);
    // quedan 8 del lote de $20
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 8, value: 160, unknownQty: 0 });
  });
});

describe('runLedgerFifo · producción con costo mixto (parcial)', () => {
  it('preserva el costo conocido cuando un insumo no tiene costo (no lo descarta)', () => {
    const r = runLedgerFifo([
      // pollo sin costo (INITIAL), pimienta con costo
      mov({ delta: 100, type: 'INITIAL', unitCost: null, ingredientId: 'pollo' }),
      mov({ delta: 10, type: 'PURCHASE', unitCost: 8.5, ingredientId: 'pimienta' }),
      // tanda de producción p1: consume 100 pollo + 10 pimienta → 1 subproducto
      mov({ delta: -100, type: 'PRODUCTION', sourceType: 'production', sourceId: 'p1', ingredientId: 'pollo' }),
      mov({ delta: -10, type: 'PRODUCTION', sourceType: 'production', sourceId: 'p1', ingredientId: 'pimienta' }),
      mov({ delta: 1, type: 'PRODUCTION', sourceType: 'production', sourceId: 'p1', entityType: 'SUBPRODUCT', subproductId: 'sub' }),
      // vender el subproducto entero
      mov({ delta: -1, type: 'SALE', sourceId: 'sale1', entityType: 'SUBPRODUCT', subproductId: 'sub' }),
    ]);
    const cq = r.saleSubproductCost.get('sale1')?.get('sub');
    expect(cq).toBeDefined();
    // El costo conocido de la pimienta ($85) se preserva (antes el lote entero
    // quedaba null → $0, subestimando el COGS).
    expect(cq!.cost).toBeCloseTo(85, 0);
    // El pollo sin costo sigue propagándose como desconocido (NUNCA se asume $0).
    expect(cq!.unknownQty).toBeGreaterThan(0);
  });
});
