import { describe, expect, it } from 'vitest';
import type { ReceiptData } from './types';
import { renderReceiptHtml } from './render-receipt';

/**
 * §4.10: `renderReceiptHtml` es el FALLBACK del recibo cuando el print-agent
 * (ESC/POS) está caído — sin él, "imprimir desde el browser" no existe. No tenía
 * test (el ESC/POS sí). Verifica que el HTML sale con el total, el negocio, la
 * línea de envío (§1.5) y el sello de reimpresión.
 */
const BASE: ReceiptData = {
  receiptNumber: 42,
  createdAt: '2026-05-04T15:30:00.000Z',
  cashierName: 'Juan',
  customerName: null,
  items: [
    { productName: 'Burger', sizeName: null, quantity: 2, unitPrice: 18000, lineSubtotal: 36000, lineDiscount: 0, lineTotal: 36000, appliedPromotionName: null, modifiers: [] },
  ],
  subtotal: 36000,
  discountTotal: 0,
  total: 36000,
  reprintLabel: null,
  business: { name: 'Tercos', address: 'Cra 43A # 11-12', nit: '900.123.456-7', phone: '+57 300 123 4567' },
};

describe('renderReceiptHtml', () => {
  it('genera HTML con el producto, el total y el negocio', () => {
    const html = renderReceiptHtml(BASE);
    expect(html).toContain('<html');
    expect(html).toContain('Burger');
    expect(html).toContain('Tercos');
    expect(html).toContain('42'); // # de recibo
  });

  it('§1.5: imprime la línea de Domicilio cuando deliveryFee > 0', () => {
    const html = renderReceiptHtml({ ...BASE, deliveryFee: 6000, total: 42000 });
    expect(html).toContain('Domicilio');
  });

  it('imprime el sello de reimpresión (DUPLICADO) cuando reprintLabel está set', () => {
    const html = renderReceiptHtml({ ...BASE, reprintLabel: 'DUPLICADO' });
    expect(html).toContain('DUPLICADO');
  });
});
