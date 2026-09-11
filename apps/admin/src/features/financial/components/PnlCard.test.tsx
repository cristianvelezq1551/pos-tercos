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
          { fixedCostId: null, name: 'Nómina (auto)', category: 'Nómina', monthlyAmount: 2_650_000, isPayroll: true, isOneTime: false, isEstimated: false },
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
    expect(screen.getByText('Nómina (auto)').closest('li')!.textContent).not.toContain('estimado');
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
