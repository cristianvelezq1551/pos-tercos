import type { Sale } from '@pos-tercos/types';
import { describe, expect, it } from 'vitest';
import { computeShiftSummary } from './shift-summary';

let seq = 0;
const sale = (over: Partial<Sale> = {}): Sale =>
  ({
    id: `00000000-0000-4000-8000-0000000000${String(20 + seq++).padStart(2, '0')}`,
    receiptNumber: 100 + seq,
    type: 'COUNTER',
    status: 'ENTREGADO',
    subtotal: 10_000,
    discountTotal: 0,
    total: 10_000,
    paymentMethod: 'CASH',
    customerName: null,
    customerPhone: null,
    customerNit: null,
    notes: null,
    voidReason: null,
    cashierId: null,
    cashierName: null,
    shiftId: null,
    paidAt: new Date('2026-06-10T12:00:00Z').toISOString(),
    createdAt: new Date('2026-06-10T12:00:00Z').toISOString(),
    payments: [
      {
        id: 'p1',
        createdAt: '2026-06-10T12:00:00.000Z',
        method: 'CASH',
        amount: 10_000,
        amountReceived: 10_000,
      },
    ],
    ...over,
  }) as Sale;

describe('computeShiftSummary', () => {
  it('excluye pendientes, anuladas y canceladas del ingreso; cuenta VOID aparte', () => {
    const r = computeShiftSummary([
      sale(),
      sale({ status: 'PENDIENTE_PAGO' }),
      sale({ status: 'VOID' }),
      sale({ status: 'CANCELADO_NO_PAGO' }),
    ]);
    expect(r.countSales).toBe(1);
    expect(r.totalSales).toBe(10_000);
    expect(r.voidCount).toBe(1);
  });

  it('una cuenta DIVIDIDA aporta su parte a cada método', () => {
    const r = computeShiftSummary([
      sale({
        total: 30_000,
        paymentMethod: null,
        payments: [
          {
            id: 'p2',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'CASH',
            amount: 12_000,
            amountReceived: 20_000,
          },
          {
            id: 'p3',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'TRANSFER',
            amount: 18_000,
            amountReceived: null,
          },
        ],
      } as Partial<Sale>),
    ]);
    expect(r.byMethod.CASH).toEqual({ count: 1, total: 12_000 });
    expect(r.byMethod.TRANSFER).toEqual({ count: 1, total: 18_000 });
    // El cajón solo espera la porción en efectivo.
    expect(r.cashSalesTotal).toBe(12_000);
  });

  it('sin payments[] cae al paymentMethod resumen (ventas legadas)', () => {
    const r = computeShiftSummary([
      sale({ paymentMethod: 'TRANSFER', payments: [] } as Partial<Sale>),
    ]);
    expect(r.byMethod.TRANSFER?.total).toBe(10_000);
    expect(r.cashSalesTotal).toBe(0);
  });
});

/**
 * §7.v30: el domicilio es plata del repartidor y se le paga AL ENTREGAR, así
 * que al cerrar ya salió de todos los medios. Ni lo vendido ni lo cobrado por
 * método lo cuentan; el envío se reporta aparte.
 *
 * Estos casos son el espejo cliente de `ShiftsService.computeExpectedCash` /
 * `computeDigitalExpected`: si divergen, el badge "En caja" y el Z-report
 * contradicen al esperado del server justo por el monto del envío.
 */
describe('computeShiftSummary — domicilios', () => {
  it('lo vendido NO cuenta el envío, y el envío se reporta aparte', () => {
    const r = computeShiftSummary([
      sale({
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        total: 61_000,
        deliveryFee: 11_000,
        paymentMethod: 'TRANSFER',
        payments: [
          {
            id: 'p4',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'TRANSFER',
            amount: 61_000,
            amountReceived: 61_000,
          },
        ],
      }),
    ]);
    expect(r.totalSales).toBe(50_000);
    expect(r.deliveryCollected).toBe(11_000);
  });

  it('lo cobrado por método va NETO del envío', () => {
    const r = computeShiftSummary([
      sale({
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        total: 61_000,
        deliveryFee: 11_000,
        paymentMethod: 'TRANSFER',
        payments: [
          {
            id: 'p5',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'TRANSFER',
            amount: 61_000,
            amountReceived: 61_000,
          },
        ],
      }),
    ]);
    expect(r.byMethod.TRANSFER?.total).toBe(50_000);
    // El invariante que hace que el arqueo cuadre: nada se pierde ni sobra.
    const sumaMedios = Object.values(r.byMethod).reduce((a, m) => a + m.total, 0);
    expect(sumaMedios).toBe(r.totalSales);
  });

  /**
   * El caso que importa para el arqueo: al domiciliario se le paga en el
   * momento, así que del efectivo del pedido solo queda en el cajón lo de la
   * comida. Esperar los 11.000 marcaría un faltante que no existe.
   */
  it('un domicilio en efectivo NO sube el efectivo esperado', () => {
    const r = computeShiftSummary([
      sale({
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        total: 61_000,
        deliveryFee: 11_000,
        paymentMethod: 'CASH',
        payments: [
          {
            id: 'p6',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'CASH',
            amount: 61_000,
            amountReceived: 61_000,
          },
        ],
      }),
    ]);
    expect(r.cashSalesTotal).toBe(50_000);
    // Lo que se llevó el repartidor queda reportado aparte.
    expect(r.deliveryCashCollected).toBe(11_000);
    expect(r.totalSales).toBe(50_000);
  });

  it('un domicilio por transferencia NO ensucia el efectivo esperado', () => {
    const r = computeShiftSummary([
      sale({
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        total: 61_000,
        deliveryFee: 11_000,
        paymentMethod: 'TRANSFER',
        payments: [
          {
            id: 'p7',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'TRANSFER',
            amount: 61_000,
            amountReceived: 61_000,
          },
        ],
      }),
    ]);
    expect(r.cashSalesTotal).toBe(0);
    expect(r.deliveryCashCollected).toBe(0);
  });

  it('cuenta dividida: el envío se prorratea por la parte pagada en efectivo', () => {
    const r = computeShiftSummary([
      sale({
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        total: 60_000,
        deliveryFee: 12_000,
        paymentMethod: null,
        payments: [
          {
            id: 'p8',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'CASH',
            amount: 30_000,
            amountReceived: 30_000,
          },
          {
            id: 'p9',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'TRANSFER',
            amount: 30_000,
            amountReceived: 30_000,
          },
        ],
      }),
    ]);
    // Mitad en efectivo → la mitad del envío se cobró en el cajón.
    expect(r.deliveryCashCollected).toBe(6_000);
    expect(r.deliveryCollected).toBe(12_000);
    // …y cada medio queda neto de SU mitad del envío.
    expect(r.cashSalesTotal).toBe(24_000);
    expect(r.byMethod.TRANSFER?.total).toBe(24_000);
    expect(r.totalSales).toBe(48_000);
  });

  /**
   * Regresión de la divergencia cliente/server: el badge "En caja" y el
   * respaldo del modal de cierre arman el esperado con esta misma fórmula que
   * usa `computeExpectedCash` en el server. Si vuelven a separarse, el cajero
   * ve un número y cuenta otro.
   */
  it('el efectivo esperado calculado acá coincide con el del server', () => {
    const openingCash = 100_000;
    const r = computeShiftSummary([
      sale({
        type: 'WEB_DELIVERY',
        status: 'PAGADO',
        total: 50_000,
        deliveryFee: 7_000,
        paymentMethod: 'CASH',
        payments: [
          {
            id: 'pA',
            createdAt: '2026-06-10T12:00:00.000Z',
            method: 'CASH',
            amount: 50_000,
            amountReceived: 50_000,
          },
        ],
      }),
    ]);
    expect(openingCash + r.cashSalesTotal).toBe(143_000);
  });

  it('una venta de mostrador sin envío no reporta domicilios', () => {
    const r = computeShiftSummary([sale({ status: 'PAGADO' })]);
    expect(r.deliveryCollected).toBe(0);
    expect(r.deliveryCashCollected).toBe(0);
    expect(r.totalSales).toBe(10_000);
  });
});
