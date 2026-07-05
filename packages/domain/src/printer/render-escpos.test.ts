/**
 * Tests del renderer ESC/POS (FASE 15.C). El output es bytes binarios,
 * así que validamos:
 *  - Comando init al principio (ESC @).
 *  - Comando cut al final (GS V).
 *  - Que el nombre del producto y total aparezcan en el buffer (latin1).
 *  - Reprint label cuando aplica.
 *  - Drawer kick command es la secuencia esperada.
 */

import { describe, it, expect } from 'vitest';
import { DRAWER_KICK, renderReceiptEscPos } from './render-escpos';
import type { ReceiptData } from './types';

const RECEIPT_BASE: ReceiptData = {
  receiptNumber: 42,
  createdAt: '2026-05-04T15:30:00.000Z',
  cashierName: 'Juan',
  customerName: null,
  items: [
    {
      productName: 'Burger Nashville',
      sizeName: null,
      quantity: 2,
      unitPrice: 18000,
      lineSubtotal: 36000,
      lineDiscount: 0,
      lineTotal: 36000,
      appliedPromotionName: null,
      modifiers: [],
    },
  ],
  subtotal: 36000,
  discountTotal: 0,
  total: 36000,
  reprintLabel: null,
  business: {
    name: 'Tercos',
    address: 'Cra 43A # 11-12',
    nit: '900.123.456-7',
    phone: '+57 300 123 4567',
  },
};

describe('renderReceiptEscPos', () => {
  it('comienza con ESC @ (init) y termina con GS V (cut)', () => {
    const out = renderReceiptEscPos(RECEIPT_BASE);
    // ESC @ = 0x1B 0x40
    expect(out[0]).toBe(0x1b);
    expect(out[1]).toBe(0x40);
    // Verifica que el cut command (0x1D 0x56 0x01) aparece al final
    const lastBytes = out.slice(out.length - 3);
    expect(lastBytes[0]).toBe(0x1d);
    expect(lastBytes[1]).toBe(0x56);
    expect(lastBytes[2]).toBe(0x01);
  });

  it('contiene el nombre del producto y el total', () => {
    const out = renderReceiptEscPos(RECEIPT_BASE);
    const text = out.toString('latin1');
    expect(text).toContain('Burger Nashville');
    expect(text).toContain('TOTAL');
    expect(text).toContain('$36.000');
  });

  it('imprime "RECIBO #<n>" (reemplazo del bloque de turno eliminado)', () => {
    const out = renderReceiptEscPos(RECEIPT_BASE);
    const text = out.toString('latin1');
    expect(text).toContain('RECIBO #42');
    expect(text).not.toContain('TURNO');
  });

  it('imprime el número PROVISIONAL en grande para ventas offline', () => {
    const out = renderReceiptEscPos({ ...RECEIPT_BASE, provisionalNumber: 'OFF-7' });
    const text = out.toString('latin1');
    expect(text).toContain('PROVISIONAL');
    expect(text).toContain('OFF-7');
  });

  it('omite el bloque provisional en ventas online (sin provisionalNumber)', () => {
    const out = renderReceiptEscPos(RECEIPT_BASE);
    const text = out.toString('latin1');
    expect(text).not.toContain('PROVISIONAL');
  });

  it('imprime DUPLICADO label cuando reprintLabel está set', () => {
    const out = renderReceiptEscPos({
      ...RECEIPT_BASE,
      reprintLabel: 'DUPLICADO',
    });
    const text = out.toString('latin1');
    expect(text).toContain('DUPLICADO');
  });

  it('omite "Cliente:" cuando customerName es null', () => {
    const out = renderReceiptEscPos(RECEIPT_BASE);
    const text = out.toString('latin1');
    expect(text).not.toContain('Cliente:');
  });

  it('incluye Cliente: cuando customerName está set', () => {
    const out = renderReceiptEscPos({
      ...RECEIPT_BASE,
      customerName: 'María',
    });
    const text = out.toString('latin1');
    expect(text).toContain('Cliente: María');
  });

  it('renderiza descuento cuando hay promo', () => {
    const out = renderReceiptEscPos({
      ...RECEIPT_BASE,
      items: [
        {
          ...RECEIPT_BASE.items[0],
          lineDiscount: 3600,
          lineTotal: 32400,
          appliedPromotionName: '20% off',
        },
      ],
      discountTotal: 3600,
      total: 32400,
    });
    const text = out.toString('latin1');
    expect(text).toContain('20% off');
    expect(text).toContain('-$3.600');
    expect(text).toContain('Descuentos');
  });

  it('DRAWER_KICK es la secuencia ESC p 0 50 50', () => {
    expect(DRAWER_KICK).toEqual(Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32]));
  });
});
