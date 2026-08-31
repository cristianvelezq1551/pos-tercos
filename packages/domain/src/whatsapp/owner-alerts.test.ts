import { describe, expect, it } from 'vitest';
import {
  buildCortesiaAlertMessage,
  buildCostIncreaseAlertMessage,
  buildLowStockAlertMessage,
  buildManualDiscountAlertMessage,
  buildNoSaleDrawerAlertMessage,
  buildVoidAlertMessage,
  splitOwnerAlert,
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
    buildLowStockAlertMessage({
      businessName: 'Tercos',
      items: [{ name: 'Pan', currentStock: 21, thresholdMin: 30, unitStock: 'unidad' }],
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

describe('buildLowStockAlertMessage', () => {
  const items = [
    { name: 'Pan', currentStock: 21, thresholdMin: 30, unitStock: 'unidad' },
    { name: 'Pollo', currentStock: 2500, thresholdMin: 3000, unitStock: 'g' },
  ];

  it('dice cuántos son y cuánto le falta a cada uno', () => {
    const msg = buildLowStockAlertMessage({ businessName: 'Tercos', items });
    expect(msg).toContain('2 insumos cruzaron el mínimo');
    expect(msg).toContain('Pan: 21 de 30 unidad');
    expect(msg).toContain('Pollo: 2.500 de 3.000 g');
  });

  it('concuerda en singular', () => {
    const msg = buildLowStockAlertMessage({ businessName: 'Tercos', items: [items[0]] });
    expect(msg).toContain('1 insumo cruzó el mínimo');
    expect(msg).not.toContain('insumos');
  });

  it('un recorte se declara: la lista nunca se da por completa', () => {
    const msg = buildLowStockAlertMessage({ businessName: 'Tercos', items, hiddenCount: 5 });
    expect(msg).toContain('y 5 más');
    // El conteo suma los ocultos: 2 mostrados + 5 = 7.
    expect(msg).toContain('7 insumos cruzaron el mínimo');
  });

  it('las cantidades con decimales se leen con coma', () => {
    const msg = buildLowStockAlertMessage({
      businessName: 'Tercos',
      items: [{ name: 'Queso', currentStock: 1.5, thresholdMin: 2, unitStock: 'kg' }],
    });
    expect(msg).toContain('Queso: 1,5 de 2 kg');
  });
});

describe('splitOwnerAlert', () => {
  it('parte el formato canónico en título y cuerpo', () => {
    const { title, body } = splitOwnerAlert(
      buildVoidAlertMessage({
        businessName: 'Tercos', cashierName: 'Laura', receiptNumber: 412,
        total: 28500, reason: 'Se arrepintió',
      }),
    );
    expect(title).toBe('Tercos · Venta anulada');
    expect(body.startsWith('Recibo: #412')).toBe(true);
    expect(body).not.toContain('[Tercos]');
  });

  it('un texto ajeno al formato se devuelve entero: nunca se pierde', () => {
    const { title, body } = splitOwnerAlert('algo escrito a mano');
    expect(title).toBe('Aviso');
    expect(body).toBe('algo escrito a mano');
  });

  it('el cuerpo conserva sus saltos de línea', () => {
    const { body } = splitOwnerAlert('[Tercos] *Stock bajo*\n\nuno\ndos\n\ntres');
    expect(body).toBe('uno\ndos\n\ntres');
  });
});
