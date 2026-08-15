import { describe, expect, it } from 'vitest';
import { buildLedgerSeed, runLedgerFifo, type LedgerFifo, type LedgerMovement } from './run-ledger';
import { generateHistory, type HistoryOptions } from '../test-support/ledger-histories';
import { rngFrom, seeds } from '../test-support/random';

/**
 * PRUEBAS DE PROPIEDAD del replay FIFO — auditoría matemática 2026-07-25.
 *
 * Los tests de escenario (`run-ledger.test.ts`) prueban casos escritos a mano.
 * Estos prueban LEYES sobre cientos de historias aleatorias bien formadas: si
 * una ley se rompe con alguna combinación de compras, ventas, mermas,
 * cortesías, producciones y reversas, acá aparece.
 *
 * Cada corrida usa una semilla FIJA y el error la imprime → un fallo se
 * reproduce exacto. Nada de `Math.random()`: un test que falla una de cada
 * diez veces no sirve para nada.
 */

/**
 * Historias aleatorias por ley. 120 en la corrida normal (~1s, suficiente para
 * regresiones); el nightly de CI corre con LEDGER_PROPERTY_RUNS=20000 — así se
 * encontró el bug de la reversa post-corte (semillas 1656071 y 7571564), que
 * con 120 corridas nunca aparecía. Para cazar un fallo local:
 * `LEDGER_PROPERTY_RUNS=20000 pnpm -F @pos-tercos/domain test run-ledger.property`.
 */
const RUNS =
  Number(process.env.LEDGER_PROPERTY_RUNS) > 0 ? Number(process.env.LEDGER_PROPERTY_RUNS) : 120;
const EPS = 1e-6;

/** Suma de todos los deltas: la verdad de la base de datos. */
function sumDeltas(movements: readonly LedgerMovement[]): number {
  return movements.reduce((a, m) => a + m.delta, 0);
}

/** Unidades que el replay dice que quedan (lotes − deudas pendientes). */
function netUnits(fifo: LedgerFifo): number {
  let qty = 0;
  for (const r of fifo.remaining.values()) qty += r.qty;
  for (const ds of Object.values(fifo.endingDebts)) {
    for (const d of ds) qty -= d.qty;
  }
  return qty;
}

/** Costo total que el replay atribuyó a ventas (neto de anulaciones). */
function attributedSaleCost(fifo: LedgerFifo): number {
  let cost = 0;
  for (const bySale of [fifo.saleIngredientCost, fifo.saleProductCost, fifo.saleSubproductCost]) {
    for (const entries of bySale.values()) {
      for (const e of entries.values()) cost += e.cost;
    }
  }
  return cost;
}

const run = (opts: Partial<HistoryOptions> = {}) => {
  const full: HistoryOptions = {
    steps: 60,
    allowShortfall: true,
    allowUnknownCost: true,
    includeProduction: true,
    ...opts,
  };
  return (seed: number) => {
    const history = generateHistory(rngFrom(seed), full);
    return { seed, history, fifo: runLedgerFifo(history.movements) };
  };
};

describe('runLedgerFifo — propiedades sobre historias aleatorias', () => {
  it('LEY 1: no crea ni destruye unidades (Σ deltas == lotes − deudas)', () => {
    const gen = run();
    for (const seed of seeds(RUNS)) {
      const { history, fifo } = gen(seed);
      const enDb = sumDeltas(history.movements);
      const enReplay = netUnits(fifo);
      // Si esto falla, el inventario del reporte se separó del de la base:
      // el dueño ve stock que no existe (o le falta el que sí tiene).
      expect(
        Math.abs(enDb - enReplay),
        `semilla ${seed}: la base dice ${enDb} unidades y el replay ${enReplay}`,
      ).toBeLessThan(1e-4);
    }
  });

  it('LEY 2: con costos completos, el valor se conserva (entra == sale + queda)', () => {
    // Sin faltantes ni costos desconocidos, cada peso que entró tiene que estar
    // en un lote restante o haberse atribuido a una venta, merma o cortesía.
    const gen = run({ allowShortfall: false, allowUnknownCost: false });
    for (const seed of seeds(RUNS)) {
      const { history, fifo } = gen(seed);
      let enLotes = 0;
      for (const r of fifo.remaining.values()) enLotes += r.value;
      const salidas =
        attributedSaleCost(fifo) +
        fifo.waste.reduce((a, w) => a + w.cost, 0) +
        fifo.cortesia.reduce((a, c) => a + c.cost, 0);

      expect(
        Math.abs(history.valueIn - (enLotes + salidas)),
        `semilla ${seed}: entraron $${history.valueIn}, quedan $${enLotes} y salieron $${salidas}`,
      ).toBeLessThan(0.5); // tolerancia por el redondeo a 4 decimales del ledger
    }
  });

  it('LEY 3: ningún lote, valor o cantidad queda negativo ni en NaN', () => {
    const gen = run();
    for (const seed of seeds(RUNS)) {
      const { fifo } = gen(seed);
      for (const [key, r] of fifo.remaining) {
        expect(Number.isFinite(r.qty), `semilla ${seed}, ${key}: qty no finita`).toBe(true);
        expect(Number.isFinite(r.value), `semilla ${seed}, ${key}: valor no finito`).toBe(true);
        expect(r.qty, `semilla ${seed}, ${key}: cantidad negativa`).toBeGreaterThanOrEqual(-EPS);
        expect(r.value, `semilla ${seed}, ${key}: valor negativo`).toBeGreaterThanOrEqual(-EPS);
        expect(r.unknownQty, `semilla ${seed}, ${key}`).toBeGreaterThanOrEqual(-EPS);
      }
      for (const lots of fifo.remainingLots.values()) {
        for (const l of lots) {
          expect(l.qty).toBeGreaterThan(-EPS);
          if (l.unitCost !== null) expect(l.unitCost).toBeGreaterThanOrEqual(0);
        }
      }
      for (const ds of Object.values(fifo.endingDebts)) {
        for (const d of ds) expect(d.qty, `semilla ${seed}: deuda negativa`).toBeGreaterThan(0);
      }
    }
  });

  it('LEY 4: nunca se asume costo $0 — lo desconocido se reporta como desconocido', () => {
    const gen = run();
    for (const seed of seeds(RUNS)) {
      const { fifo } = gen(seed);
      for (const [key, r] of fifo.remaining) {
        // Un lote con cantidad y valor 0 solo es legítimo si esas unidades
        // están declaradas como de costo desconocido.
        if (r.qty > EPS && r.value < EPS) {
          expect(
            r.unknownQty,
            `semilla ${seed}, ${key}: ${r.qty} unidades valuadas en $0 sin declararlas desconocidas`,
          ).toBeGreaterThan(EPS);
        }
      }
    }
  });

  it('LEY 4.b: las unidades SIN costo se conservan (no se valúan calladas en $0)', () => {
    // La ley 4 mira los lotes que QUEDAN; esta cubre el camino del CONSUMO,
    // que es donde el daño sería peor: valuar en $0 un insumo de costo
    // desconocido equivale a regalarlo en el P&G, y el margen sale inflado
    // sin que nada lo avise. (Hueco encontrado por prueba de mutación: la ley 4
    // sola no detectaba el cambio `unknownQty += take` → `cost += 0`.)
    //
    // Ley: toda unidad que entró sin costo sigue estando declarada como
    // desconocida al final — o en un lote que queda, o atribuida al consumo
    // que se la llevó.
    const gen = run({ allowShortfall: false });
    for (const seed of seeds(RUNS)) {
      const { history, fifo } = gen(seed);
      if (history.unknownUnitsIn === 0) continue;

      let enLotes = 0;
      for (const r of fifo.remaining.values()) enLotes += r.unknownQty;
      let consumidas = 0;
      for (const bySale of [fifo.saleIngredientCost, fifo.saleProductCost, fifo.saleSubproductCost]) {
        for (const entries of bySale.values()) {
          for (const e of entries.values()) consumidas += e.unknownQty;
        }
      }
      consumidas += fifo.waste.reduce((a, w) => a + w.unknownQty, 0);
      consumidas += fifo.cortesia.reduce((a, c) => a + c.unknownQty, 0);

      // La producción TRANSFORMA lo desconocido: consume insumos sin costo y
      // emite un lote sin costo. Esas unidades cambian de forma (gramos de
      // insumo → porciones de subproducto), así que el conteo no se compara
      // uno a uno; lo que no puede pasar es que DESAPAREZCAN.
      expect(
        enLotes + consumidas,
        `semilla ${seed}: entraron ${history.unknownUnitsIn} unidades sin costo y el replay solo declara ${enLotes + consumidas} — el resto quedó valuado en $0`,
      ).toBeGreaterThan(0);
    }
  });

  it('LEY 4.c: consumir un lote sin costo reporta esas unidades como desconocidas', () => {
    // La misma ley que 4.b pero exacta y sin producción de por medio: se sabe
    // cuántas unidades sin costo se consumieron, así que se exige el número.
    for (const seed of seeds(40)) {
      const rng = rngFrom(seed);
      const conCosto = rng.int(5, 50);
      const sinCosto = rng.int(5, 50);
      const precio = rng.int(1, 40);
      const vendido = conCosto + rng.int(1, sinCosto); // cruza los dos lotes
      const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 8, min));
      const base = {
        sourceType: null,
        sourceId: null,
        entityType: 'INGREDIENT' as const,
        ingredientId: 'ing-1',
        productId: null,
        subproductId: null,
      };
      const fifo = runLedgerFifo([
        { ...base, id: 'm1', createdAt: at(0), delta: conCosto, unitCost: precio, type: 'PURCHASE' },
        { ...base, id: 'm2', createdAt: at(1), delta: sinCosto, unitCost: null, type: 'INITIAL' },
        { ...base, id: 'm3', createdAt: at(2), delta: -vendido, unitCost: null, type: 'SALE', sourceId: 'sale-1' },
      ]);
      const e = fifo.saleIngredientCost.get('sale-1')!.get('ing-1')!;
      // El costo cubre SOLO el lote que tenía precio.
      expect(e.cost, `semilla ${seed}`).toBeCloseTo(conCosto * precio, 4);
      // Y las unidades del lote sin precio se declaran desconocidas, no en $0.
      expect(e.unknownQty, `semilla ${seed}`).toBeCloseTo(vendido - conCosto, 4);
    }
  });

  it('LEY 5: el replay es determinista (misma historia → mismo resultado)', () => {
    const gen = run();
    for (const seed of seeds(30)) {
      const { history } = gen(seed);
      const a = runLedgerFifo(history.movements);
      const b = runLedgerFifo(history.movements);
      expect(a.endingLots, `semilla ${seed}`).toEqual(b.endingLots);
      expect(a.endingDebts, `semilla ${seed}`).toEqual(b.endingDebts);
      expect(attributedSaleCost(a)).toBe(attributedSaleCost(b));
    }
  });

  it('LEY 6: el snapshot no cambia el resultado (replay completo == corte + incremental)', () => {
    // La arquitectura de snapshot solo es válida si arrancar desde una foto
    // del mes pasado da EXACTAMENTE lo mismo que rebobinar desde el génesis.
    // Se prueba con cortes en puntos aleatorios de cada historia.
    const gen = run();
    for (const seed of seeds(RUNS)) {
      const { history } = gen(seed);
      const movs = history.movements;
      if (movs.length < 10) continue;
      const rng = rngFrom(seed + 1);
      const cutIdx = rng.int(2, movs.length - 2);
      const cutoff = movs[cutIdx]!.createdAt;

      const completo = runLedgerFifo(movs);
      const antes = movs.filter((m) => m.createdAt < cutoff);
      const desde = movs.filter((m) => m.createdAt >= cutoff);
      // La semilla se serializa a JSON en la base: el round-trip va incluido.
      const seed0 = JSON.parse(
        JSON.stringify(buildLedgerSeed(runLedgerFifo(antes), cutoff.toISOString())),
      );
      const incremental = runLedgerFifo(desde, seed0);

      if (incremental.needsFullReplay) continue; // el sistema cae a completo: correcto por diseño

      expect(netUnits(incremental), `semilla ${seed}: unidades tras el corte`).toBeCloseTo(
        netUnits(completo),
        4,
      );
      let valCompleto = 0;
      let valIncremental = 0;
      for (const r of completo.remaining.values()) valCompleto += r.value;
      for (const r of incremental.remaining.values()) valIncremental += r.value;
      expect(valIncremental, `semilla ${seed}: valorización tras el corte`).toBeCloseTo(
        valCompleto,
        2,
      );
      // Merma y cortesías históricas sobreviven al corte (van en la semilla).
      expect(
        incremental.waste.reduce((a, w) => a + w.cost, 0),
        `semilla ${seed}: merma acumulada`,
      ).toBeCloseTo(completo.waste.reduce((a, w) => a + w.cost, 0), 2);
      expect(
        incremental.cortesia.reduce((a, c) => a + c.cost, 0),
        `semilla ${seed}: cortesías acumuladas`,
      ).toBeCloseTo(completo.cortesia.reduce((a, c) => a + c.cost, 0), 2);
    }
  });

  it('LEY 7: una venta anulada por completo no deja costo ni unidades colgadas', () => {
    // Historia mínima y controlada: comprar dos lotes a precios distintos,
    // vender cruzándolos y anular TODO. El neto tiene que quedar en cero
    // exacto y las unidades volver con su costo original (no el último).
    for (const seed of seeds(40)) {
      const rng = rngFrom(seed);
      const c1 = rng.int(1, 40);
      const c2 = rng.int(1, 40);
      const q1 = rng.int(5, 50);
      const q2 = rng.int(5, 50);
      const vendido = rng.int(1, q1 + q2);
      const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 8, min));
      const base = {
        type: 'PURCHASE',
        sourceType: null,
        sourceId: null,
        entityType: 'INGREDIENT' as const,
        ingredientId: 'ing-1',
        productId: null,
        subproductId: null,
      };
      const movs: LedgerMovement[] = [
        { ...base, id: 'm1', createdAt: at(0), delta: q1, unitCost: c1 },
        { ...base, id: 'm2', createdAt: at(1), delta: q2, unitCost: c2 },
        { ...base, id: 'm3', createdAt: at(2), delta: -vendido, unitCost: null, type: 'SALE', sourceId: 'sale-1' },
        { ...base, id: 'm4', createdAt: at(3), delta: vendido, unitCost: null, type: 'SALE', sourceId: 'sale-1' },
      ];
      const fifo = runLedgerFifo(movs);
      const costo = attributedSaleCost(fifo);
      expect(Math.abs(costo), `semilla ${seed}: la anulación dejó $${costo} colgados`).toBeLessThan(0.01);
      const r = fifo.remaining.get('INGREDIENT:ing-1')!;
      expect(r.qty).toBeCloseTo(q1 + q2, 4);
      // El valor vuelve intacto: se devolvieron los lotes reales, no una estimación.
      expect(r.value).toBeCloseTo(q1 * c1 + q2 * c2, 2);
    }
  });

  it('LEY 9: lo devuelto por una anulación vuelve a la CABEZA de la cola', () => {
    // Las unidades que devuelve un void se consumieron del frente, así que son
    // MÁS VIEJAS que lo que quedó: tienen que volver primero en la fila. Si se
    // re-inyectan al final, la venta siguiente consume el lote equivocado y su
    // costo sale mal — sin que cambie ni la cantidad ni el valor total, así que
    // las leyes 1, 2 y 7 no lo ven. (Hueco encontrado por prueba de mutación.)
    for (const seed of seeds(40)) {
      const rng = rngFrom(seed);
      const barato = rng.int(1, 20);
      const caro = barato + rng.int(5, 40); // segundo lote estrictamente más caro
      const qty = rng.int(5, 30);
      const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 8, min));
      const base = {
        sourceType: null,
        sourceId: null,
        entityType: 'INGREDIENT' as const,
        ingredientId: 'ing-1',
        productId: null,
        subproductId: null,
      };
      const costoDe = (saleId: string, fifo: LedgerFifo): number =>
        fifo.saleIngredientCost.get(saleId)?.get('ing-1')?.cost ?? 0;

      const fifo = runLedgerFifo([
        { ...base, id: 'm1', createdAt: at(0), delta: qty, unitCost: barato, type: 'PURCHASE' },
        { ...base, id: 'm2', createdAt: at(1), delta: qty, unitCost: caro, type: 'PURCHASE' },
        // Venta 1: consume el lote BARATO (es el más viejo).
        { ...base, id: 'm3', createdAt: at(2), delta: -qty, unitCost: null, type: 'SALE', sourceId: 'sale-1' },
        // Se anula: las unidades baratas vuelven, y son las más viejas.
        { ...base, id: 'm4', createdAt: at(3), delta: qty, unitCost: null, type: 'SALE', sourceId: 'sale-1' },
        // Venta 2: tiene que volver a consumir el lote BARATO, no el caro.
        { ...base, id: 'm5', createdAt: at(4), delta: -qty, unitCost: null, type: 'SALE', sourceId: 'sale-2' },
      ]);

      expect(
        costoDe('sale-2', fifo),
        `semilla ${seed}: tras anular, la venta siguiente debió costar el lote barato ($${barato}/u)`,
      ).toBeCloseTo(qty * barato, 4);
      // Y lo que queda en inventario es el lote caro, intacto.
      expect(fifo.remaining.get('INGREDIENT:ing-1')!.value).toBeCloseTo(qty * caro, 2);
    }
  });

  it('LEY 8: una compra posterior salda la deuda de una venta forzada, sin contar doble', () => {
    // Venta sin stock (forzada) → deuda + costo estimado. Cuando llega la
    // compra, el costo tiene que quedar en el REAL, no en estimado + real.
    for (const seed of seeds(40)) {
      const rng = rngFrom(seed);
      const estimado = rng.int(1, 30);
      const real = rng.int(1, 30);
      const qty = rng.int(1, 20);
      const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 8, min));
      const base = {
        sourceType: null,
        sourceId: null,
        entityType: 'INGREDIENT' as const,
        ingredientId: 'ing-1',
        productId: null,
        subproductId: null,
      };
      const movs: LedgerMovement[] = [
        // Una compra previa fija el "último precio conocido" (base del estimado).
        { ...base, id: 'm1', createdAt: at(0), delta: 1, unitCost: estimado, type: 'PURCHASE' },
        { ...base, id: 'm2', createdAt: at(1), delta: -1, unitCost: null, type: 'SALE', sourceId: 'sale-0' },
        // Venta sin stock: se estima y queda deuda.
        { ...base, id: 'm3', createdAt: at(2), delta: -qty, unitCost: null, type: 'SALE', sourceId: 'sale-1' },
        // Llega la factura real.
        { ...base, id: 'm4', createdAt: at(3), delta: qty, unitCost: real, type: 'PURCHASE' },
      ];
      const fifo = runLedgerFifo(movs);
      const deSale1 = fifo.saleIngredientCost.get('sale-1')?.get('ing-1');
      expect(deSale1, `semilla ${seed}`).toBeDefined();
      // El costo final es el REAL de la compra que saldó la deuda.
      expect(deSale1!.cost, `semilla ${seed}`).toBeCloseTo(qty * real, 2);
      // Y deja de estar marcado como estimado.
      expect(deSale1!.estimatedQty, `semilla ${seed}`).toBeCloseTo(0, 6);
      expect(Object.keys(fifo.endingDebts), `semilla ${seed}: quedó deuda sin saldar`).toHaveLength(0);
    }
  });
});
