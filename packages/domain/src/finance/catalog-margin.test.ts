import { describe, expect, it } from 'vitest';
import { breakEvenFromCatalogMargin, computeCatalogMargin } from './catalog-margin';

const p = (
  name: string,
  price: number,
  cost: number | null,
  unitsSold = 0,
): Parameters<typeof computeCatalogMargin>[0][number] => ({
  productId: name,
  name,
  price,
  cost,
  unitsSold,
});

describe('margen de la carta', () => {
  it('el margen de un producto es (precio − costo) / precio', () => {
    // 20.000 con 7.000 de costo deja 65 %.
    const r = computeCatalogMargin([p('Burger', 20_000, 7_000)]);
    expect(r.marginPct).toBeCloseTo(0.65, 6);
  });

  it('sin ventas todavía, promedia la carta pareja', () => {
    const r = computeCatalogMargin([p('Burger', 20_000, 7_000), p('Gaseosa', 3_000, 1_800)]);
    expect(r.weightedBySales).toBe(false);
    expect(r.marginPct).toBeCloseTo((0.65 + 0.4) / 2, 6);
  });

  it('con ventas, pesa la MEZCLA: vender lo que menos deja baja el promedio', () => {
    const parejo = computeCatalogMargin([
      p('Burger', 20_000, 7_000, 10),
      p('Gaseosa', 3_000, 1_800, 10),
    ]);
    const soloBebida = computeCatalogMargin([
      p('Burger', 20_000, 7_000, 1),
      p('Gaseosa', 3_000, 1_800, 100),
    ]);
    expect(parejo.weightedBySales).toBe(true);
    expect(soloBebida.marginPct!).toBeLessThan(parejo.marginPct!);
    expect(soloBebida.marginPct!).toBeGreaterThan(0.4);
  });

  /**
   * La regla que no se puede relajar: lo que no se sabe NO vale cero. Un
   * producto sin costo con margen 0 % arrastraría el promedio hacia abajo, y
   * con costo 0 lo empujaría al 100 %. Las dos mienten.
   */
  it('un producto sin costo queda fuera y se reporta', () => {
    const r = computeCatalogMargin([p('Burger', 20_000, 7_000), p('Postre', 8_000, null)]);
    expect(r.marginPct).toBeCloseTo(0.65, 6);
    expect(r.productsConsidered).toBe(1);
    expect(r.productsWithoutCost).toBe(1);
  });

  it('sin ningún costo conocido dice que no sabe, en vez de inventar', () => {
    const r = computeCatalogMargin([p('Postre', 8_000, null)]);
    expect(r.marginPct).toBeNull();
    expect(r.productsWithoutCost).toBe(1);
  });

  it('un precio en 0 no cuenta (producto sin configurar)', () => {
    const r = computeCatalogMargin([p('Sin precio', 0, 0), p('Burger', 20_000, 7_000)]);
    expect(r.productsConsidered).toBe(1);
    expect(r.marginPct).toBeCloseTo(0.65, 6);
  });

  it('señala el que menos deja y el que más', () => {
    const r = computeCatalogMargin([
      p('Burger', 20_000, 7_000),
      p('Gaseosa', 3_000, 1_800),
      p('Papas', 6_000, 1_200),
    ]);
    expect(r.worst?.name).toBe('Gaseosa');
    expect(r.best?.name).toBe('Papas');
  });

  it('un producto que se vende por debajo del costo da margen negativo', () => {
    const r = computeCatalogMargin([p('Regalado', 1_000, 1_500)]);
    expect(r.marginPct).toBeLessThan(0);
  });
});

describe('equilibrio a partir del margen de la carta', () => {
  it('con 62 % de margen, $2.680.000 fijos se cubren vendiendo ~$4,32M', () => {
    expect(breakEvenFromCatalogMargin(2_680_000, 0.62)).toBeCloseTo(4_322_580.6, 1);
  });

  it('vendiendo el equilibrio, lo que queda cubre exactamente lo fijo', () => {
    const fijos = 2_680_000;
    const be = breakEvenFromCatalogMargin(fijos, 0.62)!;
    expect(be * 0.62).toBeCloseTo(fijos, 6);
  });

  /** Con margen ≤ 0 no hay volumen que alcance: devolver un número sería mentir. */
  it('sin margen positivo no hay equilibrio', () => {
    expect(breakEvenFromCatalogMargin(1_000_000, 0)).toBeNull();
    expect(breakEvenFromCatalogMargin(1_000_000, -0.1)).toBeNull();
    expect(breakEvenFromCatalogMargin(1_000_000, null)).toBeNull();
  });

  it('el equilibrio SIEMPRE es mayor que los costos fijos (los productos cuestan)', () => {
    for (const margen of [0.3, 0.5, 0.65, 0.9]) {
      expect(breakEvenFromCatalogMargin(2_680_000, margen)!).toBeGreaterThan(2_680_000);
    }
  });
});
