// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { Shift } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import type { ShiftSummary } from '../lib/shift-summary';
import { ShiftZReport } from './ShiftZReport';

/**
 * El cierre imprimía el CODE del medio de pago: decía "TRANSFER (12)" donde el
 * cajero lee "Transferencia". Es el papel con el que se cuadra la plata, así
 * que un nombre técnico ahí es exactamente donde no va.
 */
const turno = { id: 's1', openingCash: 100_000 } as unknown as Shift;

const resumen = (byMethod: ShiftSummary['byMethod']): ShiftSummary =>
  ({
    byMethod,
    cashSalesTotal: 49_500,
    totalSales: 497_100,
    countSales: 16,
    deliveryCashCollected: 0,
  }) as unknown as ShiftSummary;

describe('reporte de cierre', () => {
  it('nombra el medio como lo llama el dueño, no por su código', () => {
    render(
      <ShiftZReport
        shift={turno}
        summary={resumen({ TRANSFER: { total: 447_600, count: 12 } })}
        expectedCash={149_500}
        nombresDeMedios={{ TRANSFER: 'Transferencia' }}
      />,
    );
    expect(screen.getByText('Transferencia (12)')).toBeDefined();
    expect(screen.queryByText('TRANSFER (12)')).toBeNull();
  });

  it('sin catálogo cae al nombre conocido, nunca al código', () => {
    render(
      <ShiftZReport
        shift={turno}
        summary={resumen({ TRANSFER: { total: 447_600, count: 12 } })}
        expectedCash={149_500}
      />,
    );
    expect(screen.getByText('Transferencia (12)')).toBeDefined();
  });

  it('un medio que el dueño creó se muestra con SU nombre', () => {
    render(
      <ShiftZReport
        shift={turno}
        summary={resumen({ RAPPI: { total: 30_000, count: 2 } })}
        expectedCash={149_500}
        nombresDeMedios={{ RAPPI: 'Rappi' }}
      />,
    );
    expect(screen.getByText('Rappi (2)')).toBeDefined();
  });
});
