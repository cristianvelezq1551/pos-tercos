import { describe, expect, it } from 'vitest';
import {
  buildCortesiaAlertMessage,
  buildCostIncreaseAlertMessage,
  buildManualDiscountAlertMessage,
  buildNoSaleDrawerAlertMessage,
  buildVoidAlertMessage,
} from './owner-alerts';

describe('buildVoidAlertMessage', () => {
  it('incluye recibo, monto, cajero y motivo', () => {
    const msg = buildVoidAlertMessage({
      businessName: 'Tercos',
      cashierName: 'Laura',
      receiptNumber: 412,
      total: 28500,
      reason: 'Cliente se arrepintió',
    });
    expect(msg).toContain('[Tercos]');
    expect(msg).toContain('#412');
    expect(msg).toContain('28.500');
    expect(msg).toContain('Laura');
    expect(msg).toContain('Cliente se arrepintió');
  });

  it('tolera cajero desconocido', () => {
    const msg = buildVoidAlertMessage({
      businessName: 'Tercos',
      cashierName: null,
      receiptNumber: 5,
      total: 1000,
      reason: 'test',
    });
    expect(msg).toContain('desconocido');
  });
});

describe('buildNoSaleDrawerAlertMessage', () => {
  it('incluye cajero y motivo', () => {
    const msg = buildNoSaleDrawerAlertMessage({
      businessName: 'Tercos',
      cashierName: 'Laura',
      reason: 'Cambio para el turno',
    });
    expect(msg).toContain('Cajón abierto sin venta');
    expect(msg).toContain('Laura');
    expect(msg).toContain('Cambio para el turno');
  });
});

describe('buildCostIncreaseAlertMessage', () => {
  it('lista cada item con costo viejo → nuevo y % de suba', () => {
    const msg = buildCostIncreaseAlertMessage({
      businessName: 'Tercos',
      supplierName: 'Distribuidora Norte',
      items: [
        { name: 'Pan brioche', oldUnitCost: 10000, newUnitCost: 11800 },
        { name: 'Queso', oldUnitCost: 40000, newUnitCost: 50000 },
      ],
    });
    expect(msg).toContain('Distribuidora Norte');
    expect(msg).toContain('Pan brioche');
    expect(msg).toContain('+18%');
    expect(msg).toContain('+25%');
    expect(msg).toContain('10.000');
    expect(msg).toContain('11.800');
  });

  it('funciona sin proveedor', () => {
    const msg = buildCostIncreaseAlertMessage({
      businessName: 'Tercos',
      supplierName: null,
      items: [{ name: 'Pan', oldUnitCost: 100, newUnitCost: 200 }],
    });
    expect(msg).not.toContain(' de null');
    expect(msg).toContain('+100%');
  });
});

/**
 * Todas las alertas al dueño llegan mezcladas con sus chats personales: si cada
 * una arranca distinto, tiene que abrirlas para saber si son del negocio.
 */
describe('formato común de las alertas al dueño', () => {
  const base = { businessName: 'Tercos', cashierName: 'Laura', reason: 'motivo' };
  const todas = [
    buildVoidAlertMessage({ ...base, receiptNumber: 1, total: 1000 }),
    buildVoidAlertMessage({ ...base, receiptNumber: 1, total: 1000, kind: 'refund' }),
    buildNoSaleDrawerAlertMessage(base),
    buildManualDiscountAlertMessage({
      ...base, receiptNumber: 1, customerName: null, subtotal: 1000, discountTotal: 100, total: 900,
    }),
    buildCortesiaAlertMessage({ ...base, quantity: 1, productName: 'Burger', costAmount: 3000 }),
    buildCostIncreaseAlertMessage({
      businessName: 'Tercos', supplierName: null,
      items: [{ name: 'Pan', oldUnitCost: 100, newUnitCost: 200 }],
    }),
  ];

  it('arrancan con [negocio] *título* y una línea en blanco', () => {
    for (const msg of todas) expect(msg).toMatch(/^\[Tercos\] \*[^*]+\*\n\n/);
  });

  it('ningún mensaje lleva emoji fuera del plano básico', () => {
    // Los de 4 bytes llegaban como `�` en el teléfono del dueño (2026-08-24).
    for (const msg of todas) {
      expect([...msg].every((c) => c.codePointAt(0)! <= 0xffff)).toBe(true);
    }
  });

  it('un reembolso no se lee igual que una anulación', () => {
    expect(todas[0]).toContain('Venta anulada');
    expect(todas[1]).toContain('Reembolso');
  });

  it('la cortesía dice quién la dio y cuánto costó', () => {
    expect(todas[4]).toContain('Laura');
    expect(todas[4]).toContain('$3.000');
  });
});
