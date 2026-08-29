import { describe, expect, it } from 'vitest';
import { computeBreakEven } from './break-even';

/**
 * La propiedad que define al punto de equilibrio: vendiendo EXACTAMENTE
 * `breakEven`, el resultado neto recurrente da 0. Si la fórmula no cumple
 * esto, el número no sirve para decidir nada.
 */
function netoRecurrenteEn(
  ventas: number,
  ratios: { cogs: number; waste: number; cortesia: number; refund: number },
  totalFixed: number,
): number {
  const cogs = ventas * ratios.cogs;
  const waste = ventas * ratios.waste;
  const cortesia = ventas * ratios.cortesia;
  const refund = ventas * ratios.refund;
  return ventas - cogs - waste - cortesia - refund - totalFixed;
}

describe('computeBreakEven', () => {
  it('vender exactamente el equilibrio deja el neto en 0', () => {
    const ratios = { cogs: 0.35, waste: 0.03, cortesia: 0.01, refund: 0.01 };
    const revenue = 20_000_000;
    const totalFixed = 6_000_000;
    const r = computeBreakEven({
      revenue,
      cogs: revenue * ratios.cogs,
      wasteCost: revenue * ratios.waste,
      cortesiaCost: revenue * ratios.cortesia,
      refundCost: revenue * ratios.refund,
      freightCost: 0,
      totalFixed,
    });
    expect(r.breakEven).not.toBeNull();
    expect(netoRecurrenteEn(r.breakEven!, ratios, totalFixed)).toBeCloseTo(0, 6);
  });

  it('el equilibrio honesto es MÁS ALTO que el del margen bruto', () => {
    const revenue = 20_000_000;
    const cogs = 7_000_000;
    const totalFixed = 6_000_000;
    const perdidas = { wasteCost: 600_000, cortesiaCost: 200_000, refundCost: 200_000, freightCost: 0 };

    const honesto = computeBreakEven({ revenue, cogs, ...perdidas, totalFixed });
    // El cálculo viejo: solo margen bruto, sin merma/cortesías/reembolsos.
    const optimista = totalFixed / ((revenue - cogs) / revenue);

    expect(honesto.breakEven!).toBeGreaterThan(optimista);
    // Con estos números: 9.230.769 (viejo) vs 10.000.000 (honesto).
    expect(Math.round(optimista)).toBe(9_230_769);
    expect(Math.round(honesto.breakEven!)).toBe(10_000_000);
  });

  it('las pérdidas variables bajan el margen de contribución', () => {
    const base = { revenue: 1_000_000, cogs: 400_000, totalFixed: 300_000 };
    const sinPerdidas = computeBreakEven({
      ...base,
      wasteCost: 0,
      cortesiaCost: 0,
      refundCost: 0,
      freightCost: 0,
    });
    const conPerdidas = computeBreakEven({
      ...base,
      wasteCost: 50_000,
      cortesiaCost: 30_000,
      refundCost: 20_000,
      freightCost: 0,
    });
    expect(sinPerdidas.contributionMargin).toBe(600_000);
    expect(sinPerdidas.contributionMarginPct).toBeCloseTo(0.6, 10);
    expect(conPerdidas.contributionMargin).toBe(500_000);
    expect(conPerdidas.contributionMarginPct).toBeCloseTo(0.5, 10);
    expect(conPerdidas.breakEven!).toBeGreaterThan(sinPerdidas.breakEven!);
  });

  it('la cobertura pasa de 1 justo cuando las ventas superan el equilibrio', () => {
    const mk = (revenue: number) =>
      computeBreakEven({
        revenue,
        cogs: revenue * 0.5,
        wasteCost: 0,
        cortesiaCost: 0,
        refundCost: 0,
        freightCost: 0,
        totalFixed: 1_000_000,
      });
    expect(mk(2_000_000).breakEvenCoverage).toBeCloseTo(1, 10);
    expect(mk(3_000_000).breakEvenCoverage!).toBeGreaterThan(1);
    expect(mk(1_000_000).breakEvenCoverage!).toBeLessThan(1);
  });

  it('sin ingresos no hay porcentaje ni equilibrio que calcular', () => {
    const r = computeBreakEven({
      revenue: 0,
      cogs: 0,
      wasteCost: 0,
      cortesiaCost: 0,
      refundCost: 0,
      freightCost: 0,
      totalFixed: 5_000_000,
    });
    expect(r.contributionMarginPct).toBeNull();
    expect(r.breakEven).toBeNull();
    expect(r.breakEvenCoverage).toBeNull();
  });

  it('con margen de contribución negativo NO existe equilibrio (no inventa un número)', () => {
    // Se vende por debajo del costo: ningún volumen cubre los fijos.
    const r = computeBreakEven({
      revenue: 1_000_000,
      cogs: 1_100_000,
      wasteCost: 50_000,
      cortesiaCost: 0,
      refundCost: 0,
      freightCost: 0,
      totalFixed: 300_000,
    });
    expect(r.contributionMargin).toBe(-150_000);
    expect(r.contributionMarginPct).toBeCloseTo(-0.15, 10);
    expect(r.breakEven).toBeNull();
    expect(r.breakEvenCoverage).toBeNull();
  });

  it('sin costos fijos el equilibrio es 0 y la cobertura no se calcula', () => {
    const r = computeBreakEven({
      revenue: 1_000_000,
      cogs: 400_000,
      wasteCost: 0,
      cortesiaCost: 0,
      refundCost: 0,
      freightCost: 0,
      totalFixed: 0,
    });
    expect(r.breakEven).toBe(0);
    expect(r.breakEvenCoverage).toBeNull();
  });

  /**
   * El flete de compra es variable: todos los proveedores lo cobran por pedido
   * (ninguno con tarifa fija mensual), así que escala con las compras, que
   * escalan con la venta. Dejarlo fuera del margen de contribución repetiría el
   * error que ya se corrigió con la merma: un equilibrio más bajo que el real.
   */
  it('el flete de compra baja el margen de contribución igual que la merma', () => {
    const base = {
      revenue: 1_000_000,
      cogs: 400_000,
      wasteCost: 0,
      cortesiaCost: 0,
      refundCost: 0,
      totalFixed: 300_000,
    };
    const sinFlete = computeBreakEven({ ...base, freightCost: 0 });
    const conFlete = computeBreakEven({ ...base, freightCost: 50_000 });
    const conMerma = computeBreakEven({ ...base, freightCost: 0, wasteCost: 50_000 });

    expect(sinFlete.contributionMargin).toBe(600_000);
    expect(conFlete.contributionMargin).toBe(550_000);
    // Un peso de flete pesa exactamente lo mismo que un peso de merma.
    expect(conFlete.contributionMargin).toBe(conMerma.contributionMargin);
    expect(conFlete.breakEven!).toBe(conMerma.breakEven!);
  });

  it('con flete el equilibrio sube: hay que vender más para cubrir los fijos', () => {
    const base = {
      revenue: 10_000_000,
      cogs: 4_000_000,
      wasteCost: 0,
      cortesiaCost: 0,
      refundCost: 0,
      totalFixed: 3_000_000,
    };
    const sinFlete = computeBreakEven({ ...base, freightCost: 0 });
    const conFlete = computeBreakEven({ ...base, freightCost: 300_000 });

    expect(conFlete.breakEven!).toBeGreaterThan(sinFlete.breakEven!);
    // 3M / 0,60 = 5.000.000  vs  3M / 0,57 = 5.263.157
    expect(Math.round(sinFlete.breakEven!)).toBe(5_000_000);
    expect(Math.round(conFlete.breakEven!)).toBe(5_263_158);
  });
});
