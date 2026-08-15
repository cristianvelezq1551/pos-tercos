import { describe, expect, it } from 'vitest';
import { manualDiscountAmount } from './manual-discount';
import { roundCost, roundMoney } from './money';
import { computeBreakEven } from '../finance/break-even';
import { applyPromotion } from '../promotions/apply-promotions';
import type { PromotionDef } from '../promotions/types';
import { expandRecipe } from '../recipe/expand-recipe';
import { expandRecipeOneLevel } from '../recipe/expand-recipe-one-level';
import type { RecipeGraph } from '../recipe/types';
import { rngFrom, seeds } from '../test-support/random';

/**
 * PRUEBAS DE PROPIEDAD de la matemática de plata — auditoría 2026-07-25.
 *
 * Mismas reglas que las del FIFO: leyes sobre miles de entradas aleatorias,
 * con semillas fijas para que un fallo se reproduzca exacto.
 *
 * Lo que se prueba acá es lo que el cliente PAGA y lo que el dueño DECIDE:
 * descuentos, promociones, recetas y punto de equilibrio.
 */

const RUNS = 300;

describe('roundMoney / roundCost — propiedades', () => {
  it('roundMoney siempre da un entero y es idempotente', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const n = rng.float(-1_000_000, 1_000_000);
      const r = roundMoney(n);
      expect(Number.isInteger(r), `semilla ${seed}: ${n} → ${r}`).toBe(true);
      expect(roundMoney(r), `semilla ${seed}`).toBe(r);
      // Nunca se aleja más de medio peso del valor real.
      expect(Math.abs(r - n)).toBeLessThanOrEqual(0.5);
    }
  });

  it('roundCost nunca se desvía más de 0,00005 y es idempotente', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const n = rng.float(-100_000, 100_000);
      const r = roundCost(n);
      expect(Math.abs(r - n), `semilla ${seed}: ${n} → ${r}`).toBeLessThanOrEqual(0.00005);
      expect(roundCost(r), `semilla ${seed}`).toBe(r);
    }
  });

  it('la deriva acumulada de roundCost se mantiene acotada al sumar miles de costos', () => {
    // Cota declarada en la documentación: $0,48 por cada $1.000.000 movido.
    // Acá se verifica el orden de magnitud sobre 5.000 sumas encadenadas.
    for (const seed of seeds(20)) {
      const rng = rngFrom(seed);
      let exacto = 0;
      let redondeado = 0;
      let movido = 0;
      for (let i = 0; i < 5_000; i++) {
        const v = rng.float(0.0001, 200);
        exacto += v;
        redondeado += roundCost(v);
        movido += v;
      }
      const derivaPorMillon = (Math.abs(exacto - redondeado) / movido) * 1_000_000;
      expect(derivaPorMillon, `semilla ${seed}`).toBeLessThan(1);
    }
  });
});

describe('manualDiscountAmount — propiedades', () => {
  it('el descuento siempre queda entre 0 y la base, y es entero', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const base = rng.int(0, 500_000);
      const kind = rng.chance(0.5) ? 'PERCENT' : ('FIXED' as const);
      // Se prueban valores ABSURDOS a propósito: 300%, montos mayores a la
      // cuenta, negativos. Un descuento nunca puede dejar el total en negativo
      // (sería pagarle al cliente por comprar).
      const value = rng.chance(0.2) ? rng.float(-100, 0) : rng.float(0, kind === 'PERCENT' ? 300 : base * 3);
      const d = manualDiscountAmount(base, { kind, value });
      expect(Number.isInteger(d), `semilla ${seed}`).toBe(true);
      expect(d, `semilla ${seed}: base ${base}, ${kind} ${value} → ${d}`).toBeGreaterThanOrEqual(0);
      expect(d, `semilla ${seed}: base ${base}, ${kind} ${value} → ${d}`).toBeLessThanOrEqual(base);
    }
  });

  it('un porcentaje mayor descuenta más (monotonía)', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const base = rng.int(1_000, 500_000);
      const a = rng.float(0, 50);
      const b = a + rng.float(0.1, 50);
      expect(
        manualDiscountAmount(base, { kind: 'PERCENT', value: b }),
        `semilla ${seed}`,
      ).toBeGreaterThanOrEqual(manualDiscountAmount(base, { kind: 'PERCENT', value: a }));
    }
  });
});

describe('applyPromotion — propiedades', () => {
  const DOMINGO_A_SABADO = 127; // los 7 bits encendidos

  function randomPromos(seed: number, productId: string): PromotionDef[] {
    const rng = rngFrom(seed);
    const n = rng.int(0, 4);
    return Array.from({ length: n }, (_, i) => {
      const type = rng.pick(['PERCENT_OFF', 'FIXED_OFF', 'BOGO', 'COMBO_OFF'] as const);
      return {
        id: `promo-${i}`,
        type,
        discountPct: type === 'PERCENT_OFF' || type === 'COMBO_OFF' ? rng.float(0.01, 0.9) : undefined,
        discountFixed: type === 'FIXED_OFF' ? rng.int(100, 50_000) : undefined,
        bogoBuyQty: type === 'BOGO' ? rng.int(1, 3) : undefined,
        bogoGetQty: type === 'BOGO' ? rng.int(1, 2) : undefined,
        daysOfWeekMask: DOMINGO_A_SABADO,
        timeStart: '00:00:00',
        timeEnd: '23:59:59',
        activeFrom: null,
        activeTo: null,
        productIds: new Set([productId]),
      } satisfies PromotionDef;
    });
  }

  it('el descuento nunca supera el subtotal ni queda negativo, y es entero', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const quantity = rng.int(1, 20);
      const lineSubtotal = rng.int(1, 40) * 1_000 * quantity;
      const promos = randomPromos(seed, 'prod-1');
      const r = applyPromotion(
        { productId: 'prod-1', lineSubtotal, quantity, isCombo: rng.chance(0.3), at: new Date(2026, 5, 15, 13, 0) },
        promos,
      );
      expect(Number.isInteger(r.lineDiscount), `semilla ${seed}`).toBe(true);
      expect(r.lineDiscount, `semilla ${seed}`).toBeGreaterThanOrEqual(0);
      // La ley que protege la caja: el total de la línea nunca se vuelve negativo.
      expect(
        r.lineDiscount,
        `semilla ${seed}: descuento ${r.lineDiscount} sobre subtotal ${lineSubtotal}`,
      ).toBeLessThanOrEqual(lineSubtotal);
    }
  });

  it('gana siempre la promo de MAYOR descuento (nunca una peor para el cliente)', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const quantity = rng.int(1, 20);
      const lineSubtotal = rng.int(1, 40) * 1_000 * quantity;
      const promos = randomPromos(seed, 'prod-1');
      if (promos.length < 2) continue;
      const at = new Date(2026, 5, 15, 13, 0);
      const isCombo = rng.chance(0.3);
      const ganador = applyPromotion({ productId: 'prod-1', lineSubtotal, quantity, isCombo, at }, promos);

      // Ninguna promo por separado puede dar más que la elegida.
      for (const p of promos) {
        const sola = applyPromotion({ productId: 'prod-1', lineSubtotal, quantity, isCombo, at }, [p]);
        expect(
          sola.lineDiscount,
          `semilla ${seed}: la promo ${p.id} daba ${sola.lineDiscount} y se eligió ${ganador.lineDiscount}`,
        ).toBeLessThanOrEqual(ganador.lineDiscount);
      }
      // Y no se acumulan: el elegido es exactamente lo que da esa promo sola.
      if (ganador.appliedPromotionId) {
        const elegido = promos.find((p) => p.id === ganador.appliedPromotionId)!;
        const sola = applyPromotion({ productId: 'prod-1', lineSubtotal, quantity, isCombo, at }, [elegido]);
        expect(sola.lineDiscount, `semilla ${seed}`).toBe(ganador.lineDiscount);
      }
    }
  });

  it('sin promociones que apliquen, no hay descuento', () => {
    for (const seed of seeds(100)) {
      const rng = rngFrom(seed);
      const promos = randomPromos(seed, 'OTRO-PRODUCTO');
      const r = applyPromotion(
        {
          productId: 'prod-1',
          lineSubtotal: rng.int(1_000, 500_000),
          quantity: rng.int(1, 10),
          isCombo: false,
          at: new Date(2026, 5, 15, 13, 0),
        },
        promos,
      );
      expect(r.lineDiscount, `semilla ${seed}`).toBe(0);
      expect(r.appliedPromotionId, `semilla ${seed}`).toBeNull();
    }
  });
});

describe('expandRecipe — propiedades', () => {
  /** Grafo simple: producto → 2 insumos, con merma aleatoria. */
  function buildGraph(seed: number): { graph: RecipeGraph; mermas: number[]; netas: number[] } {
    const rng = rngFrom(seed);
    const netas = [rng.float(1, 500), rng.float(1, 500)];
    const mermas = [rng.float(0, 0.6), rng.float(0, 0.6)];
    const graph: RecipeGraph = {
      products: new Map([['p1', { id: 'p1', name: 'P' }]]),
      subproducts: new Map(),
      ingredients: new Map([
        ['i1', { id: 'i1', name: 'A', unitRecipe: 'g' }],
        ['i2', { id: 'i2', name: 'B', unitRecipe: 'g' }],
      ]),
      edgesByParent: new Map([
        [
          'p:p1',
          [
            {
              parent: { kind: 'product', id: 'p1' },
              child: { kind: 'ingredient', id: 'i1' },
              quantityNeta: netas[0]!,
              mermaPct: mermas[0]!,
            },
            {
              parent: { kind: 'product', id: 'p1' },
              child: { kind: 'ingredient', id: 'i2' },
              quantityNeta: netas[1]!,
              mermaPct: mermas[1]!,
            },
          ],
        ],
      ]),
    };
    return { graph, mermas, netas };
  }

  it('es lineal en la cantidad: pedir el doble consume exactamente el doble', () => {
    for (const seed of seeds(RUNS)) {
      const { graph } = buildGraph(seed);
      const rng = rngFrom(seed + 1);
      const n = rng.int(1, 50);
      const uno = expandRecipe(graph, { kind: 'product', id: 'p1' }, 1);
      const enes = expandRecipe(graph, { kind: 'product', id: 'p1' }, n);
      for (const [id, e] of enes) {
        expect(e.totalQuantity, `semilla ${seed}, insumo ${id}`).toBeCloseTo(
          uno.get(id)!.totalQuantity * n,
          6,
        );
      }
    }
  });

  it('más merma consume más insumo bruto, y nunca menos que la cantidad neta', () => {
    for (const seed of seeds(RUNS)) {
      const { graph, netas } = buildGraph(seed);
      const exp = expandRecipe(graph, { kind: 'product', id: 'p1' }, 1);
      // La merma solo puede AGREGAR consumo: bruto = neta / (1 − merma) ≥ neta.
      expect(exp.get('i1')!.totalQuantity, `semilla ${seed}`).toBeGreaterThanOrEqual(netas[0]! - 1e-9);
      expect(exp.get('i2')!.totalQuantity, `semilla ${seed}`).toBeGreaterThanOrEqual(netas[1]! - 1e-9);
    }
  });

  it('un nivel y recursivo coinciden cuando la receta no tiene subproductos', () => {
    for (const seed of seeds(RUNS)) {
      const { graph } = buildGraph(seed);
      const rng = rngFrom(seed + 2);
      const n = rng.int(1, 20);
      const rec = expandRecipe(graph, { kind: 'product', id: 'p1' }, n);
      const uno = expandRecipeOneLevel(graph, { kind: 'product', id: 'p1' }, n);
      for (const [id, e] of rec) {
        expect(uno.ingredients.get(id)!.totalQuantity, `semilla ${seed}, ${id}`).toBeCloseTo(
          e.totalQuantity,
          6,
        );
      }
    }
  });
});

describe('computeBreakEven — propiedades', () => {
  it('vender el equilibrio deja el resultado recurrente en 0, para cualquier estructura de costos', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const revenue = rng.int(100_000, 100_000_000);
      const cogsPct = rng.float(0.05, 0.7);
      const wastePct = rng.float(0, 0.1);
      const cortesiaPct = rng.float(0, 0.05);
      const refundPct = rng.float(0, 0.05);
      const totalFixed = rng.int(0, 30_000_000);

      const r = computeBreakEven({
        revenue,
        cogs: revenue * cogsPct,
        wasteCost: revenue * wastePct,
        cortesiaCost: revenue * cortesiaPct,
        refundCost: revenue * refundPct,
        totalFixed,
      });
      if (r.breakEven === null) continue;

      // A ese nivel de ventas, con los mismos porcentajes, los fijos quedan
      // exactamente cubiertos. Es LA definición del punto de equilibrio.
      const v = r.breakEven;
      const neto = v - v * cogsPct - v * wastePct - v * cortesiaPct - v * refundPct - totalFixed;
      expect(Math.abs(neto), `semilla ${seed}: neto ${neto} en el equilibrio`).toBeLessThan(
        Math.max(1, v * 1e-9),
      );
    }
  });

  it('el equilibrio honesto nunca es MENOR que el del margen bruto', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const revenue = rng.int(100_000, 100_000_000);
      const cogs = revenue * rng.float(0.05, 0.7);
      const totalFixed = rng.int(1, 30_000_000);
      const r = computeBreakEven({
        revenue,
        cogs,
        wasteCost: revenue * rng.float(0, 0.1),
        cortesiaCost: revenue * rng.float(0, 0.05),
        refundCost: revenue * rng.float(0, 0.05),
        totalFixed,
      });
      if (r.breakEven === null) continue;
      const optimista = totalFixed / ((revenue - cogs) / revenue);
      expect(r.breakEven, `semilla ${seed}`).toBeGreaterThanOrEqual(optimista - 1e-6);
    }
  });

  it('más pérdidas variables ⇒ equilibrio más alto (monotonía)', () => {
    for (const seed of seeds(RUNS)) {
      const rng = rngFrom(seed);
      const base = {
        revenue: rng.int(1_000_000, 50_000_000),
        cogs: 0,
        cortesiaCost: 0,
        refundCost: 0,
        totalFixed: rng.int(100_000, 10_000_000),
      };
      base.cogs = base.revenue * rng.float(0.1, 0.5);
      const poca = computeBreakEven({ ...base, wasteCost: base.revenue * 0.01 });
      const mucha = computeBreakEven({ ...base, wasteCost: base.revenue * 0.15 });
      if (poca.breakEven === null || mucha.breakEven === null) continue;
      expect(mucha.breakEven, `semilla ${seed}`).toBeGreaterThan(poca.breakEven);
    }
  });
});
