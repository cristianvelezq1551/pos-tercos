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
    payments: [{ method: 'CASH', amount: 10_000, amountReceived: 10_000 }],
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
          { method: 'CASH', amount: 12_000, amountReceived: 20_000 },
          { method: 'TRANSFER', amount: 18_000, amountReceived: null },
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
