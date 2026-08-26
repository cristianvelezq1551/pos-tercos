import { describe, expect, it } from 'vitest';
import { renderPurchaseOrderHtml, type PurchaseOrderDoc } from './render-purchase-order';

const BASE: PurchaseOrderDoc = {
  businessName: 'Tercos',
  businessPhone: '320 761 5261',
  businessAddress: 'Calle 1 # 2-3',
  supplierName: 'Panadería La Espiga',
  supplierPhone: '+573001112233',
  issuedOnLabel: '25 de agosto de 2026',
  neededByLabel: 'mañana, miércoles 26 de agosto',
  requestedBy: 'Cristian',
  items: [
    { name: 'Pan', quantity: 4, unitPurchase: 'paquete', equivalence: '48 unidad', estTotal: 72000 },
  ],
  estTotal: 72000,
};

describe('renderPurchaseOrderHtml', () => {
  it('incluye proveedor, cantidad y su equivalencia en unidad de inventario', () => {
    const html = renderPurchaseOrderHtml(BASE);
    expect(html).toContain('Panadería La Espiga');
    expect(html).toContain('4 paquete');
    expect(html).toContain('48 unidad');
    expect(html).toContain('$ 72.000');
  });

  it('deja claro que el costo es de referencia, no un precio acordado', () => {
    const html = renderPurchaseOrderHtml(BASE);
    expect(html).toContain('no es un precio');
  });

  it('sin costo conocido no inventa un total', () => {
    const html = renderPurchaseOrderHtml({
      ...BASE,
      items: [{ name: 'Pan', quantity: 4, unitPurchase: 'paquete', estTotal: null }],
      estTotal: null,
    });
    expect(html).toContain('—');
    expect(html).not.toContain('Total estimado');
  });

  it('escapa el HTML de los nombres (un proveedor puede llamarse <b>)', () => {
    const html = renderPurchaseOrderHtml({ ...BASE, supplierName: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
