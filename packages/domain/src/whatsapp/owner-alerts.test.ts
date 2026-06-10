import { describe, expect, it } from 'vitest';
import {
  buildCostIncreaseAlertMessage,
  buildNoSaleDrawerAlertMessage,
  buildVoidAlertMessage,
} from './owner-alerts';

describe('buildVoidAlertMessage', () => {
  it('incluye recibo, turno, monto, cajero y motivo', () => {
    const msg = buildVoidAlertMessage({
      businessName: 'Tercos',
      cashierName: 'Laura',
      receiptNumber: 412,
      turnNumber: 7,
      total: 28500,
      reason: 'Cliente se arrepintió',
    });
    expect(msg).toContain('[Tercos]');
    expect(msg).toContain('#412');
    expect(msg).toContain('turno 7');
    expect(msg).toContain('28.500');
    expect(msg).toContain('Laura');
    expect(msg).toContain('Cliente se arrepintió');
  });

  it('omite el turno cuando es null y tolera cajero desconocido', () => {
    const msg = buildVoidAlertMessage({
      businessName: 'Tercos',
      cashierName: null,
      receiptNumber: 5,
      turnNumber: null,
      total: 1000,
      reason: 'test',
    });
    expect(msg).not.toContain('turno');
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
    expect(msg).toContain('SIN venta');
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
