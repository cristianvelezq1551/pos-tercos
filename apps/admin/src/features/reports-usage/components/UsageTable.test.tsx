// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { InventoryUsageReport, InventoryUsageRow } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';

/**
 * «Uso y mermas» es la segunda pantalla donde el dueño ve el faltante de
 * conteo; la primera es el estado financiero. Desde §7.v43 las dos leen el
 * MISMO número —el costo real del lote que salió— y esa pérdida sí baja el
 * resultado del mes.
 *
 * Estos tests fijan que la pantalla no vuelva a decir lo contrario. El texto
 * viejo afirmaba que el faltante «es aproximado» y que «no entra al estado
 * financiero»: las dos cosas dejaron de ser ciertas cuando el backend empezó a
 * costearlo, y una pantalla que niega una pérdida que el P&G sí resta es el
 * mismo problema que este trabajo existe para cerrar (dos números para la
 * misma plata).
 */

import { UsageTable } from './UsageTable';

const fila = (over: Partial<InventoryUsageRow> = {}): InventoryUsageRow =>
  ({
    entityType: 'INGREDIENT',
    entityId: 'ing-1',
    name: 'Pan',
    unit: 'unidad',
    sales: 10,
    productionOut: 0,
    productionIn: 0,
    purchased: 0,
    waste: 0,
    adjustments: 0,
    wastePct: null,
    unitCost: 500,
    wasteCost: 0,
    wasteCostEstimated: false,
    shortageQty: 4,
    shortageCost: 2000,
    shortageCostEstimated: false,
    lostCost: 2000,
    ...over,
  }) as InventoryUsageRow;

const reporte = (rows: InventoryUsageRow[]): InventoryUsageReport =>
  ({
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-31T23:59:59.000Z',
    rows,
    totalWasteCost: 0,
    totalShortageCost: rows.reduce((a, r) => a + (r.shortageCost ?? 0), 0),
    unknownCostCount: rows.filter((r) => r.shortageCost === null).length,
  }) as InventoryUsageReport;

describe('UsageTable — el faltante que el P&G sí cobra', () => {
  it('no le dice al dueño que el faltante queda fuera del estado financiero', () => {
    render(<UsageTable report={reporte([fila()])} />);
    const leyenda = document.body.textContent ?? '';
    expect(leyenda).not.toContain('no entra al estado financiero');
    expect(leyenda).not.toContain('se estima al último precio de compra');
    // Y sí dice lo que ahora es cierto: es el costo real y baja el resultado.
    expect(leyenda).toContain('estado financiero');
  });

  it('un faltante con costo real se muestra SIN la tilde de aproximado', () => {
    render(<UsageTable report={reporte([fila({ shortageCost: 2000 })])} />);
    // Aparece en la tarjeta y en la fila; ninguna de las dos lleva tilde.
    expect(screen.getAllByText('$ 2.000').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('~$ 2.000')).toHaveLength(0);
  });

  it('solo lleva tilde el faltante que de verdad se estimó', () => {
    render(
      <UsageTable report={reporte([fila({ shortageCost: 2000, shortageCostEstimated: true })])} />,
    );
    expect(screen.getAllByText('~$ 2.000').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('$ 2.000')).toHaveLength(0);
  });

  it('«sin valorizar» es distinto de «no costó nada»', () => {
    render(<UsageTable report={reporte([fila({ shortageCost: null, lostCost: 0 })])} />);
    expect(screen.getByText('sin valorizar')).toBeDefined();
  });

  it('sin faltante en el período la columna queda en blanco, no en cero', () => {
    render(
      <UsageTable report={reporte([fila({ shortageQty: 0, shortageCost: 0, lostCost: 0 })])} />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
