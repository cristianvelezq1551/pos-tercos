// @vitest-environment jsdom
import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BreakEvenCard } from './BreakEvenCard';

/**
 * Los números son los de septiembre de 2026 en producción, que son los que el
 * dueño miró y no entendió: la barra decía 55% y se llenaba al 37%, la meta
 * ignoraba las fugas, y nada decía que el mes iba por el día 13 de 30.
 */
const base = (o: Partial<MonthlyFinancialStatement> = {}): MonthlyFinancialStatement =>
  ({
    year: 2026,
    month: 9,
    monthLabel: 'septiembre 2026',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    periodDaysTotal: 30,
    periodDaysElapsed: 13,
    periodInProgress: true,
    projectedRevenue: null,
    projectedNet: null,
    revenue: 9_412_000,
    discountTotal: 0,
    grossRevenue: 9_412_000,
    cogs: 3_632_546,
    cogsPartial: false,
    cogsEstimated: true,
    grossMargin: 5_779_454,
    grossMarginPct: 0.6141,
    fixedCosts: [],
    totalFixed: 9_869_000,
    oneTimeCost: 383_800,
    payablesPaidCost: 0,
    payablesPaidCount: 0,
    cortesiasCost: 135_889,
    cortesiasCostPartial: false,
    cortesiasCostEstimated: true,
    refundCost: 0,
    wasteCost: 45_459,
    wasteCostEstimated: true,
    shrinkageCost: 279_396,
    shrinkageCostEstimated: true,
    freightCost: 113_000,
    freightInvoiceCount: 11,
    purchasedTotal: 4_861_047,
    deliveryCollected: 0,
    deliveryOrderCount: 0,
    salesCount: 182,
    netResult: -5_047_090,
    contributionMargin: 5_205_710,
    contributionMarginPct: 0.5531,
    breakEvenBase: 10_252_800,
    breakEven: 18_537_213,
    breakEvenCoverage: 0.5078,
    catalogBreakEven: {
      target: 17_098_466,
      marginPct: 0.5996,
      weightedBySales: true,
      productsConsidered: 29,
      productsWithoutCost: 0,
      worst: { name: 'Uva 1500ml', marginPct: 0.3 },
      best: { name: 'Doble smash', marginPct: 0.7 },
      coverage: 0.5504,
    },
    ...o,
  }) as MonthlyFinancialStatement;

const anchoDeLaBarra = (c: HTMLElement): number =>
  Number((c.querySelector('.bg-warning, .bg-success') as HTMLElement).style.width.replace('%', ''));

describe('BreakEvenCard', () => {
  it('la meta usa el margen REALIZADO, no el de la carta, cuando hay ventas', () => {
    render(<BreakEvenCard s={base()} />);
    // $18.537.213, no $17.098.466: la de la carta ignora merma, cortesías,
    // faltantes y fletes, y vendiéndola el mes igual cierra en pérdida.
    expect(screen.getByText('$ 18.537.213')).toBeTruthy();
    expect(screen.queryByText('$ 17.098.466')).toBeNull();
    expect(screen.getByText('$55')).toBeTruthy();
  });

  it('con pocas ventas cae a la meta de la carta y lo dice', () => {
    render(<BreakEvenCard s={base({ salesCount: 4 })} />);
    expect(screen.getByText('$ 17.098.466')).toBeTruthy();
    expect(screen.getByText('$60')).toBeTruthy();
  });

  it('la barra se llena lo mismo que dice el número', () => {
    const { container } = render(<BreakEvenCard s={base()} />);
    const cobertura = 9_412_000 / 18_537_213;
    expect(anchoDeLaBarra(container)).toBeCloseTo(cobertura * 100, 1);
    expect(screen.getByText(`${Math.round(cobertura * 100)}%`)).toBeTruthy();
  });

  it('la barra nunca se pasa de 100 aunque se venda el doble de la meta', () => {
    const { container } = render(<BreakEvenCard s={base({ revenue: 40_000_000 })} />);
    expect(anchoDeLaBarra(container)).toBe(100);
    expect(screen.getByText(/ya cubre todo lo que hay que pagar/)).toBeTruthy();
  });

  it('marca el día de hoy y dice si se va adelantado', () => {
    render(<BreakEvenCard s={base()} />);
    expect(screen.getByText(/vas por el día 13 de 30/)).toBeTruthy();
    // 51% de la meta con 43% del mes corrido: adelantado.
    expect(screen.getByText('vas adelantado')).toBeTruthy();
  });

  it('dice "vas corto" cuando las ventas van detrás del calendario', () => {
    render(<BreakEvenCard s={base({ revenue: 3_000_000 })} />);
    expect(screen.getByText('vas corto')).toBeTruthy();
  });

  it('un mes terminado no muestra marca de hoy', () => {
    render(
      <BreakEvenCard
        s={base({ periodInProgress: false, periodDaysElapsed: 30 })}
      />,
    );
    expect(screen.queryByText(/vas por el día/)).toBeNull();
    expect(screen.queryByText('vas adelantado')).toBeNull();
  });

  it('sin meta que cubrir no muestra un faltante negativo', () => {
    render(
      <BreakEvenCard
        s={base({ breakEvenBase: 0, breakEven: 0, catalogBreakEven: { ...base().catalogBreakEven, target: 0 } })}
      />,
    );
    expect(screen.getByText(/no hay meta que cubrir/)).toBeTruthy();
  });
});
