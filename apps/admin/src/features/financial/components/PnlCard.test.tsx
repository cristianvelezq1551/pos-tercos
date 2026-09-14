// @vitest-environment jsdom
import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PnlCard } from './PnlCard';

/**
 * Un costo fijo sin pago registrado se muestra con el monto de la ficha. Si
 * la pantalla no lo dijera, el dueño leería un estimado como dato — el mismo
 * error que un COGS estimado sin aviso. Lo que se fija acá es el contrato:
 * la línea estimada lleva el rótulo, la pagada no.
 */
const statement = (fixedCosts: MonthlyFinancialStatement['fixedCosts']): MonthlyFinancialStatement => ({
  year: 2026,
  month: 9,
  monthLabel: 'septiembre 2026',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  revenue: 4_637_000,
  discountTotal: 0,
  grossRevenue: 4_637_000,
  cogs: 1_563_525,
  cogsPartial: false,
  cogsEstimated: false,
  grossMargin: 3_073_475,
  grossMarginPct: 0.663,
  fixedCosts,
  totalFixed: fixedCosts.filter((c) => !c.isOneTime).reduce((a, c) => a + c.monthlyAmount, 0),
  oneTimeCost: fixedCosts.filter((c) => c.isOneTime).reduce((a, c) => a + c.monthlyAmount, 0),
  payablesPaidCost: 0,
  payablesPaidCount: 0,
  cortesiasCost: 0,
  cortesiasCostPartial: false,
  cortesiasCostEstimated: false,
  refundCost: 0,
  wasteCost: 0,
  wasteCostEstimated: false,
  shrinkageCost: 0,
  shrinkageCostEstimated: false,
  freightCost: 0,
  freightInvoiceCount: 0,
  purchasedTotal: 0,
  deliveryCollected: 0,
  deliveryOrderCount: 0,
  salesCount: 95,
  netResult: 0,
  contributionMargin: 3_073_475,
  contributionMarginPct: 0.663,
  breakEvenBase: fixedCosts.reduce((a, c) => a + c.monthlyAmount, 0),
  breakEven: null,
  breakEvenCoverage: null,
  catalogBreakEven: {
    target: null,
    marginPct: null,
    weightedBySales: false,
    productsConsidered: 0,
    productsWithoutCost: 0,
    worst: null,
    best: null,
    coverage: null,
  },
});

describe('PnlCard rotula el costo fijo sin pago como estimado', () => {
  it('la línea sin pago lleva "estimado"; la pagada y la nómina, no', () => {
    render(
      <PnlCard
        s={statement([
          { fixedCostId: null, name: 'Nómina (mes completo)', category: 'Nómina', monthlyAmount: 2_650_000, isPayroll: true, isOneTime: false, isEstimated: false },
          { fixedCostId: 'a', name: 'Arriendo', category: 'Alquiler', monthlyAmount: 1_680_000, isPayroll: false, isOneTime: false, isEstimated: false },
          { fixedCostId: 'b', name: 'Servicios', category: 'Servicios', monthlyAmount: 900_000, isPayroll: false, isOneTime: false, isEstimated: true },
          { fixedCostId: 'c', name: 'Horno', category: 'Equipos', monthlyAmount: 800_000, isPayroll: false, isOneTime: true, isEstimated: true },
        ])}
      />,
    );
    const rotulos = screen.getAllByText('estimado');
    expect(rotulos).toHaveLength(2);
    expect(rotulos[0]!.closest('li')!.textContent).toContain('Servicios');
    expect(rotulos[1]!.closest('li')!.textContent).toContain('Horno');
    expect(screen.getByText('Arriendo').closest('li')!.textContent).not.toContain('estimado');
    expect(screen.getByText('Nómina (mes completo)').closest('li')!.textContent).not.toContain('estimado');
  });

  it('sin líneas estimadas no aparece el rótulo', () => {
    render(
      <PnlCard
        s={statement([
          { fixedCostId: 'a', name: 'Arriendo', category: 'Alquiler', monthlyAmount: 1_680_000, isPayroll: false, isOneTime: false, isEstimated: false },
        ])}
      />,
    );
    expect(screen.queryByText('estimado')).toBeNull();
  });
});

describe('PnlCard distingue un mes en curso de uno cerrado', () => {
  const conPeriodo = (o: Partial<MonthlyFinancialStatement>): MonthlyFinancialStatement => ({
    ...statement([
      { fixedCostId: null, name: 'Nómina (mes completo)', category: 'Nómina', monthlyAmount: 6_890_000, isPayroll: true, isOneTime: false, isEstimated: false },
    ]),
    netResult: -5_047_090,
    ...o,
  });

  it('a mitad de mes NO dice que cerró, dice por qué día va', () => {
    render(
      <PnlCard s={conPeriodo({ periodInProgress: true, periodDaysElapsed: 13, periodDaysTotal: 30 })} />,
    );
    expect(screen.getByText('Así va el mes · día 13 de 30')).toBeTruthy();
    expect(screen.queryByText(/El mes cerró en pérdida/)).toBeNull();
    expect(screen.getByText(/se endereza al vender/)).toBeTruthy();
  });

  it('cuando el mes terminó sí dice cómo cerró', () => {
    render(<PnlCard s={conPeriodo({ periodInProgress: false })} />);
    expect(screen.getByText('Resultado neto del mes')).toBeTruthy();
    expect(screen.getByText(/El mes cerró en pérdida/)).toBeTruthy();
  });

  it('con el mes en curso muestra en cuánto cierra al ritmo actual', () => {
    render(
      <PnlCard
        s={conPeriodo({
          periodInProgress: true,
          periodDaysElapsed: 13,
          periodDaysTotal: 30,
          projectedRevenue: 21_720_000,
          projectedNet: 1_758_000,
        })}
      />,
    );
    expect(screen.getByText(/el mes cierra alrededor de/)).toBeTruthy();
    expect(screen.getByText('$ 1.758.000')).toBeTruthy();
  });

  it('sin proyección no inventa una', () => {
    render(
      <PnlCard s={conPeriodo({ periodInProgress: true, periodDaysElapsed: 2, periodDaysTotal: 30, projectedNet: null })} />,
    );
    expect(screen.queryByText(/el mes cierra alrededor de/)).toBeNull();
  });

  it('un mes en curso YA en verde no dice que va en rojo', () => {
    render(
      <PnlCard s={conPeriodo({ periodInProgress: true, periodDaysElapsed: 25, periodDaysTotal: 30, netResult: 900_000 })} />,
    );
    expect(screen.getByText(/ya cubres los costos completos del mes/)).toBeTruthy();
    expect(screen.queryByText(/va en rojo/)).toBeNull();
  });

  it('un mes que todavía no empieza no dice que cerró', () => {
    render(<PnlCard s={conPeriodo({ periodStatus: 'future', periodInProgress: false })} />);
    expect(screen.getByText('Mes que todavía no empieza')).toBeTruthy();
    expect(screen.queryByText(/El mes cerró/)).toBeNull();
  });

  it('avisa que los costos son del mes completo mientras el mes corre', () => {
    render(
      <PnlCard s={conPeriodo({ periodInProgress: true, periodDaysElapsed: 13, periodDaysTotal: 30 })} />,
    );
    expect(screen.getAllByText(/mes completo/).length).toBeGreaterThan(1);
    expect(screen.getByText('Nómina pendiente')).toBeTruthy();
  });
});
