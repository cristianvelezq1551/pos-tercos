import { describe, expect, it } from 'vitest';
import { renderShortageListHtml, type ShortageListDoc } from './render-shortage-list';

const ITEM = {
  name: 'Pan',
  quantity: 4,
  unitPurchase: 'paquete',
  equivalence: '48 unidad',
  currentStock: -28,
  thresholdMin: 20,
  unitStock: 'unidad',
  estTotal: 72000,
  supplierName: 'Distripan',
  note: null,
};

const BASE: ShortageListDoc = {
  businessName: 'Tercos',
  title: 'Lista de faltantes',
  issuedOnLabel: '26 de agosto de 2026',
  requestedBy: 'Cristian',
  notes: null,
  items: [ITEM],
  estTotal: 72000,
  itemsWithoutCost: 0,
};

describe('renderShortageListHtml', () => {
  it('muestra existencias, mínimo, lo que falta y la cantidad a comprar', () => {
    const html = renderShortageListHtml(BASE);
    expect(html).toContain('-28 / 20 unidad');
    expect(html).toContain('faltan 48');
    expect(html).toContain('4 paquete');
    expect(html).toContain('48 unidad');
  });

  it('con varios proveedores agrupa por proveedor', () => {
    const html = renderShortageListHtml({
      ...BASE,
      items: [ITEM, { ...ITEM, name: 'Queso', supplierName: 'Lácteos SA' }],
    });
    expect(html).toContain('Distripan');
    expect(html).toContain('Lácteos SA');
    expect(html).toContain('tr class="group"');
  });

  it('con un solo proveedor NO pone encabezado de grupo (sería un rótulo repetido)', () => {
    expect(renderShortageListHtml(BASE)).not.toContain('tr class="group"');
  });

  it('los ítems sin proveedor caen bajo un rótulo explícito', () => {
    const html = renderShortageListHtml({
      ...BASE,
      items: [ITEM, { ...ITEM, name: 'Servilletas', supplierName: null }],
    });
    expect(html).toContain('Sin proveedor asignado');
  });

  it('avisa que el total está incompleto cuando hay ítems sin costo', () => {
    const html = renderShortageListHtml({
      ...BASE,
      items: [ITEM, { ...ITEM, name: 'Sal', estTotal: null }],
      itemsWithoutCost: 1,
    });
    expect(html).toContain('Total estimado (incompleto)');
    expect(html).toContain('no tiene costo conocido');
  });

  it('escapa el HTML de los nombres', () => {
    const html = renderShortageListHtml({
      ...BASE,
      items: [{ ...ITEM, name: '<img src=x>' }],
    });
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img');
  });
});
