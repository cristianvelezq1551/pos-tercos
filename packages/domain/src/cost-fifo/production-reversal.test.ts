import { describe, expect, it } from 'vitest';
import {
  buildLedgerSeed,
  PRODUCTION_REVERSAL_SOURCE_TYPE,
  runLedgerFifo,
  type LedgerMovement,
} from './run-ledger';

/**
 * ANULAR UNA TANDA DE PRODUCCIÓN en el motor de costos.
 *
 * La regla que prueban estos casos: anular tiene que dejar los libros IGUALES a
 * como estarían si esa tanda nunca se hubiera registrado. Por eso casi todos
 * comparan contra una historia gemela sin la producción — es la única
 * definición de "sin dejar ruido" que se puede verificar.
 *
 * El caso que NO cuadra a propósito es el del subproducto ya vendido: ahí la
 * realidad es contradictoria (se vendió algo que decimos que no se produjo) y
 * el sistema tiene que dejarlo VISIBLE como inventario negativo, no taparlo.
 */

let seq = 0;
function mov(p: Partial<LedgerMovement> & { delta: number }): LedgerMovement {
  seq += 1;
  const entityType = p.entityType ?? 'INGREDIENT';
  return {
    id: p.id ?? `m${seq}`,
    createdAt: p.createdAt ?? new Date(2026, 0, 1, 0, seq),
    type: p.type ?? (p.delta > 0 ? 'PURCHASE' : 'SALE'),
    unitCost: p.unitCost ?? null,
    sourceType: p.sourceType ?? null,
    sourceId: p.sourceId ?? null,
    entityType,
    ingredientId: entityType === 'INGREDIENT' ? (p.ingredientId ?? 'ing1') : null,
    productId: entityType === 'PRODUCT' ? (p.productId ?? 'prod1') : null,
    subproductId: entityType === 'SUBPRODUCT' ? (p.subproductId ?? 'sub1') : null,
    delta: p.delta,
  };
}

const T = (min: number): Date => new Date(2026, 2, 10, 9, min);

/** Compra de insumo. */
function compra(qty: number, unitCost: number | null, at: Date, ing = 'ing1'): LedgerMovement {
  return mov({ delta: qty, unitCost, type: 'PURCHASE', sourceType: 'invoice', createdAt: at, ingredientId: ing });
}

/** Tanda: consume insumos y materializa N unidades del subproducto. */
function tanda(opts: {
  runId: string;
  at: Date;
  consume: { ing: string; qty: number }[];
  produce: number;
  sub?: string;
}): LedgerMovement[] {
  return [
    ...opts.consume.map((c) =>
      mov({
        id: `${opts.runId}-in-${c.ing}`,
        delta: -c.qty,
        type: 'PRODUCTION',
        sourceType: 'production',
        sourceId: opts.runId,
        ingredientId: c.ing,
        createdAt: opts.at,
      }),
    ),
    mov({
      id: `${opts.runId}-out`,
      delta: opts.produce,
      type: 'PRODUCTION',
      sourceType: 'production',
      sourceId: opts.runId,
      entityType: 'SUBPRODUCT',
      subproductId: opts.sub ?? 'sub1',
      createdAt: opts.at,
    }),
  ];
}

/** La anulación de esa tanda, con la MISMA fecha (como la escribe la API). */
function anulacionDe(t: LedgerMovement[]): LedgerMovement[] {
  return t.map((m) =>
    mov({
      id: `${m.id}-rev`,
      delta: -m.delta,
      type: 'PRODUCTION',
      sourceType: PRODUCTION_REVERSAL_SOURCE_TYPE,
      sourceId: m.sourceId,
      entityType: m.entityType,
      ingredientId: m.ingredientId ?? undefined,
      subproductId: m.subproductId ?? undefined,
      createdAt: m.createdAt,
    }),
  );
}

describe('anulación de producción · el insumo vuelve con su costo', () => {
  it('deja el inventario igual que si la tanda nunca se hubiera registrado', () => {
    const conTanda = runLedgerFifo([
      compra(100, 5, T(1)),
      ...(() => {
        const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 60 }], produce: 6 });
        return [...t, ...anulacionDe(t)];
      })(),
    ]);
    const sinTanda = runLedgerFifo([compra(100, 5, T(1))]);

    expect(conTanda.remaining.get('INGREDIENT:ing1')).toEqual(
      sinTanda.remaining.get('INGREDIENT:ing1'),
    );
    // 100 unidades a $5 = $500: el insumo volvió con su costo, no como lote nuevo.
    expect(conTanda.remaining.get('INGREDIENT:ing1')).toEqual({
      qty: 100,
      value: 500,
      unknownQty: 0,
    });
    // Y el subproducto no quedó ni una unidad.
    expect(conTanda.remaining.get('SUBPRODUCT:sub1')?.qty ?? 0).toBe(0);
  });

  it('el insumo devuelto NO entra como lote sin costo', () => {
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 40 }], produce: 4 });
    const r = runLedgerFifo([compra(40, 7, T(1)), ...t, ...anulacionDe(t)]);
    // Sin `returnDraws` esto daría 40 unidades con unknownQty 40 y valor 0.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 40, value: 280, unknownQty: 0 });
  });

  it('lo devuelto vuelve a la CABEZA de la cola (preserva FIFO)', () => {
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 });
    const r = runLedgerFifo([
      compra(10, 1, T(1)),
      ...t,
      ...anulacionDe(t),
      compra(10, 99, T(3)),
      // Consume 10: tiene que llevarse el lote BARATO (el devuelto, más viejo).
      mov({ delta: -10, type: 'SALE', sourceType: 'sale', sourceId: 'v1', createdAt: T(4) }),
    ]);
    expect(r.saleIngredientCost.get('v1')?.get('ing1')?.cost).toBe(10);
  });

  it('devuelve cada insumo de una tanda con varios, cada uno a su costo', () => {
    const t = tanda({
      runId: 'run1',
      at: T(3),
      consume: [
        { ing: 'pan', qty: 20 },
        { ing: 'pollo', qty: 5 },
      ],
      produce: 5,
    });
    const r = runLedgerFifo([
      compra(20, 10, T(1), 'pan'),
      compra(5, 200, T(2), 'pollo'),
      ...t,
      ...anulacionDe(t),
    ]);
    expect(r.remaining.get('INGREDIENT:pan')).toEqual({ qty: 20, value: 200, unknownQty: 0 });
    expect(r.remaining.get('INGREDIENT:pollo')).toEqual({ qty: 5, value: 1000, unknownQty: 0 });
  });
});

describe('anulación de producción · el subproducto', () => {
  it('quita EL lote de esa tanda, no el más viejo de la cola', () => {
    const vieja = tanda({ runId: 'run0', at: T(2), consume: [{ ing: 'ing1', qty: 10 }], produce: 2 });
    const nueva = tanda({ runId: 'run1', at: T(3), consume: [{ ing: 'ing1', qty: 90 }], produce: 2 });
    const r = runLedgerFifo([compra(100, 1, T(1)), ...vieja, ...nueva, ...anulacionDe(nueva)]);

    // Quedan las 2 porciones de la tanda VIEJA, a su costo ($10 / 2 = $5).
    expect(r.remaining.get('SUBPRODUCT:sub1')).toEqual({ qty: 2, value: 10, unknownQty: 0 });
    const lotes = r.endingLots['SUBPRODUCT:sub1'] ?? [];
    expect(lotes.map((l) => l.movementId)).toEqual(['run0-out']);
  });

  it('anular la tanda de un subproducto YA VENDIDO lo deja debiendo, no en cero', () => {
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 });
    const r = runLedgerFifo([
      compra(10, 10, T(1)),
      ...t,
      ...anulacionDe(t),
      // La venta llega DESPUÉS de la anulación: ya no hay lote que consumir.
      mov({
        delta: -1,
        type: 'SALE',
        sourceType: 'sale',
        sourceId: 'v1',
        entityType: 'SUBPRODUCT',
        createdAt: T(5),
      }),
    ]);
    // El insumo volvió entero.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 100, unknownQty: 0 });
    // La venta quedó como faltante ESTIMADO (al costo que tenía la tanda), no
    // en $0: haber anulado la producción no vuelve gratis lo que se vendió.
    const venta = r.saleSubproductCost.get('v1')?.get('sub1');
    expect(venta?.estimatedQty).toBe(1);
    expect(venta?.cost).toBe(100);
    expect(venta?.unknownQty).toBe(0);
    // Y queda la deuda visible: el subproducto está en negativo.
    expect(r.endingDebts['SUBPRODUCT:sub1']?.[0]?.qty).toBe(1);
  });

  it('la producción siguiente salda esa deuda sin contar el insumo dos veces', () => {
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 });
    const r = runLedgerFifo([
      compra(20, 10, T(1)),
      ...t,
      ...anulacionDe(t),
      mov({
        delta: -1,
        type: 'SALE',
        sourceType: 'sale',
        sourceId: 'v1',
        entityType: 'SUBPRODUCT',
        createdAt: T(5),
      }),
      // La tanda buena, ahora bien registrada.
      ...tanda({ runId: 'run2', at: T(6), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 }),
    ]);
    const venta = r.saleSubproductCost.get('v1')?.get('sub1');
    // El estimado pasó a ser costo real: sigue siendo $100, no $200.
    expect(venta?.cost).toBe(100);
    expect(venta?.estimatedQty).toBe(0);
    expect(r.endingDebts['SUBPRODUCT:sub1']).toBeUndefined();
    // Quedan 10 unidades de insumo: 20 compradas − 10 de la tanda buena.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 100, unknownQty: 0 });
  });

  it('anular una tanda que había saldado la deuda de una venta le quita ese costo', () => {
    const t = tanda({ runId: 'run1', at: T(4), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 });
    const r = runLedgerFifo([
      compra(10, 10, T(1)),
      // Se vende ANTES de producir (venta forzada): queda debiendo 1 porción.
      mov({
        delta: -1,
        type: 'SALE',
        sourceType: 'sale',
        sourceId: 'v1',
        entityType: 'SUBPRODUCT',
        createdAt: T(2),
      }),
      ...t,
      ...anulacionDe(t),
    ]);
    // Sin lote ni historial de costo del subproducto, la venta quedó desconocida.
    const venta = r.saleSubproductCost.get('v1')?.get('sub1');
    expect(venta?.cost).toBe(0);
    expect(venta?.unknownQty).toBe(1);
    // La deuda volvió: el negocio otra vez debe esa porción.
    expect(r.endingDebts['SUBPRODUCT:sub1']?.[0]?.qty).toBe(1);
    // Y el insumo volvió entero a su costo.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 100, unknownQty: 0 });
  });
});

describe('anulación de producción · insumo que no estaba cargado', () => {
  it('cancela la deuda que dejó la tanda al producir sin stock', () => {
    // Se produce con pan que nunca se cargó: la tanda deja deuda de 10.
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 });
    const r = runLedgerFifo([...t, ...anulacionDe(t)]);
    // Anular la tanda cancela esa deuda: nadie debe nada.
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
    expect(r.remaining.get('INGREDIENT:ing1')?.qty ?? 0).toBe(0);
  });

  it('una compra posterior NO salda la deuda de una tanda anulada', () => {
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 });
    const r = runLedgerFifo([...t, ...anulacionDe(t), compra(10, 3, T(5))]);
    // Las 10 compradas quedan en inventario enteras: si la deuda siguiera viva,
    // se las habría comido para saldar una producción que ya no existe.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 30, unknownQty: 0 });
  });

  it('devuelve lo que había en stock y cancela solo el faltante', () => {
    // Hay 4 de pan cargadas y la tanda consume 10: 4 salen de lote, 6 son deuda.
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 10 }], produce: 1 });
    const r = runLedgerFifo([compra(4, 25, T(1)), ...t, ...anulacionDe(t)]);
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 4, value: 100, unknownQty: 0 });
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
  });
});

describe('anulación de producción · sub-subproductos', () => {
  it('devuelve el subproducto intermedio a su lote', () => {
    // sub2 se produce con pan; sub1 consume sub2.
    const base = [
      compra(100, 2, T(1)),
      ...tanda({ runId: 'runA', at: T(2), consume: [{ ing: 'ing1', qty: 100 }], produce: 10, sub: 'sub2' }),
    ];
    const anidada = [
      mov({
        id: 'runB-in',
        delta: -4,
        type: 'PRODUCTION',
        sourceType: 'production',
        sourceId: 'runB',
        entityType: 'SUBPRODUCT',
        subproductId: 'sub2',
        createdAt: T(3),
      }),
      mov({
        id: 'runB-out',
        delta: 2,
        type: 'PRODUCTION',
        sourceType: 'production',
        sourceId: 'runB',
        entityType: 'SUBPRODUCT',
        subproductId: 'sub1',
        createdAt: T(3),
      }),
    ];
    const r = runLedgerFifo([...base, ...anidada, ...anulacionDe(anidada)]);
    // sub2 vuelve a sus 10 unidades a $20 c/u ($200 de pan / 10).
    expect(r.remaining.get('SUBPRODUCT:sub2')).toEqual({ qty: 10, value: 200, unknownQty: 0 });
    expect(r.remaining.get('SUBPRODUCT:sub1')?.qty ?? 0).toBe(0);
  });
});

describe('anulación de producción · snapshot mensual', () => {
  it('el corte no cambia el resultado', () => {
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 30 }], produce: 3 });
    const historia = [compra(100, 4, T(1)), ...t, ...anulacionDe(t), compra(50, 9, T(20))];
    const completo = runLedgerFifo(historia);

    // Corte DESPUÉS de la tanda anulada: el incremental arranca del seed.
    const corte = T(10).toISOString();
    const previos = historia.filter((m) => m.createdAt.toISOString() < corte);
    const seed = buildLedgerSeed(runLedgerFifo(previos), corte);
    const incremental = runLedgerFifo(
      historia.filter((m) => m.createdAt.toISOString() >= corte),
      seed,
    );

    expect(incremental.needsFullReplay).toBe(false);
    expect(incremental.remaining.get('INGREDIENT:ing1')).toEqual(
      completo.remaining.get('INGREDIENT:ing1'),
    );
  });

  it('pide replay completo si la tanda quedó del otro lado del corte', () => {
    const t = tanda({ runId: 'run1', at: T(2), consume: [{ ing: 'ing1', qty: 30 }], produce: 3 });
    // Caso defensivo: la anulación entra en la ventana pero su tanda no.
    // La API nunca lo produce (la anulación nace con la fecha del original),
    // pero si pasara, el resultado tiene que declararse insuficiente.
    const corte = T(5).toISOString();
    const incremental = runLedgerFifo(
      anulacionDe(t).map((m) => ({ ...m, createdAt: T(6) })),
      buildLedgerSeed(runLedgerFifo([compra(100, 4, T(1)), ...t]), corte),
    );
    expect(incremental.needsFullReplay).toBe(true);
  });
});
