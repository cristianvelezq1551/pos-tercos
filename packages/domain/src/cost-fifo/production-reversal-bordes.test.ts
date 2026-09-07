import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_REVERSAL_SOURCE_TYPE,
  runLedgerFifo,
  type LedgerMovement,
} from './run-ledger';

/** Casos límite de la anulación de producción: lo que los tests felices no tocan. */

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
    productId: null,
    subproductId: entityType === 'SUBPRODUCT' ? (p.subproductId ?? 'sub1') : null,
    delta: p.delta,
  };
}
const T = (m: number) => new Date(2026, 2, 10, 9, m);

function tanda(o: { runId: string; at: Date; consume: { ing: string; qty: number }[]; produce: number; sub?: string }) {
  return [
    ...o.consume.map((c) => mov({ id: `${o.runId}-in-${c.ing}`, delta: -c.qty, type: 'PRODUCTION', sourceType: 'production', sourceId: o.runId, ingredientId: c.ing, createdAt: o.at })),
    mov({ id: `${o.runId}-out`, delta: o.produce, type: 'PRODUCTION', sourceType: 'production', sourceId: o.runId, entityType: 'SUBPRODUCT', subproductId: o.sub ?? 'sub1', createdAt: o.at }),
  ];
}
function anular(t: LedgerMovement[]) {
  return t.map((m) => mov({ id: `${m.id}-rev`, delta: -m.delta, type: 'PRODUCTION', sourceType: PRODUCTION_REVERSAL_SOURCE_TYPE, sourceId: m.sourceId, entityType: m.entityType, ingredientId: m.ingredientId ?? undefined, subproductId: m.subproductId ?? undefined, createdAt: m.createdAt }));
}
const compra = (q: number, c: number | null, at: Date, ing = 'ing1') =>
  mov({ delta: q, unitCost: c, type: 'PURCHASE', sourceType: 'invoice', createdAt: at, ingredientId: ing });

/** Σ deltas de la base == lotes − deudas del replay. La ley que nunca puede fallar. */
function unidadesCuadran(ms: LedgerMovement[]): { db: number; replay: number } {
  const f = runLedgerFifo(ms);
  let replay = 0;
  for (const r of f.remaining.values()) replay += r.qty;
  for (const ds of Object.values(f.endingDebts)) for (const d of ds) replay -= d.qty;
  return { db: ms.reduce((a, m) => a + m.delta, 0), replay };
}

describe('bordes de la anulación de producción', () => {
  it('tanda con costo PARCIAL (dos lotes: uno con costo y otro sin) se quita entera', () => {
    // 100 g con costo + 100 g sin costo → la tanda produce un lote conocido y uno desconocido.
    const t = tanda({ runId: 'r1', at: T(3), consume: [{ ing: 'ing1', qty: 100 }, { ing: 'ing2', qty: 100 }], produce: 10 });
    const ms = [compra(100, 5, T(1), 'ing1'), compra(100, null, T(2), 'ing2'), ...t, ...anular(t)];
    const f = runLedgerFifo(ms);
    // No queda ni una unidad del subproducto: los DOS lotes de la tanda salieron.
    expect(f.remaining.get('SUBPRODUCT:sub1')?.qty ?? 0).toBe(0);
    expect(f.endingLots['SUBPRODUCT:sub1']).toBeUndefined();
    const { db, replay } = unidadesCuadran(ms);
    expect(Math.abs(db - replay)).toBeLessThan(1e-6);
  });

  it('tanda ANIDADA: anular la de arriba devuelve el intermedio, y anular la de abajo cuadra igual', () => {
    const abajo = tanda({ runId: 'rA', at: T(2), consume: [{ ing: 'ing1', qty: 100 }], produce: 10, sub: 'sub2' });
    const arriba = [
      mov({ id: 'rB-in', delta: -4, type: 'PRODUCTION', sourceType: 'production', sourceId: 'rB', entityType: 'SUBPRODUCT', subproductId: 'sub2', createdAt: T(3) }),
      mov({ id: 'rB-out', delta: 2, type: 'PRODUCTION', sourceType: 'production', sourceId: 'rB', entityType: 'SUBPRODUCT', subproductId: 'sub1', createdAt: T(3) }),
    ];
    // Se anulan las DOS, la de arriba primero (que es como pasaría en la vida real).
    const ms = [compra(100, 2, T(1)), ...abajo, ...arriba, ...anular(arriba), ...anular(abajo)];
    const { db, replay } = unidadesCuadran(ms);
    expect(Math.abs(db - replay)).toBeLessThan(1e-6);
    const f = runLedgerFifo(ms);
    // Todo vuelve al principio: 100 g de insumo a $2, nada de subproductos.
    expect(f.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 100, value: 200, unknownQty: 0 });
    expect(f.remaining.get('SUBPRODUCT:sub2')?.qty ?? 0).toBe(0);
    expect(f.remaining.get('SUBPRODUCT:sub1')?.qty ?? 0).toBe(0);
  });

  it('anular la tanda de ABAJO cuando la de arriba ya consumió su producto deja deuda, sin descuadrar', () => {
    const abajo = tanda({ runId: 'rA', at: T(2), consume: [{ ing: 'ing1', qty: 100 }], produce: 10, sub: 'sub2' });
    const arriba = [
      mov({ id: 'rB-in', delta: -4, type: 'PRODUCTION', sourceType: 'production', sourceId: 'rB', entityType: 'SUBPRODUCT', subproductId: 'sub2', createdAt: T(3) }),
      mov({ id: 'rB-out', delta: 2, type: 'PRODUCTION', sourceType: 'production', sourceId: 'rB', entityType: 'SUBPRODUCT', subproductId: 'sub1', createdAt: T(3) }),
    ];
    const ms = [compra(100, 2, T(1)), ...abajo, ...arriba, ...anular(abajo)];
    const { db, replay } = unidadesCuadran(ms);
    expect(Math.abs(db - replay)).toBeLessThan(1e-6);
  });

  it('una MERMA del subproducto entre la tanda y su anulación no descuadra', () => {
    const t = tanda({ runId: 'r1', at: T(2), consume: [{ ing: 'ing1', qty: 100 }], produce: 10 });
    const merma = mov({ delta: -3, type: 'WASTE', entityType: 'SUBPRODUCT', createdAt: T(5) });
    const ms = [compra(100, 4, T(1)), ...t, ...anular(t), merma];
    const { db, replay } = unidadesCuadran(ms);
    expect(Math.abs(db - replay)).toBeLessThan(1e-6);
  });

  it('anular DOS tandas del mismo subproducto quita el lote de cada una, no el más viejo dos veces', () => {
    const t1 = tanda({ runId: 'r1', at: T(2), consume: [{ ing: 'ing1', qty: 50 }], produce: 5 });
    const t2 = tanda({ runId: 'r2', at: T(3), consume: [{ ing: 'ing1', qty: 50 }], produce: 5 });
    // Solo se anula la SEGUNDA: la primera tiene que quedar intacta, con su costo.
    const f = runLedgerFifo([compra(100, 10, T(1)), ...t1, ...t2, ...anular(t2)]);
    expect(f.remaining.get('SUBPRODUCT:sub1')).toEqual({ qty: 5, value: 500, unknownQty: 0 });
    expect((f.endingLots['SUBPRODUCT:sub1'] ?? []).map((l) => l.movementId)).toEqual(['r1-out']);
  });

  it('una FACTURA anulada del mismo insumo y una tanda anulada conviven sin pisarse', () => {
    const compraAnulada = [
      mov({ id: 'c2', delta: 50, unitCost: 9, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(4) }),
      mov({ id: 'c2-rev', delta: -50, type: 'PURCHASE', sourceType: 'invoice_reversal', sourceId: 'c2', createdAt: T(4) }),
    ];
    const t = tanda({ runId: 'r1', at: T(2), consume: [{ ing: 'ing1', qty: 30 }], produce: 3 });
    const ms = [compra(100, 4, T(1)), ...t, ...anular(t), ...compraAnulada];
    const f = runLedgerFifo(ms);
    expect(f.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 100, value: 400, unknownQty: 0 });
    const { db, replay } = unidadesCuadran(ms);
    expect(Math.abs(db - replay)).toBeLessThan(1e-6);
  });

  it('la anulación de una tanda SIN su tanda (dato corrupto) no infla el inventario', () => {
    // Caso imposible por la API, pero la LEY 1 tiene que valer igual.
    const t = tanda({ runId: 'r1', at: T(2), consume: [{ ing: 'ing1', qty: 40 }], produce: 4 });
    const ms = [compra(100, 4, T(1)), ...anular(t)];
    const { db, replay } = unidadesCuadran(ms);
    expect(Math.abs(db - replay)).toBeLessThan(1e-6);
  });
});
