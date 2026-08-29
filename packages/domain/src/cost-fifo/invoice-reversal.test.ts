import { describe, expect, it } from 'vitest';
import { buildLedgerSeed, runLedgerFifo, type LedgerMovement } from './run-ledger';

/**
 * ANULAR UNA FACTURA en el motor de costos.
 *
 * La regla que prueban estos casos: anular tiene que dejar los libros IGUALES
 * a como estarían si esa factura nunca se hubiera cargado. Por eso casi todos
 * comparan contra una historia gemela sin la compra — es la única definición
 * de "sin dejar ruido" que se puede verificar.
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
    sourceType: p.sourceType ?? (p.type === 'SALE' || (!p.type && p.delta < 0) ? 'sale' : null),
    sourceId: p.sourceId ?? null,
    entityType,
    ingredientId: entityType === 'INGREDIENT' ? (p.ingredientId ?? 'ing1') : null,
    productId: entityType === 'PRODUCT' ? (p.productId ?? 'prod1') : null,
    subproductId: entityType === 'SUBPRODUCT' ? (p.subproductId ?? 'sub1') : null,
    delta: p.delta,
  };
}

/** Compra + su anulación, pegadas en el tiempo (como las escribe la API). */
function compraAnulada(opts: {
  id: string;
  qty: number;
  unitCost: number | null;
  at: Date;
}): LedgerMovement[] {
  return [
    mov({ id: opts.id, delta: opts.qty, unitCost: opts.unitCost, type: 'PURCHASE', sourceType: 'invoice', createdAt: opts.at }),
    mov({
      id: `${opts.id}-rev`,
      delta: -opts.qty,
      type: 'PURCHASE',
      sourceType: 'invoice_reversal',
      sourceId: opts.id,
      createdAt: opts.at,
    }),
  ];
}

const T = (min: number): Date => new Date(2026, 2, 10, 9, min);

describe('anulación de factura · el lote correcto', () => {
  it('quita EL lote de esa compra, no el más viejo de la cola', () => {
    const r = runLedgerFifo([
      mov({ id: 'viejo', delta: 10, unitCost: 100, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
      ...compraAnulada({ id: 'nuevo', qty: 10, unitCost: 900, at: T(2) }),
    ]);
    // Quedan las 10 unidades del lote viejo, a su costo: $1.000.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 10, value: 1000, unknownQty: 0 });
    // Si hubiera consumido por FIFO, se habría comido el lote viejo y habría
    // dejado en inventario el lote caro que justamente se está anulando.
    const lotes = r.endingLots['INGREDIENT:ing1'] ?? [];
    expect(lotes.map((l) => l.movementId)).toEqual(['viejo']);
  });

  it('anular deja el inventario igual que si la factura nunca hubiera entrado', () => {
    const conFactura = runLedgerFifo([
      mov({ id: 'base', delta: 4, unitCost: 50, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
      ...compraAnulada({ id: 'anulada', qty: 6, unitCost: 80, at: T(2) }),
    ]);
    const sinFactura = runLedgerFifo([
      mov({ id: 'base', delta: 4, unitCost: 50, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
    ]);
    expect(conFactura.remaining).toEqual(sinFactura.remaining);
  });

  it('anular una de dos líneas del mismo insumo solo quita esa', () => {
    const r = runLedgerFifo([
      mov({ id: 'linea-a', delta: 5, unitCost: 10, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
      mov({ id: 'linea-b', delta: 5, unitCost: 30, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
      mov({ id: 'rev-b', delta: -5, type: 'PURCHASE', sourceType: 'invoice_reversal', sourceId: 'linea-b', createdAt: T(1) }),
    ]);
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 5, value: 50, unknownQty: 0 });
  });
});

describe('anulación de factura · lo que ya se había vendido', () => {
  it('las ventas que se comieron esa mercancía pasan a ser faltantes estimados', () => {
    // Se compró a $80, se vendieron 6 y después se anula la factura: esas 6
    // unidades ya no tienen respaldo. El motor las trata como cualquier venta
    // sin stock — estimadas al último precio conocido, con su deuda.
    const r = runLedgerFifo([
      ...compraAnulada({ id: 'compra', qty: 10, unitCost: 80, at: T(1) }),
      mov({ delta: -6, type: 'SALE', sourceId: 'venta1', createdAt: T(5) }),
    ]);
    const venta = r.saleIngredientCost.get('venta1')?.get('ing1');
    expect(venta?.qty).toBe(6);
    expect(venta?.estimatedQty).toBe(6);
    expect(venta?.cost).toBe(480); // 6 × $80, el último precio conocido
    // Y queda la deuda: 6 unidades que el negocio debe.
    expect(r.endingDebts['INGREDIENT:ing1']?.[0]?.qty).toBe(6);
  });

  it('la compra corregida salda esa deuda al costo REAL, sin contar doble', () => {
    const r = runLedgerFifo([
      ...compraAnulada({ id: 'compra-mala', qty: 10, unitCost: 80, at: T(1) }),
      mov({ delta: -6, type: 'SALE', sourceId: 'venta1', createdAt: T(5) }),
      // Se vuelve a cargar bien: costaba $100, no $80.
      mov({ id: 'compra-buena', delta: 10, unitCost: 100, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(9) }),
    ]);
    const venta = r.saleIngredientCost.get('venta1')?.get('ing1');
    expect(venta?.cost).toBe(600); // 6 × $100 real, no 480 + 600
    expect(venta?.estimatedQty).toBe(0);
    expect(r.endingDebts['INGREDIENT:ing1']).toBeUndefined();
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 4, value: 400, unknownQty: 0 });
  });

  it('las unidades cuadran con la base de datos aunque el stock quede negativo', () => {
    const movimientos = [
      ...compraAnulada({ id: 'compra', qty: 10, unitCost: 80, at: T(1) }),
      mov({ delta: -6, type: 'SALE', sourceId: 'venta1', createdAt: T(5) }),
    ];
    const sumaDeltas = movimientos.reduce((a, m) => a + m.delta, 0); // 10 − 10 − 6 = −6
    const r = runLedgerFifo(movimientos);
    const enLotes = r.remaining.get('INGREDIENT:ing1')?.qty ?? 0;
    const enDeudas = (r.endingDebts['INGREDIENT:ing1'] ?? []).reduce((a, d) => a + d.qty, 0);
    expect(enLotes - enDeudas).toBe(sumaDeltas);
  });
});

describe('anulación de factura · casos de borde', () => {
  it('una compra sin costo conocido se anula igual', () => {
    const r = runLedgerFifo(compraAnulada({ id: 'c', qty: 7, unitCost: null, at: T(1) }));
    // En cero, no ausente: la cola vacía es la misma forma que deja consumir.
    expect(r.remaining.get('INGREDIENT:ing1')).toEqual({ qty: 0, value: 0, unknownQty: 0 });
  });

  it('anular una compra de producto de reventa quita su lote', () => {
    const r = runLedgerFifo([
      mov({ id: 'p1', delta: 24, unitCost: 2000, type: 'PURCHASE', sourceType: 'invoice', entityType: 'PRODUCT', createdAt: T(1) }),
      mov({ id: 'p1-rev', delta: -24, type: 'PURCHASE', sourceType: 'invoice_reversal', sourceId: 'p1', entityType: 'PRODUCT', createdAt: T(1) }),
    ]);
    expect(r.remaining.get('PRODUCT:prod1')).toEqual({ qty: 0, value: 0, unknownQty: 0 });
  });

  it('no toca la merma ni las cortesías del período', () => {
    const r = runLedgerFifo([
      mov({ id: 'otra', delta: 20, unitCost: 10, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
      mov({ delta: -2, type: 'WASTE', sourceType: null, createdAt: T(3) }),
      ...compraAnulada({ id: 'anulada', qty: 5, unitCost: 99, at: T(5) }),
    ]);
    expect(r.waste).toHaveLength(1);
    expect(r.waste[0]!.cost).toBe(20); // 2 × $10 del lote que sí existe
    expect(r.cortesia).toHaveLength(0);
  });

  it('si la reversa llegara suelta (sin su lote) las unidades igual cuadran', () => {
    // Camino defensivo: inalcanzable mientras la API escriba la reversa pegada
    // a su lote. Lo que NO puede pasar nunca es que el inventario del motor
    // deje de cuadrar con la suma de movimientos de la base.
    const movimientos = [
      mov({ id: 'viejo', delta: 10, unitCost: 5, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
      mov({ id: 'huerfana', delta: -4, type: 'PURCHASE', sourceType: 'invoice_reversal', sourceId: 'no-existe', createdAt: T(2) }),
    ];
    const r = runLedgerFifo(movimientos);
    const enLotes = r.remaining.get('INGREDIENT:ing1')?.qty ?? 0;
    const enDeudas = (r.endingDebts['INGREDIENT:ing1'] ?? []).reduce((a, d) => a + d.qty, 0);
    expect(enLotes - enDeudas).toBe(6);
  });

  it('una reversa sin origen no hace nada raro', () => {
    const r = runLedgerFifo([
      mov({ id: 'c', delta: 10, unitCost: 5, type: 'PURCHASE', sourceType: 'invoice', createdAt: T(1) }),
      mov({ id: 'rara', delta: -3, type: 'PURCHASE', sourceType: 'invoice_reversal', sourceId: null, createdAt: T(2) }),
    ]);
    // Sin `sourceId` no se puede apuntar a un lote: cae al consumo normal.
    expect(r.remaining.get('INGREDIENT:ing1')?.qty).toBe(7);
  });
});

describe('anulación de factura · con corte mensual del motor', () => {
  it('replay incremental desde el corte da lo mismo que el replay completo', () => {
    // La API borra los cortes posteriores a la fecha corregida justamente para
    // que esto se cumpla: acá el corte queda ANTES de la compra anulada.
    const movimientos = [
      mov({ id: 'previo', delta: 20, unitCost: 10, type: 'PURCHASE', sourceType: 'invoice', createdAt: new Date(2026, 1, 15, 10, 0) }),
      mov({ delta: -5, type: 'SALE', sourceId: 'venta-vieja', createdAt: new Date(2026, 1, 20, 10, 0) }),
      ...compraAnulada({ id: 'compra', qty: 8, unitCost: 40, at: T(1) }),
      mov({ delta: -6, type: 'SALE', sourceId: 'venta-nueva', createdAt: T(6) }),
    ];
    const corte = new Date(2026, 2, 1);

    const completo = runLedgerFifo(movimientos);
    const hastaElCorte = runLedgerFifo(movimientos.filter((m) => m.createdAt < corte));
    const semilla = buildLedgerSeed(hastaElCorte, corte.toISOString());
    const incremental = runLedgerFifo(
      movimientos.filter((m) => m.createdAt >= corte),
      semilla,
    );

    expect(incremental.needsFullReplay).toBe(false);
    expect(incremental.remaining).toEqual(completo.remaining);
    expect(incremental.saleIngredientCost.get('venta-nueva')?.get('ing1')).toEqual(
      completo.saleIngredientCost.get('venta-nueva')?.get('ing1'),
    );
  });
});
