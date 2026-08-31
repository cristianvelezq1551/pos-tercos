import { describe, expect, it } from 'vitest';
import type { Sale } from '@pos-tercos/types';
import { matchesLens, sumSales } from './sales-lens';

const venta = (over: Partial<Sale>): Sale =>
  ({
    id: 'x',
    total: 10_000,
    subtotal: 10_000,
    discountTotal: 0,
    deliveryFee: 0,
    ...over,
  }) as Sale;

describe('lentes del listado de ventas', () => {
  it('"con descuento" deja pasar solo las rebajadas', () => {
    expect(matchesLens(venta({ discountTotal: 2_000 }), 'descuento')).toBe(true);
    expect(matchesLens(venta({ discountTotal: 0 }), 'descuento')).toBe(false);
  });

  it('"con domicilio" deja pasar solo las que cobraron envío', () => {
    expect(matchesLens(venta({ deliveryFee: 7_000 }), 'domicilio')).toBe(true);
    expect(matchesLens(venta({ deliveryFee: 0 }), 'domicilio')).toBe(false);
  });

  it('"todas" no filtra nada', () => {
    expect(matchesLens(venta({}), 'todas')).toBe(true);
  });
});

describe('totales del pie', () => {
  /**
   * La razón de ser de la columna: el dueño la suma a mano. Si la fila mostrara
   * el total bruto, un domicilio metería en la cuenta la plata del repartidor
   * y el resultado no cuadraría con "Ingresos" (§7.v24 / §7.v30).
   */
  it('el domicilio NO entra en lo que queda en el negocio', () => {
    const t = sumSales([
      venta({ total: 45_000, deliveryFee: 7_000 }),
      venta({ total: 12_000, deliveryFee: 0 }),
    ]);
    expect(t.net).toBe(38_000 + 12_000);
    expect(t.delivery).toBe(7_000);
  });

  it('la suma de las filas visibles da exactamente el pie', () => {
    const ventas = [
      venta({ total: 45_000, deliveryFee: 7_000, discountTotal: 3_000, subtotal: 48_000 }),
      venta({ total: 12_000 }),
      venta({ total: 30_000, deliveryFee: 5_000 }),
    ];
    const filas = ventas.map((s) => s.total - s.deliveryFee);
    expect(filas.reduce((a, b) => a + b, 0)).toBe(sumSales(ventas).net);
  });

  it('filtrando, el pie habla de lo que se está viendo', () => {
    const ventas = [venta({ total: 10_000, discountTotal: 1_000 }), venta({ total: 90_000 })];
    const visibles = ventas.filter((s) => matchesLens(s, 'descuento'));
    expect(sumSales(visibles).net).toBe(10_000);
    expect(sumSales(visibles).discount).toBe(1_000);
  });
});
