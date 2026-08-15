import { describe, expect, it } from 'vitest';
import { buildLedgerSeed, runLedgerFifo, type LedgerMovement } from './run-ledger';

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
    expect(cq).toEqual({ cost: 16000, qty: 2, unknownQty: 0, estimatedQty: 0 });
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
    expect(r.cortesiaCostBySource.get('cor1')).toEqual({ cost: 150, unknownQty: 0, estimatedCost: 0 });
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
    expect(r.cortesiaCostBySource.get('cor9')).toEqual({ cost: 300, unknownQty: 0, estimatedCost: 0 });
  });

  it('cortesía sin stock suficiente: lo que falta se ESTIMA al último precio', () => {
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 50 }),
      mov({ delta: -3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor1' }),
    ]);
    // 1 del lote real + 2 estimadas a $50 = 150. Regalar sin stock cargado
    // cuesta lo mismo que regalar con stock: $0 sería regalar el insumo también.
    expect(r.cortesia[0]!.cost).toBe(150);
    expect(r.cortesia[0]!.unknownQty).toBe(0);
    // …y queda declarado cuánto de ese costo es estimado, para que la UI lo diga.
    expect(r.cortesiaCostBySource.get('cor1')).toEqual({
      cost: 150,
      unknownQty: 0,
      estimatedCost: 100,
    });
    expect(r.endingDebts['INGREDIENT:ing1']?.[0]).toMatchObject({
      qty: 2,
      kind: 'cortesia',
      consumerId: 'cor1',
      estimatedUnitCost: 50,
    });
  });

  it('cortesía sin NINGÚN historial de precio → unknownQty (ahí sí, desconocido)', () => {
    const r = runLedgerFifo([
      mov({ delta: -2, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor1' }),
    ]);
    expect(r.cortesia[0]!.cost).toBe(0);
    expect(r.cortesia[0]!.unknownQty).toBe(2);
  });

  it('cortesía sin historial pero con respaldo del catálogo → estima con él', () => {
    const r = runLedgerFifo(
      [mov({ delta: -2, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor1' })],
      undefined,
      { fallbackUnitCost: { 'INGREDIENT:ing1': 1500 } },
    );
    expect(r.cortesia[0]!.cost).toBe(3000);
    expect(r.cortesia[0]!.unknownQty).toBe(0);
  });

  it('merma sobre inventario en negativo: también se estima (la pérdida existe)', () => {
    const r = runLedgerFifo([
      mov({ delta: 2, unitCost: 300 }),
      mov({ delta: -2, type: 'SALE', sourceId: 'sale1' }),
      mov({ delta: -3, type: 'WASTE', sourceType: null }),
    ]);
    expect(r.waste[0]!.cost).toBe(900); // 3 × $300 estimado
    expect(r.waste[0]!.unknownQty).toBe(0);
  });
});

describe('runLedgerFifo · pérdidas sin stock: el estimado se corrige a REAL', () => {
  const enero = (dia: number) => new Date(2026, 0, dia, 12, 0);

  it('la compra posterior corrige la cortesía y la imputa al mes que la registró', () => {
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 1500, createdAt: enero(1) }),
      mov({ delta: -1, type: 'SALE', sourceId: 'sale1', createdAt: enero(2) }),
      // Cortesía sin stock: estima a $1.500 (lo último que costó).
      mov({
        delta: -1,
        type: 'MANUAL_ADJUSTMENT',
        sourceType: 'cortesia',
        sourceId: 'cor1',
        createdAt: enero(3),
      }),
      // La factura llega después y dice que en realidad costó $2.000.
      mov({ delta: 5, unitCost: 2000, createdAt: enero(20) }),
    ]);
    // Estimado 1.500 → real 2.000, y `estimatedCost` vuelve a 0: ya no es estimado.
    expect(r.cortesiaCostBySource.get('cor1')).toEqual({
      cost: 2000,
      unknownQty: 0,
      estimatedCost: 0,
    });
    // La corrección se imputa a la FECHA DEL CONSUMO, no a la de la factura:
    // si no, el mes que regaló el producto quedaría subestimado para siempre.
    const total = r.cortesia
      .filter((c) => c.createdAt <= enero(4).toISOString())
      .reduce((a, c) => a + c.cost, 0);
    expect(total).toBe(2000);
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(4); // la deuda se comió 1
  });

  it('anular la cortesía antes de reponer cancela la deuda y el estimado (neto 0)', () => {
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 1500 }),
      mov({ delta: -1, type: 'SALE', sourceId: 'sale1' }),
      mov({ delta: -1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'cor1' }),
      mov({ delta: 1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: 'cor1' }),
      // Reposición posterior: no debe saldar una deuda que ya no existe.
      mov({ delta: 3, unitCost: 2000 }),
    ]);
    expect(r.cortesiaCostBySource.get('cor1')).toEqual({ cost: 0, unknownQty: 0, estimatedCost: 0 });
    expect(r.cortesia.reduce((a, c) => a + c.cost, 0)).toBe(0);
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(3); // entera, sin deuda que pagar
  });

  it('anular la merma estimada la netea y no deja deuda', () => {
    const wasteId = 'merma-1';
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 800 }),
      mov({ delta: -1, type: 'SALE', sourceId: 'sale1' }),
      mov({ delta: -2, id: wasteId, type: 'WASTE', sourceType: null }),
      mov({ delta: 2, type: 'MANUAL_ADJUSTMENT', sourceType: 'waste_reversal', sourceId: wasteId }),
    ]);
    expect(r.waste.reduce((a, w) => a + w.cost, 0)).toBe(0);
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
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
    expect(next).toEqual({ cost: 100, qty: 10, unknownQty: 0, estimatedQty: 0 });
  });
});

describe('runLedgerFifo · edición de pedidos (ajustes de consumo)', () => {
  // editItems crea movements SALE con el MISMO sourceId que el cobro: delta
  // negativo si se agrega producto (consume más), positivo si se quita (devuelve).

  it('edición que AGREGA producto: acumula el consumo (no pierde el cobro inicial)', () => {
    const r = runLedgerFifo([
      mov({ delta: 20, unitCost: 5 }),
      mov({ delta: -10, type: 'SALE', sourceId: 'sale1' }), // cobro: consume 10
      mov({ delta: -5, type: 'SALE', sourceId: 'sale1' }), // edición: agrega → consume 5 más
    ]);
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')).toEqual({
      cost: 75, // 15 × $5
      qty: 15,
      unknownQty: 0,
      estimatedQty: 0,
    });
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 5, value: 25, unknownQty: 0 });
  });

  it('edición que QUITA producto: devuelve solo lo editado (no todo el consumo)', () => {
    const r = runLedgerFifo([
      mov({ delta: 20, unitCost: 5 }),
      mov({ delta: -10, type: 'SALE', sourceId: 'sale1' }), // cobro: consume 10
      mov({ delta: 3, type: 'SALE', sourceId: 'sale1' }), // edición: quita 3 → devuelve 3
    ]);
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')).toEqual({
      cost: 35, // 7 × $5
      qty: 7,
      unknownQty: 0,
      estimatedQty: 0,
    });
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 13, value: 65, unknownQty: 0 });
  });

  it('quita producto devolviendo el lote MÁS RECIENTE primero (reverso FIFO)', () => {
    const r = runLedgerFifo([
      mov({ delta: 6, unitCost: 10 }), // L1 viejo
      mov({ delta: 10, unitCost: 20 }), // L2 nuevo
      mov({ delta: -8, type: 'SALE', sourceId: 'sale1' }), // consume 6@10 + 2@20 = 100
      mov({ delta: 3, type: 'SALE', sourceId: 'sale1' }), // devuelve 3: 2@20 + 1@10 = 50
    ]);
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')).toEqual({
      cost: 50, // 100 − 50
      qty: 5,
      unknownQty: 0,
      estimatedQty: 0,
    });
    // Quedan 11: 1@10 + 2@20 (devueltos al frente) + 8@20.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 11, value: 210, unknownQty: 0 });
    // El DESGLOSE por lote (lo que muestra /cogs/fifo-lots) queda en orden FIFO
    // correcto: el lote viejo ($10) primero, luego los de $20. Antes del fix una
    // edición corrompía este desglose (devolvía de más).
    expect(r.remainingLots.get('INGREDIENT:ing1')).toEqual([
      { qty: 1, unitCost: 10 },
      { qty: 2, unitCost: 20 },
      { qty: 8, unitCost: 20 },
    ]);
  });

  it('CRÍTICO: editar-y-luego-anular deja la venta en cero y el stock íntegro', () => {
    const r = runLedgerFifo([
      mov({ delta: 20, unitCost: 5 }),
      mov({ delta: -10, type: 'SALE', sourceId: 'sale1' }), // cobro: consume 10
      mov({ delta: 3, type: 'SALE', sourceId: 'sale1' }), // edición: quita 3 (neto 7)
      mov({ delta: 7, type: 'SALE', sourceId: 'sale1' }), // void: reverso del NETO consumido (7)
      mov({ delta: -10, type: 'SALE', sourceId: 'sale2' }), // otra venta: como si la 1ra nunca pasó
    ]);
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')).toEqual({ cost: 0, qty: 0, unknownQty: 0, estimatedQty: 0 });
    expect(r.saleIngredientCost.get('sale2')?.get('ing1')).toEqual({ cost: 50, qty: 10, unknownQty: 0, estimatedQty: 0 });
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 50, unknownQty: 0 });
  });

  it('agregar-y-luego-anular: el void revierte el consumo COMPLETO (cobro + edición)', () => {
    const r = runLedgerFifo([
      mov({ delta: 20, unitCost: 5 }),
      mov({ delta: -10, type: 'SALE', sourceId: 'sale1' }), // cobro: consume 10
      mov({ delta: -5, type: 'SALE', sourceId: 'sale1' }), // edición: agrega 5 (neto 15)
      mov({ delta: 15, type: 'SALE', sourceId: 'sale1' }), // void: reverso del neto (15)
    ]);
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')).toEqual({ cost: 0, qty: 0, unknownQty: 0, estimatedQty: 0 });
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 20, value: 100, unknownQty: 0 });
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

  it('producir con un insumo NO cargado lo estima al último precio (no lo regala)', () => {
    const r = runLedgerFifo([
      mov({ delta: 500, unitCost: 2 }), // el insumo ya costó $2/g alguna vez…
      mov({ delta: -500, type: 'SALE', sourceId: 'sale0' }), // …y se agotó
      // Tanda con el inventario en 0: consume 500g que no estaban cargados.
      mov({ delta: -500, type: 'PRODUCTION', ...PROD }),
      mov({ delta: 10, type: 'PRODUCTION', entityType: 'SUBPRODUCT', ...PROD }),
      mov({ delta: -2, type: 'SALE', sourceId: 'sale1', entityType: 'SUBPRODUCT' }),
    ]);
    // El lote sale a $100/u (500g × $2 / 10) en vez de nacer sin costo y
    // arrastrar ese cero a todo lo que se venda con el subproducto.
    expect(r.remaining.get('SUBPRODUCT:sub1')).toEqual({ qty: 8, value: 800, unknownQty: 0 });
    expect(r.saleSubproductCost.get('sale1')?.get('sub1')?.cost).toBe(200);
    // La deuda queda a nombre de la tanda: la compra que llegue después saca
    // esas unidades fantasma del inventario.
    expect(r.endingDebts['INGREDIENT:ing1']?.[0]).toMatchObject({
      qty: 500,
      kind: 'production',
      consumerId: 'run1',
    });
  });

  it('la compra posterior salda la deuda de la tanda sin re-costear el lote', () => {
    const r = runLedgerFifo([
      mov({ delta: 500, unitCost: 2 }),
      mov({ delta: -500, type: 'SALE', sourceId: 'sale0' }),
      mov({ delta: -500, type: 'PRODUCTION', ...PROD }),
      mov({ delta: 10, type: 'PRODUCTION', entityType: 'SUBPRODUCT', ...PROD }),
      // Llega la factura de 800g: 500 pagan la deuda, quedan 300 en stock.
      mov({ delta: 800, unitCost: 3 }),
    ]);
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 300, value: 900, unknownQty: 0 });
    // El subproducto conserva su estimado: re-costearlo exigiría reabrir ventas
    // que quizá ya ocurrieron (limitación documentada en §7.v32).
    expect(r.remaining.get('SUBPRODUCT:sub1')?.value).toBe(1000);
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
      estimatedQty: 0,
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

describe('runLedgerFifo · anulación de merma (base de costo real)', () => {
  it('la reversa devuelve las unidades con su costo FIFO original y netea la merma', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 100 }),
      mov({ id: 'w1', delta: -3, type: 'WASTE' }),
      mov({ delta: 3, type: 'MANUAL_ADJUSTMENT', sourceType: 'waste_reversal', sourceId: 'w1' }),
    ]);
    // La merma costó 300 y la reversa lo devuelve: neto 0 en el P&G.
    expect(r.waste.reduce((s, w) => s + w.cost, 0)).toBe(0);
    // El stock vuelve a 10 con su valor original (no un lote sin costo).
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 1000, unknownQty: 0 });
  });

  it('reversa PARCIAL solo netea lo devuelto (el dedo pesado se corrige a lo real)', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 100 }),
      // El cocinero registra 10 kg de merma cuando en realidad fue 1.
      mov({ id: 'w2', delta: -10, type: 'WASTE' }),
      // El admin devuelve los 9 kg que nunca se tiraron.
      mov({ delta: 9, type: 'MANUAL_ADJUSTMENT', sourceType: 'waste_reversal', sourceId: 'w2' }),
    ]);
    // Pérdida real en el P&G: 1 kg × $100.
    expect(r.waste.reduce((s, w) => s + w.cost, 0)).toBe(100);
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 9, value: 900, unknownQty: 0 });
  });

  it('devuelve lo más recién consumido primero cuando la merma cruzó lotes', () => {
    const r = runLedgerFifo([
      mov({ delta: 2, unitCost: 10 }),
      mov({ delta: 2, unitCost: 20 }),
      // Merma cruza lotes: 2×10 + 1×20 = 40.
      mov({ id: 'w3', delta: -3, type: 'WASTE' }),
      // Reversa de 1 → devuelve la del lote de $20 (lo último consumido).
      mov({ delta: 1, type: 'MANUAL_ADJUSTMENT', sourceType: 'waste_reversal', sourceId: 'w3' }),
    ]);
    expect(r.waste.reduce((s, w) => s + w.cost, 0)).toBe(20);
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 2, value: 40, unknownQty: 0 });
  });

  it('reversa de una merma que sobre-consumió NO crea lotes fantasma', () => {
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 50 }),
      mov({ id: 'w4', delta: -3, type: 'WASTE' }),
      mov({ delta: 3, type: 'MANUAL_ADJUSTMENT', sourceType: 'waste_reversal', sourceId: 'w4' }),
    ]);
    // DB: 1 − 3 + 3 = 1. El FIFO dice lo mismo.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 1, value: 50, unknownQty: 0 });
    expect(r.waste.reduce((s, w) => s + w.cost, 0)).toBe(0);
  });

  it('reversa sin draws (movimiento inexistente) no toca los agregados', () => {
    const r = runLedgerFifo([
      mov({ delta: 4, type: 'MANUAL_ADJUSTMENT', sourceType: 'waste_reversal', sourceId: 'noExiste' }),
    ]);
    expect(r.waste).toEqual([]);
    // No inyecta unidades fantasma: la cola queda en cero, no en 4.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 0, value: 0, unknownQty: 0 });
  });

  it('una merma NO revertida no paga el costo de registrar draws', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 100 }),
      mov({ id: 'w5', delta: -3, type: 'WASTE' }),
    ]);
    expect(r.waste.reduce((s, w) => s + w.cost, 0)).toBe(300);
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 7, value: 700, unknownQty: 0 });
  });
});

describe('runLedgerFifo · anulación de cortesía (base de costo real)', () => {
  it('la reversa devuelve las unidades con su costo FIFO original y netea la cortesía', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 100 }),
      mov({ delta: -3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'corA' }),
      mov({ delta: 3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: 'corA' }),
      // Venta posterior: debe costear a $100 (NO a $0 como antes del fix).
      mov({ delta: -5, type: 'SALE', sourceId: 'saleZ' }),
    ]);
    expect(r.saleIngredientCost.get('saleZ')?.get('ing1')).toEqual({
      cost: 500,
      qty: 5,
      unknownQty: 0,
      estimatedQty: 0,
    });
    // La cortesía queda neteada a 0 (consumo +300, reversa −300).
    expect(r.cortesiaCostBySource.get('corA')).toEqual({ cost: 0, unknownQty: 0, estimatedCost: 0 });
    const cortesiaTotal = r.cortesia.reduce((a, c) => a + c.cost, 0);
    expect(cortesiaTotal).toBe(0);
    // Inventario final: 10 − 3 + 3 − 5 = 5 unidades a $100.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 5, value: 500, unknownQty: 0 });
  });

  it('reversa parcial devuelve lo más recién consumido primero', () => {
    const r = runLedgerFifo([
      mov({ delta: 2, unitCost: 10 }),
      mov({ delta: 2, unitCost: 20 }),
      // Cortesía cruza lotes: 2×10 + 1×20 = 40.
      mov({ delta: -3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'corB' }),
      // Reversa de 1 → devuelve la del lote de $20 (lo último consumido).
      mov({ delta: 1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: 'corB' }),
    ]);
    expect(r.cortesiaCostBySource.get('corB')).toEqual({ cost: 20, unknownQty: 0, estimatedCost: 0 });
    // Quedan 1 (reinyectada a $20) + 1 (del lote de $20 sin tocar) = 2×$20.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 2, value: 40, unknownQty: 0 });
  });

  it('reversa de una cortesía que sobre-consumió NO crea lotes fantasma (concilia con la DB)', () => {
    const r = runLedgerFifo([
      // Stock real: 1. La cortesía descuenta 3 (1 real + 2 fantasma).
      mov({ delta: 1, unitCost: 50 }),
      mov({ delta: -3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'corC' }),
      mov({ delta: 3, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: 'corC' }),
    ]);
    // DB: 1 − 3 + 3 = 1. El FIFO debe decir lo mismo (antes inyectaba el
    // faltante como lote fantasma → remaining 3).
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 1, value: 50, unknownQty: 0 });
  });

  it('reversa sin draws (datos corruptos) no devuelve nada ni toca los agregados', () => {
    const r = runLedgerFifo([
      mov({ delta: 4, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: 'corLegacy' }),
    ]);
    expect(r.remaining.get('INGREDIENT:ing1')?.qty ?? 0).toBe(0);
    expect(r.cortesiaCostBySource.has('corLegacy')).toBe(false);
  });
});

describe('runLedgerFifo · bordes de producción (auditoría 2026-07-05)', () => {
  it('tanda sin consumos registrados → lote de costo DESCONOCIDO, no $0', () => {
    const r = runLedgerFifo([
      // Solo el +N (los consumos rondaron a 0 y se filtraron al persistir).
      mov({
        delta: 5,
        type: 'PRODUCTION',
        sourceType: 'production',
        sourceId: 'run1',
        entityType: 'SUBPRODUCT',
      }),
      mov({ delta: -2, type: 'SALE', sourceId: 'saleP', entityType: 'SUBPRODUCT' }),
    ]);
    const cq = r.saleSubproductCost.get('saleP')?.get('sub1');
    expect(cq?.cost).toBe(0);
    expect(cq?.unknownQty).toBe(2); // desconocido, NUNCA $0 asumido
  });

  it('batch malformado (consumos sin +N) igual descuenta las colas', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 100 }),
      // Consumo de producción huérfano (el +N se perdió — datos corruptos).
      mov({ delta: -4, type: 'PRODUCTION', sourceType: 'production', sourceId: 'runX' }),
    ]);
    // Antes se ignoraba el batch entero → remaining 10 (inflado). DB = 6.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 6, value: 600, unknownQty: 0 });
  });
});

describe('runLedgerFifo · snapshot (seed + incremental)', () => {
  /**
   * Historia rica pre-corte: compras multi-lote, producción, venta, merma y
   * cortesía. Post-corte: compra, venta cruza-lotes, cortesía+anulación,
   * venta anulada (void) y segunda producción — todo DENTRO de la ventana.
   * Invariante: replay completo === replay(seed) + incremental.
   */
  const buildHistory = () => {
    const pre: LedgerMovement[] = [
      mov({ delta: 100, unitCost: 10, createdAt: new Date('2026-01-01T10:00:00Z') }),
      mov({ delta: 50, unitCost: 20, ingredientId: 'ing2', createdAt: new Date('2026-01-02T10:00:00Z') }),
      // Producción: 20×ing1 + 10×ing2 → 10×sub1 a $40/u.
      mov({ delta: -20, type: 'PRODUCTION', sourceType: 'production', sourceId: 'run1', createdAt: new Date('2026-01-03T10:00:00Z') }),
      mov({ delta: -10, type: 'PRODUCTION', sourceType: 'production', sourceId: 'run1', ingredientId: 'ing2', createdAt: new Date('2026-01-03T10:00:00Z') }),
      mov({ delta: 10, type: 'PRODUCTION', sourceType: 'production', sourceId: 'run1', entityType: 'SUBPRODUCT', createdAt: new Date('2026-01-03T10:00:00Z') }),
      mov({ delta: -5, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-01-04T10:00:00Z') }),
      mov({ delta: -2, type: 'SALE', sourceId: 's1', entityType: 'SUBPRODUCT', createdAt: new Date('2026-01-04T10:00:00Z') }),
      mov({ delta: -3, type: 'WASTE', sourceType: null, createdAt: new Date('2026-01-05T10:00:00Z') }),
      mov({ delta: -1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'c1', entityType: 'SUBPRODUCT', createdAt: new Date('2026-01-06T10:00:00Z') }),
    ];
    const post: LedgerMovement[] = [
      mov({ delta: 30, unitCost: 12, createdAt: new Date('2026-02-02T10:00:00Z') }),
      // Cruza lotes: 72 restantes @10 + 8 @12 = 816.
      mov({ delta: -80, type: 'SALE', sourceId: 's2', createdAt: new Date('2026-02-03T10:00:00Z') }),
      // Cortesía c2 y su anulación, ambas en ventana.
      mov({ delta: -1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia', sourceId: 'c2', entityType: 'SUBPRODUCT', createdAt: new Date('2026-02-04T10:00:00Z') }),
      mov({ delta: 1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: 'c2', entityType: 'SUBPRODUCT', createdAt: new Date('2026-02-04T11:00:00Z') }),
      // Venta anulada (void) en ventana: consume y devuelve.
      mov({ delta: -3, type: 'SALE', sourceId: 's3', entityType: 'SUBPRODUCT', createdAt: new Date('2026-02-05T10:00:00Z') }),
      mov({ delta: 3, type: 'SALE', sourceId: 's3', entityType: 'SUBPRODUCT', createdAt: new Date('2026-02-05T11:00:00Z') }),
      // Segunda producción post-corte consume ing2 sembrado.
      mov({ delta: -8, type: 'PRODUCTION', sourceType: 'production', sourceId: 'run2', ingredientId: 'ing2', createdAt: new Date('2026-02-06T10:00:00Z') }),
      mov({ delta: 4, type: 'PRODUCTION', sourceType: 'production', sourceId: 'run2', entityType: 'SUBPRODUCT', createdAt: new Date('2026-02-06T10:00:00Z') }),
      mov({ delta: -2, type: 'SALE', sourceId: 's4', entityType: 'SUBPRODUCT', createdAt: new Date('2026-02-07T10:00:00Z') }),
    ];
    return { pre, post };
  };

  const CUTOFF = '2026-02-01T00:00:00.000Z';

  it('replay(seed)+incremental === replay completo (remaining, costos, agregados)', () => {
    const { pre, post } = buildHistory();
    const full = runLedgerFifo([...pre, ...post]);

    const preResult = runLedgerFifo(pre);
    // Round-trip JSON: el seed se persiste como Json en la DB.
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, CUTOFF)));
    const inc = runLedgerFifo(post, seed);

    expect(inc.needsFullReplay).toBe(false);
    expect(full.needsFullReplay).toBe(false);

    // Estado del inventario idéntico.
    expect(inc.remaining).toEqual(full.remaining);
    expect(inc.remainingLots).toEqual(full.remainingLots);
    expect(inc.endingLots).toEqual(full.endingLots);

    // Costos de las ventas de la ventana idénticos al replay completo.
    for (const saleId of ['s2', 's3', 's4']) {
      expect(inc.saleIngredientCost.get(saleId)).toEqual(full.saleIngredientCost.get(saleId));
      expect(inc.saleSubproductCost.get(saleId)).toEqual(full.saleSubproductCost.get(saleId));
    }

    // Agregados históricos completos (seed preserva lo pre-corte).
    expect(inc.waste).toEqual(full.waste);
    expect(inc.cortesia).toEqual(full.cortesia);
    expect(inc.cortesiaCostBySource).toEqual(full.cortesiaCostBySource);
  });

  it('la venta cruza-lotes usa los lotes sembrados con su costo original', () => {
    const { pre, post } = buildHistory();
    const preResult = runLedgerFifo(pre);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, CUTOFF)));
    const inc = runLedgerFifo(post, seed);
    // 72 unidades @10 del lote pre-corte + 8 @12 del lote nuevo.
    expect(inc.saleIngredientCost.get('s2')?.get('ing1')).toEqual({
      cost: 816,
      qty: 80,
      unknownQty: 0,
      estimatedQty: 0,
    });
  });

  it('VOID de venta pre-corte en la ventana → needsFullReplay', () => {
    const { pre } = buildHistory();
    const preResult = runLedgerFifo(pre);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, CUTOFF)));
    // El reverso de s1 llega en febrero; sus draws quedaron antes del corte.
    const inc = runLedgerFifo(
      [mov({ delta: 5, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-02-10T10:00:00Z') })],
      seed,
    );
    expect(inc.needsFullReplay).toBe(true);
  });

  it('anulación de cortesía pre-corte en la ventana → needsFullReplay', () => {
    const { pre } = buildHistory();
    const preResult = runLedgerFifo(pre);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, CUTOFF)));
    const inc = runLedgerFifo(
      [mov({ delta: 1, type: 'MANUAL_ADJUSTMENT', sourceType: 'cortesia_reversal', sourceId: 'c1', entityType: 'SUBPRODUCT', createdAt: new Date('2026-02-10T10:00:00Z') })],
      seed,
    );
    expect(inc.needsFullReplay).toBe(true);
  });

  it('reversa PARCIALMENTE cubierta (venta editada tras el corte) → needsFullReplay', () => {
    const { pre } = buildHistory();
    const preResult = runLedgerFifo(pre);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, CUTOFF)));
    // s1 consumió 5 pre-corte; en la ventana consume 2 más (edición) y luego
    // el void devuelve 7. Los draws en ventana solo cubren 2 de 7.
    const inc = runLedgerFifo(
      [
        mov({ delta: -2, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-02-10T10:00:00Z') }),
        mov({ delta: 7, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-02-10T11:00:00Z') }),
      ],
      seed,
    );
    expect(inc.needsFullReplay).toBe(true);
  });

  it('sin reversas cruzadas el flag queda apagado y sin seed nunca se enciende', () => {
    const { pre, post } = buildHistory();
    // Reverso "fantasma" SIN seed (defensa de siempre): no debe encender el flag.
    const full = runLedgerFifo([
      ...pre,
      ...post,
      mov({ delta: 5, type: 'SALE', sourceId: 'nunca-consumió', createdAt: new Date('2026-02-20T10:00:00Z') }),
    ]);
    expect(full.needsFullReplay).toBe(false);
  });
});

describe('runLedgerFifo · costo ESTIMADO por historial (último precio)', () => {
  it('venta sin stock CON historial → costo estimado al último precio, no desconocido', () => {
    const r = runLedgerFifo([
      mov({ delta: 10, unitCost: 500, createdAt: new Date('2026-01-01T10:00:00Z') }),
      // Se consume todo el stock…
      mov({ delta: -10, type: 'SALE', sourceId: 'previa', createdAt: new Date('2026-01-02T10:00:00Z') }),
      // …y esta venta va forzada, sin stock: se estima a $500 (lo último conocido).
      mov({ delta: -3, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-01-03T10:00:00Z') }),
    ]);
    expect(r.saleIngredientCost.get('forzada')?.get('ing1')).toEqual({
      cost: 1500, // 3 × $500 estimado
      qty: 3,
      unknownQty: 0, // ya no es "no sé"…
      estimatedQty: 3, // …pero queda marcado como estimado (honesto).
    });
  });

  it('sin NINGÚN historial → unknownQty (nunca inventa un precio)', () => {
    const r = runLedgerFifo([
      mov({ delta: -3, type: 'SALE', sourceId: 'forzada' }),
    ]);
    expect(r.saleIngredientCost.get('forzada')?.get('ing1')).toEqual({
      cost: 0,
      qty: 3,
      unknownQty: 3,
      estimatedQty: 0,
    });
  });

  it('usa el fallback del catálogo (lastUnitCost) cuando el replay no vio entradas', () => {
    const r = runLedgerFifo(
      [mov({ delta: -2, type: 'SALE', sourceId: 'forzada' })],
      undefined,
      { fallbackUnitCost: { 'INGREDIENT:ing1': 300 } },
    );
    expect(r.saleIngredientCost.get('forzada')?.get('ing1')).toEqual({
      cost: 600,
      qty: 2,
      unknownQty: 0,
      estimatedQty: 2,
    });
  });

  it('el historial del replay GANA sobre el fallback del catálogo', () => {
    const r = runLedgerFifo(
      [
        mov({ delta: 1, unitCost: 900, createdAt: new Date('2026-01-01T10:00:00Z') }),
        mov({ delta: -1, type: 'SALE', sourceId: 's0', createdAt: new Date('2026-01-02T10:00:00Z') }),
        mov({ delta: -2, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-01-03T10:00:00Z') }),
      ],
      undefined,
      { fallbackUnitCost: { 'INGREDIENT:ing1': 300 } },
    );
    // 2 × $900 (lo último REAL visto), no el $300 del catálogo.
    expect(r.saleIngredientCost.get('forzada')?.get('ing1')?.cost).toBe(1800);
  });

  it('CRÍTICO: al subir la factura el estimado se corrige a REAL por diferencia (sin doble conteo)', () => {
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 500, createdAt: new Date('2026-01-01T10:00:00Z') }),
      mov({ delta: -1, type: 'SALE', sourceId: 's0', createdAt: new Date('2026-01-02T10:00:00Z') }),
      // Forzada: estima 3 × $500 = $1.500.
      mov({ delta: -3, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-01-03T10:00:00Z') }),
      // Llega la factura olvidada: el precio REAL era $600.
      mov({ delta: 10, unitCost: 600, createdAt: new Date('2026-01-04T10:00:00Z') }),
    ]);
    expect(r.saleIngredientCost.get('forzada')?.get('ing1')).toEqual({
      // $1.800 = 3 × $600 REAL. NO $1.500 + $1.800 = $3.300 (doble conteo).
      cost: 1800,
      qty: 3,
      unknownQty: 0,
      estimatedQty: 0, // ya no es estimado: es el costo real.
    });
    // Y solo quedan 7 disponibles (3 saldaron la deuda).
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(7);
  });

  it('void de una venta estimada (antes de reponer) revierte el estimado → neto 0', () => {
    const r = runLedgerFifo([
      mov({ delta: 1, unitCost: 500, createdAt: new Date('2026-01-01T10:00:00Z') }),
      mov({ delta: -1, type: 'SALE', sourceId: 's0', createdAt: new Date('2026-01-02T10:00:00Z') }),
      mov({ delta: -3, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-01-03T10:00:00Z') }),
      mov({ delta: 3, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-01-03T11:00:00Z') }),
    ]);
    expect(r.saleIngredientCost.get('forzada')?.get('ing1')).toEqual({
      cost: 0,
      qty: 0,
      unknownQty: 0,
      estimatedQty: 0,
    });
    // La deuda se canceló → una compra posterior queda 100% disponible.
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
  });

  it('el último precio conocido sobrevive el corte del snapshot', () => {
    const pre = [mov({ delta: 5, unitCost: 700, createdAt: new Date('2026-01-10T10:00:00Z') })];
    const preResult = runLedgerFifo(pre);
    expect(preResult.endingLastKnownUnitCost['INGREDIENT:ing1']).toBe(700);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, '2026-02-01T00:00:00.000Z')));
    // Post-corte: se agota el stock y una venta forzada estima con el precio sembrado.
    const inc = runLedgerFifo(
      [
        mov({ delta: -5, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-02-02T10:00:00Z') }),
        mov({ delta: -2, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-02-03T10:00:00Z') }),
      ],
      seed,
    );
    expect(inc.saleIngredientCost.get('forzada')?.get('ing1')).toEqual({
      cost: 1400, // 2 × $700 sembrado
      qty: 2,
      unknownQty: 0,
      estimatedQty: 2,
    });
  });
});

describe('runLedgerFifo · deuda de stock (forzar disponible / inventario negativo)', () => {
  it('venta forzada sin stock → la COMPRA posterior salda la deuda y costea la venta', () => {
    const r = runLedgerFifo([
      // Venta forzada: consume 3 sin stock → costo desconocido provisional.
      mov({ delta: -3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-01T10:00:00Z') }),
      // Se registra el inventario recién después (llegó, no estaba cargado).
      mov({ delta: 10, unitCost: 8000, createdAt: new Date('2026-01-02T10:00:00Z') }),
    ]);
    // La venta forzada queda costeada al precio de la compra (retroactivo).
    expect(r.saleIngredientCost.get('sale1')?.get('ing1')).toEqual({
      cost: 24000,
      qty: 3,
      unknownQty: 0,
      estimatedQty: 0,
    });
    // Solo quedan 7 disponibles (3 saldaron la deuda, no son stock).
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 7, value: 56000, unknownQty: 0 });
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
  });

  it('una venta NORMAL posterior no hereda el costo de la deuda ajena', () => {
    const r = runLedgerFifo([
      mov({ delta: -3, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-01-01T10:00:00Z') }),
      mov({ delta: 10, unitCost: 8000, createdAt: new Date('2026-01-02T10:00:00Z') }),
      mov({ delta: -4, type: 'SALE', sourceId: 'normal', createdAt: new Date('2026-01-03T10:00:00Z') }),
    ]);
    // La forzada tomó su costo; la normal toma de los 7 restantes, sin solaparse.
    expect(r.saleIngredientCost.get('forzada')?.get('ing1')?.cost).toBe(24000);
    expect(r.saleIngredientCost.get('normal')?.get('ing1')).toEqual({
      cost: 32000,
      qty: 4,
      unknownQty: 0,
      estimatedQty: 0,
    });
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(3);
  });

  it('venta forzada de un preparado → la PRODUCCIÓN del subproducto la salda', () => {
    const r = runLedgerFifo([
      mov({ delta: 100, unitCost: 10, ingredientId: 'ing1', createdAt: new Date('2026-01-01T10:00:00Z') }),
      // Forzada: consume 2 del subproducto sin stock producido.
      mov({ delta: -2, type: 'SALE', sourceId: 'sale1', entityType: 'SUBPRODUCT', createdAt: new Date('2026-01-02T10:00:00Z') }),
      // Producción posterior: 20×ing1 → 5×sub1 a $40/u.
      mov({ delta: -20, type: 'PRODUCTION', sourceType: 'production', sourceId: 'run1', ingredientId: 'ing1', createdAt: new Date('2026-01-03T10:00:00Z') }),
      mov({ delta: 5, type: 'PRODUCTION', sourceType: 'production', sourceId: 'run1', entityType: 'SUBPRODUCT', createdAt: new Date('2026-01-03T10:00:00Z') }),
    ]);
    expect(r.saleSubproductCost.get('sale1')?.get('sub1')).toEqual({
      cost: 80,
      qty: 2,
      unknownQty: 0,
      estimatedQty: 0,
    });
    // 3 subproductos quedan (5 producidos − 2 que saldaron la deuda).
    expect(r.remaining.get('SUBPRODUCT:sub1')?.qty).toBe(3);
  });

  it('void ANTES de reponer cancela la deuda (sin lote fantasma)', () => {
    const r = runLedgerFifo([
      mov({ delta: -3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-01T10:00:00Z') }),
      // Void del consumo forzado.
      mov({ delta: 3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-01T11:00:00Z') }),
      // La compra posterior queda 100% disponible (la deuda ya no existe).
      mov({ delta: 10, unitCost: 8000, createdAt: new Date('2026-01-02T10:00:00Z') }),
    ]);
    const cq = r.saleIngredientCost.get('sale1')?.get('ing1');
    expect(cq).toEqual({ cost: 0, qty: 0, unknownQty: 0, estimatedQty: 0 });
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 80000, unknownQty: 0 });
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
  });

  it('void DESPUÉS de reponer revierte el costo saldado (neto 0)', () => {
    const r = runLedgerFifo([
      mov({ delta: -3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-01T10:00:00Z') }),
      mov({ delta: 10, unitCost: 8000, createdAt: new Date('2026-01-02T10:00:00Z') }),
      // Void después de que la compra saldó la deuda.
      mov({ delta: 3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-03T10:00:00Z') }),
    ]);
    const cq = r.saleIngredientCost.get('sale1')?.get('ing1');
    expect(cq).toEqual({ cost: 0, qty: 0, unknownQty: 0, estimatedQty: 0 });
    // El void devuelve las 3 unidades saldadas → 10 disponibles de nuevo.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 80000, unknownQty: 0 });
  });

  it('§1.6: void tras un lote SIN costo (cold start) que saldó la deuda restaura las unidades', () => {
    const r = runLedgerFifo([
      // Venta forzada sin stock → deuda de 3 (sin historial → desconocida).
      mov({ delta: -3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-01T10:00:00Z') }),
      // Carga INICIAL sin costo (cold start) que salda físicamente la deuda.
      mov({ delta: 10, unitCost: null, type: 'INITIAL', createdAt: new Date('2026-01-02T10:00:00Z') }),
      // Void: las 3 unidades saldadas deben volver a la cola (antes se perdían).
      mov({ delta: 3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-03T10:00:00Z') }),
    ]);
    const cq = r.saleIngredientCost.get('sale1')?.get('ing1');
    expect(cq).toEqual({ cost: 0, qty: 0, unknownQty: 0, estimatedQty: 0 });
    // 10 disponibles de nuevo (7 sobrantes + 3 devueltas), todas de costo desconocido.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 0, unknownQty: 10 });
  });

  it('§1.6: con estimado previo, el void tras el lote sin costo netea el costo a 0 y devuelve las unidades', () => {
    const r = runLedgerFifo(
      [
        mov({ delta: -3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-01T10:00:00Z') }),
        mov({ delta: 10, unitCost: null, type: 'INITIAL', createdAt: new Date('2026-01-02T10:00:00Z') }),
        mov({ delta: 3, type: 'SALE', sourceId: 'sale1', createdAt: new Date('2026-01-03T10:00:00Z') }),
      ],
      undefined,
      { fallbackUnitCost: { 'INGREDIENT:ing1': 300 } },
    );
    const cq = r.saleIngredientCost.get('sale1')?.get('ing1');
    // El estimado cargó 3×300=900; el void lo revierte → costo neto 0.
    expect(cq?.cost).toBe(0);
    expect(cq?.qty).toBe(0);
    // Unidades restauradas (re-inyectadas con la base del estimado).
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(10);
  });

  it('la deuda cruza el corte del snapshot y la COMPRA post-corte la salda', () => {
    const pre = [
      mov({ delta: -3, type: 'SALE', sourceId: 'forzada', createdAt: new Date('2026-01-31T10:00:00Z') }),
    ];
    const post = [
      mov({ delta: 10, unitCost: 8000, createdAt: new Date('2026-02-02T10:00:00Z') }),
    ];
    const CUTOFF = '2026-02-01T00:00:00.000Z';
    const full = runLedgerFifo([...pre, ...post]);

    const preResult = runLedgerFifo(pre);
    // La deuda queda en el seed (serializable) para saldarse después del corte.
    expect(preResult.endingDebts['INGREDIENT:ing1']?.[0]?.qty).toBe(3);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, CUTOFF)));
    const inc = runLedgerFifo(post, seed);

    expect(inc.needsFullReplay).toBe(false);
    // El inventario cuadra con el replay completo (3 saldaron la deuda → 7).
    expect(inc.remaining).toEqual(full.remaining);
    expect(inc.endingLots).toEqual(full.endingLots);
  });
});

describe('runLedgerFifo · reversa post-corte de un consumo forzado pre-corte (LEY 6, semilla 1656071)', () => {
  // Bug hallado por el property test con 1200 historias: una venta PRE-corte
  // que consumió lotes reales + deuda, anulada DESPUÉS del corte. La semilla
  // no trae los draws pre-corte, así que la deuda "cubría" toda la reversa y
  // las unidades reales se perdían en silencio (needsFullReplay quedaba false
  // y la valorización divergía del replay completo).
  const pre = [
    mov({ delta: 11, unitCost: 21, createdAt: new Date('2026-01-10T10:00:00Z') }),
    // Consume 11 reales + 16 de deuda (estimadas @21).
    mov({ delta: -27, type: 'SALE', sourceId: 'sale-5', createdAt: new Date('2026-01-15T10:00:00Z') }),
  ];
  const post = [
    // Reversa PARCIAL post-corte: devuelve 16 de las 27.
    mov({ delta: 16, type: 'SALE', sourceId: 'sale-5', createdAt: new Date('2026-02-03T10:00:00Z') }),
  ];
  const CUTOFF = '2026-02-01T00:00:00.000Z';

  it('el incremental se declara insuficiente (needsFullReplay) en vez de perder unidades', () => {
    const preResult = runLedgerFifo(pre);
    const seed = JSON.parse(JSON.stringify(buildLedgerSeed(preResult, CUTOFF)));
    const inc = runLedgerFifo(post, seed);
    // Antes del fix: false, con 11 unidades ($231) perdidas vs el replay completo.
    expect(inc.needsFullReplay).toBe(true);
  });

  it('el replay completo (a donde cae el servicio) conserva las unidades y el costo real', () => {
    const full = runLedgerFifo([...pre, ...post]);
    // Devuelve las 11 reales @21 y cancela 5 de deuda: quedan 11 en cola.
    expect(full.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 11, value: 231, unknownQty: 0 });
    expect(full.endingDebts['INGREDIENT:ing1']?.find((d) => d.consumerId === 'sale-5')?.qty).toBe(11);
  });

  it('el caso común no paga el costo: reversa cubierta 100% por draws de la ventana no marca', () => {
    // Void normal (venta del mes CON stock): los draws están completos en la
    // ventana, la reversa cuadra exacta y el incremental sigue siendo válido.
    const emptySeed = JSON.parse(
      JSON.stringify(buildLedgerSeed(runLedgerFifo([]), '2026-01-01T00:00:00.000Z')),
    );
    const inWindow = [
      mov({ delta: 50, unitCost: 21, createdAt: new Date('2026-01-10T10:00:00Z') }),
      mov({ delta: -27, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-01-15T10:00:00Z') }),
      mov({ delta: 27, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-01-20T10:00:00Z') }),
    ];
    const inc = runLedgerFifo(inWindow, emptySeed);
    const full = runLedgerFifo(inWindow);
    expect(inc.needsFullReplay).toBe(false);
    expect(inc.remaining).toEqual(full.remaining);
    expect(inc.endingDebts).toEqual(full.endingDebts);
  });

  it('regla conservadora: TODA reversa que cancela deuda en modo incremental cae a replay completo', () => {
    // Incluso si la deuda nació dentro de la ventana: la ventana no puede
    // saber si el consumidor ADEMÁS tenía draws antes del corte (semilla
    // 7571564: draws pre-corte + deuda en ventana → la deuda "cubría" lo que
    // el replay completo devolvía a los lotes). Equivalencia no demostrable
    // → se declara insuficiente. El servicio recomputa completo: más lento,
    // nunca incorrecto.
    const emptySeed = JSON.parse(
      JSON.stringify(buildLedgerSeed(runLedgerFifo([]), '2026-01-01T00:00:00.000Z')),
    );
    const inWindow = [
      mov({ delta: 11, unitCost: 21, createdAt: new Date('2026-01-10T10:00:00Z') }),
      mov({ delta: -27, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-01-15T10:00:00Z') }),
      mov({ delta: 16, type: 'SALE', sourceId: 's1', createdAt: new Date('2026-01-20T10:00:00Z') }),
    ];
    const inc = runLedgerFifo(inWindow, emptySeed);
    expect(inc.needsFullReplay).toBe(true);
  });
});
