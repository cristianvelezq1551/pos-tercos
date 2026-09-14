// @vitest-environment jsdom
import type { MonthlyFinancialStatement } from '@pos-tercos/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PnlLossLines } from './PnlLossLines';

/**
 * El neto del mes resta estas líneas CON SU SIGNO. Una anulación de merma o de
 * cortesía netea contra el mes en que se declaró, y un conteo que encuentra de
 * más deshace faltantes viejos: cualquiera de las tres puede quedar negativa.
 *
 * Mientras se mostraban solo cuando eran positivas, la pantalla no cuadraba —
 * el dueño sumaba lo visible y no le daba el resultado de abajo, sin ninguna
 * pista de a dónde se había ido la diferencia.
 */
const base = (p: Partial<MonthlyFinancialStatement>): MonthlyFinancialStatement =>
  ({
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
    payablesPaidCost: 0,
    payablesPaidCount: 0,
    ...p,
  }) as MonthlyFinancialStatement;

describe('PnlLossLines muestra la pérdida aunque el mes la haya devuelto', () => {
  it('una merma anulada de más se ve como recuperación, no desaparece', () => {
    render(<PnlLossLines s={base({ wasteCost: -12_000 })} />);
    expect(screen.getByText(/Merma anulada/)).toBeTruthy();
    expect(screen.getByText('+$ 12.000')).toBeTruthy();
  });

  it('un conteo que encuentra de más deshace faltantes y lo dice', () => {
    render(<PnlLossLines s={base({ shrinkageCost: -8_500 })} />);
    expect(screen.getByText(/Faltantes corregidos al contar/)).toBeTruthy();
    expect(screen.getByText('+$ 8.500')).toBeTruthy();
    expect(screen.getByText(/encontraron MÁS de lo que decían los libros/)).toBeTruthy();
  });

  it('una cortesía anulada de más también vuelve al resultado', () => {
    render(<PnlLossLines s={base({ cortesiasCost: -3_000 })} />);
    expect(screen.getByText(/Cortesías anuladas/)).toBeTruthy();
    expect(screen.getByText('+$ 3.000')).toBeTruthy();
  });

  it('en positivo se sigue leyendo como pérdida, con el signo menos', () => {
    render(<PnlLossLines s={base({ wasteCost: 12_000, shrinkageCost: 8_500 })} />);
    expect(screen.getByText(/− Merma/)).toBeTruthy();
    expect(screen.getByText('−$ 12.000')).toBeTruthy();
    expect(screen.getByText(/− Faltantes/)).toBeTruthy();
    expect(screen.getByText('−$ 8.500')).toBeTruthy();
  });

  it('el aviso de "pesa tanto como la merma" no sale cuando el faltante se devolvió', () => {
    render(<PnlLossLines s={base({ wasteCost: 1_000, shrinkageCost: -5_000 })} />);
    expect(screen.queryByText(/vale la pena revisar porciones/)).toBeNull();
  });

  it('en cero la línea no se muestra (no hay nada que explicar)', () => {
    const { container } = render(<PnlLossLines s={base({})} />);
    expect(container.textContent).toBe('');
  });
});
